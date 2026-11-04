#!/usr/bin/env node
/**
 * import-wpcom.mjs: WordPress.com → MDX, one folder per post.
 *
 *   node scripts/import-wpcom.mjs            # fetch live, write only posts that don't exist yet
 *   node scripts/import-wpcom.mjs --force    # overwrite existing post folders too
 *   node scripts/import-wpcom.mjs --offline  # reuse data/wpcom/*.json instead of the API
 *   node scripts/import-wpcom.mjs --only=2234,2235
 *
 * Reads the public REST API (published content only; no auth, no subscriber data).
 * Writes:
 *   src/content/posts/YYYY-MM-DD-slug/index.mdx  + images/audio/video beside it
 *   src/content/pages/<slug>/index.mdx
 *   src/data/tag-slugs.json        tag names whose WordPress slug isn't the obvious one
 *   data/wpcom/posts.json          frozen copy of what WordPress served (authors stripped)
 *   data/wpcom/pages.json, comments.json (no emails, IPs or avatars), sitemap.xml
 *   data/wpcom/wordcounts.json     per-URL word counts, the baseline for check-wordcount.mjs
 *   data/import-report.json        everything that didn't convert 1:1
 *
 * Conversion: the HTML is first walked as a DOM. Anything that should become an MDX
 * component (images, embeds, galleries, buttons, tables, audio, video, verse) is replaced
 * by a token paragraph (XMDXBLOCK7X). Turndown then converts only prose, and the tokens are
 * swapped for single-line JSX afterwards, so turndown never sees component markup.
 */
import fs from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import TurndownService from 'turndown';
import sharp from 'sharp';
import { countWords } from './lib/text.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'musingsofmy.today';
const API = `https://public-api.wordpress.com/rest/v1.1/sites/${SITE}`;
const UA = 'musingsofmy.today-importer/1.0 (+https://github.com/justadakaje/musingsofmy.today)';
const MAX_ASSET_BYTES = 24 * 1024 * 1024; // Cloudflare Pages rejects files over 25 MiB

const args = new Set(process.argv.slice(2).filter((a) => !a.includes('=')));
const kv = Object.fromEntries(process.argv.slice(2).filter((a) => a.includes('=')).map((a) => a.replace(/^--/, '').split('=')));
const OFFLINE = args.has('--offline');
const FORCE = args.has('--force');
const ONLY = kv.only ? new Set(kv.only.split(',').map(Number)) : null;

// ---------------------------------------------------------------- sections (PLAN.md)
// Lane for each WordPress category. A post goes to the lane most of its categories
// point at; ties go to the more specific lane (TIE_ORDER). OVERRIDES fixes posts whose
// WordPress categories were simply wrong (e.g. SharePoint posts filed under Nature).
const LANE = {
  Technology: 'engineering', AI: 'engineering', Gaming: 'engineering', Design: 'engineering', Business: 'engineering',
  History: 'history-politics', Politics: 'history-politics', Government: 'history-politics', 'True Crime': 'history-politics',
  Science: 'science-nature', Nature: 'science-nature', Biology: 'science-nature', Space: 'science-nature', Plants: 'science-nature', Animals: 'science-nature',
  Music: 'signal', 'Playlist Explained': 'signal', LyricalAnalysis: 'signal',
  Writings: 'field-notes', Poetry: 'field-notes', Cigars: 'field-notes', Food: 'field-notes', Films: 'field-notes',
  Travel: 'field-notes', Finance: 'field-notes', 'Mini Motorways': 'field-notes', 'calaveras literarias': 'field-notes',
};
const TIE_ORDER = ['signal', 'field-notes', 'history-politics', 'science-nature', 'engineering'];
const OVERRIDES = {
  1080: ['engineering', 'Y2K38 is a software-time bug; WordPress tied History and Technology'],
  370: ['engineering', 'SharePoint branding post, filed under Nature on WordPress'],
  299: ['engineering', 'Microsoft registration-pages post, filed under Nature on WordPress'],
  320: ['signal', 'Chevelle lyric analysis, filed under Nature on WordPress'],
};

function pickSection(post, cats) {
  if (OVERRIDES[post.ID]) return { section: OVERRIDES[post.ID][0], note: OVERRIDES[post.ID][1] };
  const score = {};
  for (const c of cats) if (LANE[c]) score[LANE[c]] = (score[LANE[c]] || 0) + 1;
  const best = Object.entries(score).sort((a, b) => b[1] - a[1] || TIE_ORDER.indexOf(a[0]) - TIE_ORDER.indexOf(b[0]))[0];
  if (!best) return { section: 'field-notes', note: `no mapped category (${cats.join(', ') || 'none'}); defaulted` };
  return { section: best[0] };
}

const SHOW_BY_APPLE = { id1887004265: 'runtime-reality', id1831231439: 'chronos-archive' };
const SHOW_BY_SPOTIFY = { '7dApwSu5skMv03dZHTZEIK': 'runtime-reality', '5ZkuVRGr2KvzQQA2iBwg2k': 'chronos-archive' };

// ---------------------------------------------------------------- helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url) {
  for (let i = 0; i < 3; i++) {
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    if (res.ok) return res.json();
    if (i === 2) throw new Error(`${res.status} ${url}`);
    await sleep(1500 * (i + 1));
  }
}

