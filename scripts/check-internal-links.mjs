#!/usr/bin/env node
/**
 * Every internal link, image, audio/video source and same-page #anchor in dist/ must resolve.
 * A fast, dependency-free stand-in for `lychee --offline` that also runs on Windows;
 * CI runs lychee as well (see .github/workflows/ci.yml).
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DIST, distFileFor, loadRedirects, matchRedirect, walk, rel, ensureBuilt } from './lib/dist.mjs';

const ATTR = /\s(href|src|poster|srcset)="([^"]*)"/g;

export async function run() {
  ensureBuilt();
  const rules = loadRedirects();
  const pages = walk(DIST).filter((f) => f.endsWith('.html'));
  const broken = new Map();
  let checked = 0;
  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const m of html.matchAll(ATTR)) {
      const values = m[1] === 'srcset' ? m[2].split(',').map((s) => s.trim().split(/\s+/)[0]) : [m[2]];
      for (let v of values) {
        v = v.replaceAll('&amp;', '&');
        if (!v || v.startsWith('data:') || v.startsWith('mailto:') || v.startsWith('javascript:')) continue;
        if (m[1] !== 'srcset' && /\s/.test(v.trim())) {
          checked++;
          broken.set(`${rel(page)} → ${v}`, 'malformed URL (contains spaces)');
          continue;
        }
        if (v.startsWith('#')) {
          checked++;
          const id = decodeURIComponent(v.slice(1));
          if (id && !ids.has(id)) broken.set(`${rel(page)} → ${v}`, 'no element with that id');
          continue;
        }
        let p = null;
        if (v.startsWith('/') && !v.startsWith('//')) p = v;
        else if (/^https?:\/\/(www\.)?musingsofmy\.today(\/|$)/.test(v)) p = new URL(v).pathname;
        if (!p) continue;
        checked++;
        if (p.startsWith('/pagefind/') && !fs.existsSync(`${DIST}/pagefind`)) continue; // index not built yet
        if (distFileFor(p)) continue;
        const r = matchRedirect(rules, p);
        if (r && distFileFor(r.to)) continue;
        broken.set(`${rel(page)} → ${v}`, r ? `redirects to ${r.to}, which is missing` : 'not in the build');
      }
    }
  }
  return { pages: pages.length, checked, broken: [...broken].map(([where, why]) => ({ where, why })) };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await run();
  console.log(`Internal links: ${r.checked - r.broken.length}/${r.checked} resolve across ${r.pages} pages`);
  for (const b of r.broken.slice(0, 50)) console.log(`  ✗ ${b.where}  (${b.why})`);
  if (r.broken.length > 50) console.log(`  … and ${r.broken.length - 50} more`);
  process.exitCode = r.broken.length ? 1 : 0;
}