async function getText(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

const decoder = parseHTML('<!doctype html><html><body></body></html>').document;
function decode(s) {
  const el = decoder.createElement('div');
  el.innerHTML = s ?? '';
  return el.textContent;
}
function stripHtml(s) {
  return decode(String(s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** YAML scalar: JSON strings are valid YAML double-quoted scalars. */
const q = (s) => JSON.stringify(String(s));
const qa = (arr) => `[${arr.map(q).join(', ')}]`;
/** JSX attribute value that survives any characters. */
const jsx = (s) => `{${JSON.stringify(String(s ?? ''))}}`;

function safeFileName(name, used) {
  let decoded = name;
  try {
    decoded = decodeURIComponent(name);
  } catch {}
  let base = decoded.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!base || base.startsWith('.')) base = `file${base}`;
  let out = base;
  let i = 2;
  while (used.has(out)) {
    const ext = path.extname(base);
    out = `${path.basename(base, ext)}-${i++}${ext}`;
  }
  used.add(out);
  return out;
}

/** Canonical original of a WordPress-hosted media URL, or null if it isn't WordPress-hosted. */
function wpOriginal(url) {
  if (!url) return null;
  let u;
  try {
    u = new URL(url, 'https://musingsofmy.today');
  } catch {
    return null;
  }
  if (/^i[0-3]\.wp\.com$/.test(u.hostname)) {
    const [host, ...rest] = u.pathname.slice(1).split('/');
    u = new URL(`https://${host}/${rest.join('/')}`);
  }
  const host = u.hostname.replace(/^www\./, '');
  const isUpload =
    (/^(musingsofmy\.today|musingsofmytoday\.wordpress\.com)$/.test(host) && u.pathname.startsWith('/wp-content/uploads/')) ||
    host === 'musingsofmytoday.files.wordpress.com' ||
    host === 'videos.files.wordpress.com';
  if (!isUpload) return null;
  return `https://${u.hostname}${u.pathname}`;
}

/** Internal links: old absolute URLs → site-relative paths. */
function rewriteHref(href, ctx) {
  if (!href || href.startsWith('#') || !/^(https?:)?\/\//i.test(href) && !href.startsWith('/')) return href;
  let u;
  try {
    u = new URL(href, 'https://musingsofmy.today');
  } catch {
    return href;
  }
  const host = u.hostname.replace(/^www\./, '');
  if (!/^(musingsofmy\.today|musingsofmytoday\.wordpress\.com)$/.test(host)) return href;
  if (u.pathname.startsWith('/wp-content/')) return href; // media; handled by the caller
  const p = u.searchParams.get('p') || u.searchParams.get('page_id');
  if (p && ctx.pathById.has(Number(p))) return ctx.pathById.get(Number(p)) + u.hash;
  const cat = /^\/category\/(.+?)\/?$/.exec(u.pathname);
  if (cat) {
    const name = ctx.categoryBySlugPath.get(cat[1]);
    if (name && LANE[name]) return `/section/${LANE[name]}/`;
    if (cat[1] === 'podcast') return '/podcasts/';
  }
  return (u.pathname.endsWith('/') || path.extname(u.pathname) ? u.pathname : `${u.pathname}/`) + u.search + u.hash;
}

/**
 * Originals are capped at 2000 px on the long edge: Astro never serves more than 1440 px,
 * and full-size phone photos would make the repo several hundred MB. GIFs are left alone
 * (animation). Smaller images are kept byte-for-byte.
 */
const MAX_EDGE = 2000;
const MAX_BYTES = 1.5 * 1024 * 1024;
sharp.cache(false); // on Windows a cached input file stays locked, and the write-back fails
async function shrink(file) {
  if (!/\.(jpe?g|png|webp)$/i.test(file)) return false;
  const input = await fs.readFile(file);
  const img = sharp(input, { failOn: 'none' });
  const m = await img.metadata();
  if (Math.max(m.width ?? 0, m.height ?? 0) <= MAX_EDGE && input.length <= MAX_BYTES) return false;
  let out = img.rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
  if (m.format === 'jpeg') out = out.jpeg({ quality: 86, mozjpeg: true });
  else if (m.format === 'png') out = out.png({ compressionLevel: 9, effort: 8 });
  else if (m.format === 'webp') out = out.webp({ quality: 86 });
  const buf = await out.toBuffer();
  if (buf.length >= input.length) return false; // already as small as it gets (e.g. a flat PNG)
  await fs.writeFile(file, buf);
  return true;
}

async function download(url, dest, report) {
  if (existsSync(dest) && statSync(dest).size > 0) {
    // Already downloaded on an earlier run; still apply the size cap (a no-op once applied).
    if (await shrink(dest).catch((e) => report.warn(`could not resize ${path.basename(dest)}: ${e.message}`))) report.resized?.();
    return true;
  }
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(dest, buf);
      if (await shrink(dest).catch((e) => report.warn(`could not resize ${path.basename(dest)}: ${e.message}`))) report.resized?.();
      return true;
    } catch (e) {
      if (i === 2) {
        report.warn(`download failed: ${url} (${e.message})`);
        return false;
      }
      await sleep(1000 * (i + 1));
    }
  }
}

// ---------------------------------------------------------------- turndown
function makeTurndown() {
  const td = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
  });
  // MDX treats { } as expressions and < as JSX, so escape them in prose.
  const baseEscape = td.escape.bind(td);
  td.escape = (s) => baseEscape(s).replace(/(?<!\\)([{}<])/g, '\\$1');
  td.addRule('pre-plain', {
    filter: (n) => n.nodeName === 'PRE' && !(n.firstChild && n.firstChild.nodeName === 'CODE'),
    replacement: (_c, n) => `\n\n\`\`\`text\n${n.textContent.replace(/\n+$/, '')}\n\`\`\`\n\n`,
  });
  td.addRule('supsub', {
    filter: ['sup', 'sub'],
    replacement: (c, n) => (c.trim() ? `<${n.nodeName.toLowerCase()}>${c}</${n.nodeName.toLowerCase()}>` : ''),
  });
  td.addRule('strike', { filter: ['del', 's', 'strike'], replacement: (c) => (c.trim() ? `~~${c}~~` : '') });
  return td;
}

// ---------------------------------------------------------------- per-document conversion
async function convert(html, ctx, report) {
  const { document } = parseHTML(`<!doctype html><html><body><div id="root">${html}</div></body></html>`);
  const root = document.getElementById('root');
  const blocks = [];
  const imports = [];
  const td = ctx.td;

  const token = (code) => {
    blocks.push(code);
    const p = document.createElement('p');
    p.textContent = `XMDXBLOCK${blocks.length - 1}X`;
    return p;
  };
  /**
   * Put a block token where `node` is. If `node` sits inside a paragraph, split the paragraph
   * around it so a <figure> never nests inside a <p> and the text order is kept.
   */
  const place = (node, code) => {
    const t = token(code);
    const para = node.closest ? node.closest('p') : null;
    if (!para || para === node) return node.replaceWith(t);
    let top = node;
    while (top.parentNode !== para) top = top.parentNode;
    if (top !== node && top.textContent.trim() !== node.textContent.trim()) report.warn('text sharing a link with an image was dropped');
    const after = document.createElement('p');
    while (top.nextSibling) after.appendChild(top.nextSibling);
    top.remove();
    para.after(t);
    const hasContent = (el) => el.textContent.trim() || el.querySelector('img, iframe');
    if (hasContent(after)) t.after(after);
    if (!hasContent(para)) para.remove();
    else report.note('image split out of a paragraph');
  };
  const inlineMd = (el) => (el ? td.turndown(el.innerHTML).replace(/\s*\n+\s*/g, ' ').trim() : '');

  let mediaIndex = 0;
  async function localAsset(url, kind) {
    const orig = wpOriginal(url);
    if (!orig) return null;
    if (ctx.assetByUrl.has(orig)) return ctx.assetByUrl.get(orig);
    const name = safeFileName(path.basename(new URL(orig).pathname), ctx.usedNames);
    const dest = path.join(ctx.dir, name);
    const ok = await download(orig, dest, report);
    if (!ok) return null;
    let file = name;
    if (statSync(dest).size > MAX_ASSET_BYTES) {
      if (/\.wav$/i.test(name) && ctx.ffmpeg) {
        const mp3 = name.replace(/\.wav$/i, '.mp3');
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', dest, '-codec:a', 'libmp3lame', '-b:a', '128k', path.join(ctx.dir, mp3)]);
        await fs.unlink(dest);
        report.note(`transcoded ${name} → ${mp3} (WAV was over Cloudflare's 25 MiB file limit)`);
        file = mp3;
      } else {
        await fs.unlink(dest);
        report.warn(`${name} is over 25 MiB; kept as a remote link to WordPress`);
        return null;
      }
    }
    const id = `${kind}${++mediaIndex}`;
    imports.push(`import ${id} from './${file}';`);
    const rec = { id, file, orig };
    ctx.assetByUrl.set(orig, rec);
    ctx.stats.media++;
    return rec;
  }

  // 0. Noise: scripts, styles, inline SVG icons, spacers, empty media-text bodies.
  root.querySelectorAll('script, style, noscript, .wp-block-spacer').forEach((n) => n.remove());
  root.querySelectorAll('svg').forEach((n) => n.remove());
  root.querySelectorAll('img.wp-smiley, img.emoji').forEach((n) => n.replaceWith(document.createTextNode(n.getAttribute('alt') || '')));
  // WordPress.com's code block renders each line as <div class="cm-line"> (CodeMirror);
  // turn them back into newline-separated text or the whole block collapses onto one line.
  root.querySelectorAll('pre .cm-line').forEach((line) => line.replaceWith(document.createTextNode(`${line.textContent}\n`)));
  root.querySelectorAll('pre > code').forEach((code) => {
    if (code.lastChild?.nodeType === 3) code.lastChild.textContent = code.lastChild.textContent.replace(/\n+$/, '');
  });
  // Reblog cards show the original author's 32 px Gravatar next to the source link; the link stays.
  root.querySelectorAll('img.avatar').forEach((n) => n.remove());
  if (root.querySelector('.wpcom-reblog-snapshot')) report.note('WordPress.com reblog: quotes another blog’s post, with a link to it');
  root.querySelectorAll('form').forEach((n) => {
    report.warn('form removed (Jetpack forms do not survive a static site)');
    n.remove();
  });

  // 1. Embeds (Gutenberg figures, classic iframes, VideoPress).
  const embedFor = async (src, title, fallbackUrl) => {
    const s = src || fallbackUrl || '';
    let m;
    // Playlists first: /embed?listType=playlist&list=PL…, /embed/videoseries?list=…, /playlist?list=…
    if (/youtube(?:-nocookie)?\.com\/(?:embed\/?(?:videoseries)?\?|playlist\?)/.test(s) && (m = /[?&]list=([\w-]+)/.exec(s))) {
      ctx.stats.embeds.youtube = (ctx.stats.embeds.youtube || 0) + 1;
      return { code: `<YouTube playlist="${m[1]}" title=${jsx(title || 'YouTube playlist')}`, kind: 'youtube-playlist', url: `https://www.youtube.com/playlist?list=${m[1]}` };
    }
    if ((m = /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(s))) {
      ctx.stats.embeds.youtube = (ctx.stats.embeds.youtube || 0) + 1;
      return { code: `<YouTube id="${m[1]}" title=${jsx(title || 'YouTube video')}`, kind: 'youtube', url: `https://www.youtube.com/watch?v=${m[1]}` };
    }
    if ((m = /open\.spotify\.com\/(?:embed\/)?(episode|track|playlist|album|show|artist)\/([A-Za-z0-9]+)/.exec(s))) {
      ctx.stats.embeds.spotify = (ctx.stats.embeds.spotify || 0) + 1;
      const t = (title || '').replace(/^Spotify Embed:\s*/, '') || 'Spotify';
      return { code: `<Spotify type="${m[1]}" id="${m[2]}" title=${jsx(t)}`, kind: 'spotify', url: `https://open.spotify.com/${m[1]}/${m[2]}`, title: t };
    }
    if ((m = /(?:embed\.)?podcasts\.apple\.com(\/[^#\s"']+)/.exec(s))) {
      ctx.stats.embeds.apple_podcasts = (ctx.stats.embeds.apple_podcasts || 0) + 1;
      return { code: `<ApplePodcasts path=${jsx(m[1])}`, kind: 'apple-podcasts', url: `https://podcasts.apple.com${m[1]}` };
    }
    if ((m = /(?:embed\.)?music\.apple\.com(\/[^#\s"']+)/.exec(s))) {
      ctx.stats.embeds.apple_music = (ctx.stats.embeds.apple_music || 0) + 1;
      return { code: `<AppleMusic path=${jsx(m[1])}`, kind: 'apple-music', url: `https://music.apple.com${m[1]}` };
    }
    if ((m = /(?:video\.wordpress\.com|videopress\.com)\/(?:embed|v)\/([A-Za-z0-9]+)/.exec(s))) {
      const meta = await getJSON(`https://public-api.wordpress.com/rest/v1.1/videos/${m[1]}`).catch(() => null);
      const vid = meta?.original ? await localAsset(meta.original, 'video') : null;
      const poster = meta?.poster ? await localAsset(meta.poster, 'poster') : null;
      if (vid) {
        ctx.stats.embeds.videopress = (ctx.stats.embeds.videopress || 0) + 1;
        report.note(`VideoPress video ${m[1]} downloaded (it would stop playing once the WordPress plan ends)`);
        return { code: `<Video src={${vid.id}}${poster ? ` poster={${poster.id}}` : ''} title=${jsx(meta.title || 'Video')}`, kind: 'video' };
      }
      report.warn(`VideoPress video ${m[1]} could not be downloaded; linked instead`);
    }
    ctx.stats.embeds.other = (ctx.stats.embeds.other || 0) + 1;
    const url = fallbackUrl || src;
    report.warn(`embed without a component, rendered as a link card: ${url}`);
    return { code: `<LinkCard href=${jsx(url)} label=${jsx(title || url)}`, kind: 'link' };
  };
  const closeWith = (open, captionMd) => (captionMd ? `${open}>${captionMd}</${open.slice(1).split(' ')[0]}>` : `${open} />`);

  for (const fig of [...root.querySelectorAll('figure.wp-block-embed')]) {
    const iframe = fig.querySelector('iframe');
    const wrapperText = fig.querySelector('.wp-block-embed__wrapper')?.textContent.trim();
    const link = fig.querySelector('a[href]')?.getAttribute('href');
    const cap = inlineMd(fig.querySelector('figcaption'));
    const e = await embedFor(iframe?.getAttribute('src'), iframe?.getAttribute('title'), /^https?:\/\//.test(wrapperText || '') ? wrapperText : link);
    ctx.embedsSeen.push(e);
    place(fig, closeWith(e.code, cap));
  }
  for (const iframe of [...root.querySelectorAll('iframe')]) {
    const e = await embedFor(iframe.getAttribute('src'), iframe.getAttribute('title'));
    ctx.embedsSeen.push(e);
    const holder = iframe.closest('span.embed-youtube, div.embed-spotify') || iframe;
    // Inside a media-text block the token must stay in the media cell; step 3 flattens it.
    if (iframe.closest('.wp-block-media-text__media')) holder.replaceWith(token(closeWith(e.code, '')));
    else place(holder, closeWith(e.code, ''));
  }

  // 2. Audio and video blocks.
  for (const fig of [...root.querySelectorAll('figure.wp-block-audio, figure.wp-block-video')]) {
    const media = fig.querySelector('audio, video');
    const src = media?.getAttribute('src') || media?.querySelector('source')?.getAttribute('src');
    const cap = inlineMd(fig.querySelector('figcaption'));
    const isAudio = media?.nodeName === 'AUDIO';
    const asset = await localAsset(src, isAudio ? 'audio' : 'video');
    const comp = isAudio ? 'Audio' : 'Video';
    const srcExpr = asset ? `{${asset.id}}` : jsx(src);
    if (!asset) report.warn(`${comp.toLowerCase()} kept remote: ${src}`);
    place(fig, cap ? `<${comp} src=${srcExpr}>${cap}</${comp}>` : `<${comp} src=${srcExpr} />`);
  }

  // 3. Images, galleries, cover and media-text.
  async function imageCode(img, { captionMd = '', inGallery = false } = {}) {
    const src = img.getAttribute('data-orig-file') || img.getAttribute('data-url') || img.getAttribute('src');
    const alt = (img.getAttribute('alt') || '').trim();
    if (!alt) ctx.stats.missingAlt++;
    const width = Number(img.getAttribute('width')) || undefined;
    const a = img.closest('a');
    let href = a?.getAttribute('href');
    // Links to the full-size file or to WordPress's attachment page go nowhere on the new site.
    if (href && (wpOriginal(href) || href === img.getAttribute('data-permalink'))) href = undefined;
    if (href) {
      href = rewriteHref(href, ctx);
      if (href.startsWith('/') && !ctx.knownPaths.has(href.split(/[?#]/)[0])) {
        report.note(`image link to an old WordPress page dropped: ${href}`);
        href = undefined;
      }
    }
    const asset = await localAsset(src, 'img');
    if (!asset) {
      ctx.stats.remoteImages++;
      report.warn(`image kept remote: ${src}`);
    }
    const attrs = [
      `src=${asset ? `{${asset.id}}` : jsx(src)}`,
      `alt=${jsx(alt)}`,
      width && !inGallery && width < 700 ? `width={${width}}` : '',
      href ? `href=${jsx(href)}` : '',
    ].filter(Boolean);
    ctx.stats.images++;
    return { attrs, asset, alt, captionMd, orig: asset?.orig };
  }

  for (const gal of [...root.querySelectorAll('figure.wp-block-gallery, .wp-block-jetpack-tiled-gallery, div.tiled-gallery')]) {
    const items = [];
    for (const img of [...gal.querySelectorAll('img')]) {
      const itemFig = img.closest('figure');
      const cap = itemFig && itemFig !== gal ? stripHtml(itemFig.querySelector('figcaption')?.innerHTML) : '';
      const r = await imageCode(img, { inGallery: true });
      items.push(`{ src: ${r.asset ? r.asset.id : JSON.stringify(img.getAttribute('src'))}, alt: ${JSON.stringify(r.alt)}${cap ? `, caption: ${JSON.stringify(cap)}` : ''} }`);
    }
    const ownCap = [...gal.children].find((c) => c.nodeName === 'FIGCAPTION');
    const capMd = inlineMd(ownCap);
    ctx.stats.galleries++;
    place(gal, capMd ? `<Gallery images={[${items.join(', ')}]}>${capMd}</Gallery>` : `<Gallery images={[${items.join(', ')}]} />`);
  }

  for (const cover of [...root.querySelectorAll('.wp-block-cover')]) {
    const img = cover.querySelector('img');
    const inner = cover.querySelector('.wp-block-cover__inner-container');
    const frag = [];
    if (img) {
      const r = await imageCode(img);
      frag.push(token(`<Figure ${r.attrs.join(' ')} />`));
    }
    if (inner) frag.push(...inner.childNodes);
    cover.replaceWith(...frag);
    report.note('cover block flattened to image + text');
  }

  for (const mt of [...root.querySelectorAll('.wp-block-media-text')]) {
    const media = mt.querySelector('.wp-block-media-text__media');
    const content = mt.querySelector('.wp-block-media-text__content');
    const frag = [];
    const img = media?.querySelector('img');
    if (img) {
      const r = await imageCode(img);
      frag.push(token(`<Figure ${r.attrs.join(' ')} />`));
    } else if (media) frag.push(...media.childNodes);
    if (content) frag.push(...content.childNodes);
    mt.replaceWith(...frag);
  }

  for (const img of [...root.querySelectorAll('img')]) {
    const fig = img.closest('figure') || img.closest('.wp-caption');
    const capEl = fig?.querySelector('figcaption, .wp-caption-text');
    const cap = inlineMd(capEl);
    const r = await imageCode(img, { captionMd: cap });
    const code = cap ? `<Figure ${r.attrs.join(' ')}>${cap}</Figure>` : `<Figure ${r.attrs.join(' ')} />`;
    const target = fig || img.closest('a') || img;
    place(target, code);
  }

  // 4. Buttons, social links, pullquotes, quotes, verse, tables.
  for (const group of [...root.querySelectorAll('.wp-block-buttons')]) {
    // Buttons without a link were used as a visual checklist; keep them as labels.
    const links = [...group.querySelectorAll('a, .wp-block-button__link')]
      .filter((a, i, all) => all.indexOf(a) === i)
      .map((a) => ({ ...(a.getAttribute('href') ? { href: rewriteHref(a.getAttribute('href'), ctx) } : {}), label: a.textContent.trim() }))
      .filter((l) => l.label);
    place(group, `<Buttons links={${JSON.stringify(links)}} />`);
  }
  for (const ul of [...root.querySelectorAll('ul.wp-block-social-links')]) {
    ul.querySelectorAll('li').forEach((li) => {
      const a = li.querySelector('a');
      const label = li.querySelector('.wp-block-social-link-label')?.textContent.trim() || a?.getAttribute('href');
      li.innerHTML = '';
      const link = document.createElement('a');
      link.setAttribute('href', a?.getAttribute('href') || '#');
      link.textContent = label;
      li.appendChild(link);
    });
  }
  for (const cite of [...root.querySelectorAll('blockquote cite, figure.wp-block-pullquote cite')]) {
    const p = document.createElement('p');
    p.innerHTML = `— ${cite.innerHTML}`;
    cite.replaceWith(p);
  }
  for (const fig of [...root.querySelectorAll('figure.wp-block-pullquote')]) {
    const bq = fig.querySelector('blockquote');
    if (bq) fig.replaceWith(bq);
  }
  for (const verse of [...root.querySelectorAll('pre.wp-block-verse')]) {
    const lines = verse.innerHTML.split(/<br\s*\/?>|\n/).map((l) => {
      const holder = document.createElement('span');
      holder.innerHTML = l;
      return td.turndown(holder.outerHTML).trim();
    });
    // Lines inside a stanza become hard breaks; blank lines separate stanzas.
    const stanzas = [];
    let cur = [];
    for (const l of lines) {
      if (l) cur.push(l);
      else if (cur.length) stanzas.push(cur), (cur = []);
    }
    if (cur.length) stanzas.push(cur);
    blocks.push(`<Verse>\n\n${stanzas.map((s) => s.join('\\\n')).join('\n\n')}\n\n</Verse>`);
    const p = document.createElement('p');
    p.textContent = `XMDXBLOCK${blocks.length - 1}X`;
    verse.replaceWith(p);
  }
  for (const table of [...root.querySelectorAll('table')]) {
    const rows = [...table.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => inlineMd(c).replace(/\|/g, '\\|') || ' '));
    if (!rows.length) {
      table.remove();
      continue;
    }
    const width = Math.max(...rows.map((r) => r.length));
    const norm = rows.map((r) => [...r, ...Array(width - r.length).fill(' ')]);
    const md = [`| ${norm[0].join(' | ')} |`, `| ${Array(width).fill('---').join(' | ')} |`, ...norm.slice(1).map((r) => `| ${r.join(' | ')} |`)].join('\n');
    if ([...table.querySelectorAll('[colspan],[rowspan]')].length) report.warn('table had merged cells; flattened to a plain grid');
    const figCap = table.closest('figure')?.querySelector('figcaption');
    const cap = inlineMd(figCap);
    blocks.push(cap ? `${md}\n\n*${cap}*` : md);
    const p = document.createElement('p');
    p.textContent = `XMDXBLOCK${blocks.length - 1}X`;
    (table.closest('figure.wp-block-table') || table).replaceWith(p);
  }

  // 5a. In-page anchors (footnotes, hand-made tables of contents). Turndown drops id
  // attributes, so every element that a #link points at gets an explicit anchor span.
  // Jetpack's footnote back-links were written as href="1668-1" (broken on WordPress too);
  // point them at the reference they meant.
  root.querySelectorAll('.footnotes a[href]').forEach((a) => {
    const h = a.getAttribute('href');
    if (/^\d+-\d+$/.test(h)) a.setAttribute('href', `#fnref-${h}`);
  });
  const anchors = [];
  const targets = new Set([...root.querySelectorAll('a[href^="#"]')].map((a) => decodeURIComponent(a.getAttribute('href').slice(1))).filter(Boolean));
  for (const id of targets) {
    const el = [...root.querySelectorAll('[id]')].find((e) => e.getAttribute('id') === id);
    if (!el) {
      report.warn(`in-page link to #${id}, which has no target`);
      continue;
    }
    anchors.push(id);
    el.insertBefore(document.createTextNode(`XMDXANCHOR${anchors.length - 1}X`), el.firstChild);
  }

  // 5b. Links: old absolute URLs → relative; links to WordPress media pages are dropped.
  for (const a of [...root.querySelectorAll('a[href]')]) {
    const href = a.getAttribute('href');
    if (href.startsWith('#')) continue;
    if (!/^(https?:|mailto:|tel:|\/)/i.test(href)) {
      report.warn(`relative link kept as-is: ${href}`);
      continue;
    }
    if (wpOriginal(href)) {
      const asset = /\.(pdf|zip|mp3|m4a|wav|docx?|xlsx?|pptx?|txt|csv)$/i.test(href) ? await localAsset(href, 'file') : null;
      if (asset) {
        a.setAttribute('href', `XMDXHREF${asset.id}X`);
        ctx.fileLinks.add(asset.id);
      } else report.warn(`link to WordPress media kept as-is: ${href}`);
      continue;
    }
    a.setAttribute('href', rewriteHref(href, ctx));
  }
  root.querySelectorAll('h1').forEach((h) => {
    const h2 = document.createElement('h2');
    h2.innerHTML = h.innerHTML;
    h.replaceWith(h2);
    report.note('h1 inside the post demoted to h2 (the title is the page h1)');
  });

  // 6. Turndown, then swap tokens back in.
  let md = td.turndown(root.innerHTML);
  // Tokens on their own line, possibly inside a blockquote ("> ") or list item ("-   ").
  // Continuation lines of a multi-line block keep the quote marker but indent past a list marker.
  md = md.replace(/^([ \t>]*(?:(?:[-*+]|\d+\.)[ \t]+)?)XMDXBLOCK(\d+)X[ \t]*$/gm, (_m, pre, i) => {
    const cont = pre.replace(/[-*+]|\d+\./g, (s) => ' '.repeat(s.length));
    return blocks[Number(i)].split('\n').map((l, n) => (n === 0 ? pre : cont) + l).join('\n');
  });
  md = md.replace(/XMDXBLOCK(\d+)X/g, (_m, i) => {
    report.note('component token was inline; moved to its own block');
    return `\n\n${blocks[Number(i)]}\n\n`;
  });
  md = md.replace(/\(XMDXHREF(\w+)X\)/g, (_m, id) => `({${id}})`);
  md = md.replace(/XMDXANCHOR(\d+)X/g, (_m, i) => `<span id=${jsx(anchors[Number(i)])}></span>`);
  md = md.replace(/￼/g, '');
  // A prose line starting with "import " or "export " would be parsed as ESM by MDX,
  // so write its first letter as a character reference.
  md = md
    .split('\n')
    .map((l) => (/^(import|export)\s/.test(l) ? `&#${l.charCodeAt(0)};${l.slice(1)}` : l))
    .join('\n');
  md = md.replace(/\n{3,}/g, '\n\n').trim();
  return { md, imports };
}

// Links to downloadable files: MDX can't put an import in a markdown link destination,
// so file links use the <a href={file1}> JSX form instead.
function fixFileLinks(md) {
  return md.replace(/\[([^\]]*)\]\(\{(\w+)\}\)/g, (_m, text, id) => `<a href={${id}}>${text}</a>`);
}

// The WordPress contact page was a Jetpack form, which the API doesn't return.
const CONTACT_PLACEHOLDER = `The contact form here was a WordPress plugin, and it didn't make the move to the new site.
Until there's a replacement, these reach me:

- Threads: [@kjhenseler](https://www.threads.com/@kjhenseler)
- LinkedIn: [kennethhenseler](https://www.linkedin.com/in/kennethhenseler)
- GitHub: [justadakaje](https://github.com/justadakaje), or open an issue on [this blog's repo](https://github.com/justadakaje/musingsofmy.today/issues)`;

// ---------------------------------------------------------------- main
async function main() {
  const t0 = Date.now();
  const wp = path.join(ROOT, 'data', 'wpcom');
  await fs.mkdir(wp, { recursive: true });

  let posts, pages, comments, categories, sitemap;
  if (OFFLINE) {
    posts = JSON.parse(await fs.readFile(path.join(wp, 'posts.json'), 'utf8'));
    pages = JSON.parse(await fs.readFile(path.join(wp, 'pages.json'), 'utf8'));
    comments = JSON.parse(await fs.readFile(path.join(wp, 'comments.json'), 'utf8'));
    categories = JSON.parse(await fs.readFile(path.join(wp, 'categories.json'), 'utf8'));
  } else {
    const trim = (p) => ({
      ID: p.ID, type: p.type, status: p.status, date: p.date, modified: p.modified, title: p.title, URL: p.URL,
      short_URL: p.short_URL, guid: p.guid, slug: p.slug, format: p.format, sticky: p.sticky, excerpt: p.excerpt,
      content: p.content, featured_image: p.featured_image, post_thumbnail: p.post_thumbnail && { URL: p.post_thumbnail.URL, width: p.post_thumbnail.width, height: p.post_thumbnail.height },
      categories: Object.values(p.categories || {}).map((c) => ({ name: decode(c.name), slug: c.slug, parent: c.parent })),
      tags: Object.values(p.tags || {}).map((t) => ({ name: decode(t.name), slug: t.slug })),
      comment_count: p.discussion?.comment_count ?? 0, like_count: p.like_count ?? 0,
    });
    const fetchAll = async (type) => {
      const out = [];
      for (let page = 1; ; page++) {
        const j = await getJSON(`${API}/posts/?type=${type}&status=publish&number=100&page=${page}&order_by=date&order=DESC`);
        out.push(...j.posts.map(trim));
        if (out.length >= j.found || !j.posts.length) break;
      }
      return out;
    };
    posts = await fetchAll('post');
    pages = await fetchAll('page');
    const cj = await getJSON(`${API}/categories?number=100`);
    categories = cj.categories.map((c) => ({ ID: c.ID, name: decode(c.name), slug: c.slug, parent: c.parent, post_count: c.post_count }));
    const com = await getJSON(`${API}/comments/?number=100&status=approved`);
    comments = com.comments.map((c) => ({
      id: c.ID, post: c.post?.ID, parent: c.parent ? c.parent.ID : null, date: c.date, type: c.type,
      author: decode(c.author?.name || ''), author_url: c.author?.URL || c.URL || '', content: c.content,
    })); // deliberately no email, IP, login or avatar
    sitemap = await getText(`https://${SITE}/sitemap.xml`);
    await fs.writeFile(path.join(wp, 'posts.json'), JSON.stringify(posts, null, 1));
    await fs.writeFile(path.join(wp, 'pages.json'), JSON.stringify(pages, null, 1));
    await fs.writeFile(path.join(wp, 'categories.json'), JSON.stringify(categories, null, 1));
    await fs.writeFile(path.join(wp, 'comments.json'), JSON.stringify(comments, null, 1));
    await fs.writeFile(path.join(wp, 'sitemap.xml'), sitemap);
  }
  console.log(`WordPress: ${posts.length} posts, ${pages.length} pages, ${comments.length} comments`);

  // Category slug paths (child categories live at /category/parent/child/).
  const catById = new Map(categories.map((c) => [c.ID, c]));
  const categoryBySlugPath = new Map();
  for (const c of categories) {
    const parts = [c.slug];
    let p = c.parent;
    while (p && catById.get(p)) {
      parts.unshift(catById.get(p).slug);
      p = catById.get(p).parent;
    }
    categoryBySlugPath.set(parts.join('/'), c.name);
    categoryBySlugPath.set(c.slug, c.name);
  }

  const pathById = new Map();
  for (const p of [...posts, ...pages]) pathById.set(p.ID, new URL(p.URL).pathname);

  let ffmpeg = false;
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    ffmpeg = true;
  } catch {}

  const td = makeTurndown();
  const reportAll = { generated: new Date().toISOString(), posts: [], pages: [], tagSlugOverrides: {}, skipped: [] };
  const wordcounts = [];
  const tagSlugs = {};
  const commentsByPost = comments.reduce((m, c) => m.set(c.post, (m.get(c.post) || 0) + 1), new Map());

  const docs = [...posts.map((p) => ['post', p]), ...pages.map((p) => ['page', p])];
  for (const [kind, p] of docs) {
    const urlPath = new URL(p.URL).pathname;
    const words = countWords(p.content);
    wordcounts.push({ path: urlPath, wpcom_id: p.ID, type: kind, title: decode(p.title), words });
    if (ONLY && !ONLY.has(p.ID)) continue;

    const m = /^\/(\d{4})\/(\d{2})\/(\d{2})\/([^/]+)\/$/.exec(urlPath);
    const folder = kind === 'post' ? `${m[1]}-${m[2]}-${m[3]}-${decodeURIComponent(m[4])}` : p.slug;
    const dir = path.join(ROOT, 'src', 'content', kind === 'post' ? 'posts' : 'pages', folder);
    const entry = { id: p.ID, type: kind, path: urlPath, folder, title: decode(p.title), notes: [], warnings: [], words_wp: words };
    const report = {
      note: (s) => entry.notes.includes(s) || entry.notes.push(s),
      warn: (s) => entry.warnings.push(s),
      resized: () => (entry.resized = (entry.resized || 0) + 1),
    };
    (kind === 'post' ? reportAll.posts : reportAll.pages).push(entry);

    if (existsSync(path.join(dir, 'index.mdx')) && !FORCE) {
      entry.notes.push('already imported; skipped (use --force to overwrite)');
      continue;
    }
    await fs.mkdir(dir, { recursive: true });

    const ctx = {
      td, dir, ffmpeg, pathById, categoryBySlugPath,
      knownPaths: new Set([...pathById.values(), '/', '/about/', '/contact/']),
      usedNames: new Set(['index.mdx']), assetByUrl: new Map(), embedsSeen: [], fileLinks: new Set(),
      stats: { images: 0, media: 0, remoteImages: 0, missingAlt: 0, galleries: 0, embeds: {} },
    };
    if (kind === 'page' && p.slug === 'contact' && !stripHtml(p.content)) {
      report.warn('WordPress served an empty Contact page (the Jetpack form is not in the API); wrote a placeholder for you to replace');
    }
    const { md: rawMd, imports } = await convert(p.content, ctx, report);
    let md = fixFileLinks(rawMd);
    if (kind === 'page' && p.slug === 'contact' && !md.trim()) md = CONTACT_PLACEHOLDER;

    // Cover (featured image).
    let cover = null;
    let coverInline = false;
    if (p.featured_image) {
      const orig = wpOriginal(p.featured_image);
      const existing = orig && ctx.assetByUrl.get(orig);
      if (existing) (cover = existing.file), (coverInline = true);
      else if (orig) {
        const name = safeFileName(path.basename(new URL(orig).pathname), ctx.usedNames);
        if (await download(orig, path.join(dir, name), report)) cover = name;
      } else report.warn(`featured image not on WordPress media, skipped: ${p.featured_image}`);
    }

    const cats = p.categories.map((c) => c.name);
    const tags = p.tags.map((t) => t.name);
    for (const t of p.tags) {
      const guess = t.name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&[a-z]+;/g, '').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      if (guess !== t.slug) tagSlugs[t.name] = t.slug;
    }

    let fm = ['---', `title: ${q(decode(p.title))}`];
    if (kind === 'post') fm.push(`date: ${q(p.date)}`);
    if (p.modified && p.modified !== p.date) fm.push(`updated: ${q(p.modified)}`);
    if (kind === 'post') {
      const { section, note } = pickSection(p, cats);
      if (note) report.note(`section ${section}: ${note}`);
      entry.section = section;
      fm.push(`section: ${section}`, `categories: ${qa(cats)}`, `tags: ${qa(tags)}`);
    }
    const desc = stripHtml(p.excerpt).replace(/\s*(\[…\]|\[&hellip;\]|…|Continue reading.*)$/i, '').trim();
    fm.push(`description: ${q(desc)}`);
    if (kind === 'post' && cover) fm.push('cover:', `  src: ${q('./' + cover)}`, `  alt: ""`, ...(coverInline ? ['  inline: true'] : []));

    if (kind === 'post') {
      const all = `${p.title} ${p.content}`;
      const appleShow = /podcasts\.apple\.com\/[^"'\s]*?(id\d{9,})/.exec(p.content)?.[1];
      const spotifyShow = /open\.spotify\.com\/(?:embed\/)?show\/([A-Za-z0-9]+)/.exec(p.content)?.[1];
      const show = SHOW_BY_APPLE[appleShow] || SHOW_BY_SPOTIFY[spotifyShow];
      const episode = /S\d{2}\.E\d{3,4}/.exec(all)?.[0];
      const isPodcast = cats.includes('Podcast') || episode;
      if (show && isPodcast) {
        const spEp = ctx.embedsSeen.find((e) => e.kind === 'spotify' && e.url.includes('/episode/'));
        const spTitle = spEp?.title;
        const appleEp = /https:\/\/(?:embed\.)?podcasts\.apple\.com\/[^"'\s#<]*\?i=\d+/.exec(p.content)?.[0]?.replace('embed.podcasts', 'podcasts');
        const yt = ctx.embedsSeen.find((e) => e.kind === 'youtube');
        fm.push('podcast:', `  show: ${show}`);
        if (episode) fm.push(`  episode: ${q(episode)}`);
        if (spTitle) fm.push(`  title: ${q(spTitle.replace(/^S\d{2}\.E\d{3,4}\s*[–—-]\s*/, ''))}`);
        if (appleEp) fm.push(`  apple: ${q(appleEp)}`);
        if (spEp) fm.push(`  spotify: ${q(spEp.url)}`);
        if (yt) fm.push(`  youtube: ${q(yt.url)}`);
        entry.podcast = show;
      } else if (cats.includes('Podcast')) report.note('in the Podcast category but no show link found; no episode card');
    }
    fm.push('legacy:', `  wpcom_id: ${p.ID}`, '  views_all_time: 0', `  comments: ${commentsByPost.get(p.ID) || 0}`);
    if (p.guid) fm.push(`  guid: ${q(p.guid)}`);
    if (p.short_URL) fm.push(`  short_url: ${q(p.short_URL)}`);
    fm.push('---');

    const body = `${fm.join('\n')}\n${imports.length ? `\n${imports.join('\n')}\n` : ''}\n${md}\n`;
    await fs.writeFile(path.join(dir, 'index.mdx'), body);
    Object.assign(entry, ctx.stats, { embeds: ctx.stats.embeds });
    process.stdout.write(`${kind === 'post' ? '·' : '+'}`);
  }

  wordcounts.sort((a, b) => a.path.localeCompare(b.path));
  await fs.writeFile(path.join(wp, 'wordcounts.json'), JSON.stringify(wordcounts, null, 1));
  await fs.mkdir(path.join(ROOT, 'src', 'data'), { recursive: true });
  await fs.writeFile(path.join(ROOT, 'src', 'data', 'tag-slugs.json'), JSON.stringify(Object.fromEntries(Object.entries(tagSlugs).sort()), null, 2) + '\n');
  reportAll.tagSlugOverrides = tagSlugs;
  reportAll.skipped.push({ id: 236, title: 'Portfolio', reason: 'never-published draft page; still the theme’s lorem-ipsum template' });
  reportAll.ffmpeg = ffmpeg;
  await fs.writeFile(path.join(ROOT, 'data', 'import-report.json'), JSON.stringify(reportAll, null, 1));
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s. Report: data/import-report.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
