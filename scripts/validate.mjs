#!/usr/bin/env node
/**
 * Runs every check and writes VALIDATION.md: what passed, and everything the import did
 * not carry over 1:1. Exit code 1 if any hard check fails (CI gate).
 *
 *   node scripts/validate.mjs                                   # against dist/
 *   node scripts/validate.mjs --base=https://<id>.musingsofmy-today.pages.dev   # + HTTP checks on a deployment
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { ROOT } from './lib/dist.mjs';
import { run as urls } from './check-urls.mjs';
import { run as words } from './check-wordcount.mjs';
import { run as rssCheck } from './check-rss.mjs';
import { run as links } from './check-internal-links.mjs';

const base = process.argv.slice(2).find((a) => a.startsWith('--base='))?.slice(7) ?? null;
const out = process.argv.slice(2).find((a) => a.startsWith('--out='))?.slice(6) ?? 'VALIDATION.md';

const u = await urls();
const uHttp = base ? await urls({ base }) : null;
const w = await words();
const r = await rssCheck({ w3c: base ? `${new URL(base).origin}/rss.xml` : null });
const l = await links();
const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'import-report.json'), 'utf8'));

let sha = 'uncommitted';
try {
  sha = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch {}

const mark = (ok) => (ok ? '✅' : '❌');
const docs = [...report.posts, ...report.pages];
const warnings = docs.flatMap((e) => e.warnings.map((x) => ({ e, x })));
const NOTE_GROUPS = [
  [/^section /, 'Section chosen by hand, not by the category vote'],
  [/^transcoded /, 'Audio transcoded'],
  [/^VideoPress/, 'VideoPress video moved into the repo'],
  [/^WordPress\.com reblog/, 'Reblogs of other blogs (quoted excerpt + link, as on WordPress)'],
  [/^cover block flattened/, 'Cover block shown as image, then text'],
  [/^h1 inside the post/, 'In-post h1 demoted to h2'],
  [/^image split out of a paragraph/, 'Image moved out of a paragraph (text order kept)'],
  [/^image link to an old WordPress page dropped/, 'Image link to a WordPress attachment page dropped'],
  [/^component token was inline/, 'Embed moved to its own line'],
  [/^in the Podcast category but no show link/, 'Podcast category, but no show link to build an episode card from'],
];
const grouped = new Map();
for (const e of docs) {
  for (const n of e.notes) {
    if (n.startsWith('already imported')) continue;
    const g = NOTE_GROUPS.find(([re]) => re.test(n))?.[1] ?? 'Other';
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g).push({ e, n });
  }
}
const link = (e) => `[${e.title.replace(/[[\]|]/g, '')}](${e.path})`;
const totals = report.posts.reduce(
  (a, e) => ({ images: a.images + (e.images || 0), alt: a.alt + (e.missingAlt || 0), media: a.media + (e.media || 0), resized: a.resized + (e.resized || 0) }),
  { images: 0, alt: 0, media: 0, resized: 0 },
);
const embeds = report.posts.reduce((a, e) => {
  for (const [k, v] of Object.entries(e.embeds || {})) a[k] = (a[k] || 0) + v;
  return a;
}, {});
const pct = (d) => (d == null ? '—' : `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}%`);
const failedHard = u.failed.length + (uHttp?.failed.length ?? 0) + w.failed.length + r.failed.length + l.broken.length;

const md = `# Validation report

Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC from commit \`${sha}\` by \`scripts/validate.mjs\`.
Baselines are what WordPress.com served on ${report.generated.slice(0, 10)} (frozen in \`data/wpcom/\`).

## Checks

| Check (MIGRATION.md "Validation before cut-over") | Result |
| --- | --- |
| 1. Every URL in WordPress's \`sitemap.xml\` resolves on the build | ${mark(!u.failed.length)} ${u.passed}/${u.total} (${u.mode}) |
${uHttp ? `| 1b. …and over HTTP on the deployment, posts with no redirect | ${mark(!uHttp.failed.length)} ${uHttp.passed}/${uHttp.total} (${base}) |\n` : ''}| 2. Word count per post within ±${w.tolerance * 100}% of WordPress | ${mark(!w.failed.length)} ${w.passed}/${w.total} |
| 3. Internal links, images and #anchors resolve | ${mark(!l.broken.length)} ${l.checked - l.broken.length}/${l.checked} across ${l.pages} pages |
| 3b. External links (lychee) | CI only: see the \`links\` job in GitHub Actions. Informational, doesn't block a deploy |
| 4. RSS 2.0 structure, GUIDs kept, \`/feed/\` redirects | ${mark(!r.failed.length)} ${r.passed}/${r.total}${base ? '' : ' (W3C validator runs only with --base)'} |
| 5. Side-by-side screenshots of five posts | Not automated. Done by eye on the preview |

${failedHard ? `**${failedHard} hard failure(s)**: details below.` : 'No hard failures.'}

${[...u.failed, ...(uHttp?.failed ?? [])].length ? `### URL failures\n\n${[...u.failed, ...(uHttp?.failed ?? [])].map((f) => `- \`${f.path}\`: ${f.how}`).join('\n')}\n` : ''}${w.failed.length ? `### Word-count failures\n\n${w.failed.map((f) => `- [${f.title}](${f.path}): WordPress ${f.words}, built ${f.built ?? '—'} (${pct(f.delta)})`).join('\n')}\n` : ''}${r.failed.length ? `### RSS failures\n\n${r.failed.map((c) => `- ${c.name}: ${c.detail}`).join('\n')}\n` : ''}${l.broken.length ? `### Broken internal links\n\n${l.broken.map((b) => `- ${b.where} (${b.why})`).join('\n')}\n` : ''}
## Didn't convert cleanly (needs a decision or a fix)

${warnings.length ? warnings.map(({ e, x }) => `- ${link(e)}: ${x}`).join('\n') : '- Nothing.'}

## Converted, but not 1:1 (worth knowing)

${[...grouped].map(([g, items]) => `**${g}** (${items.length})\n\n${items.map(({ e, n }) => `- ${link(e)}${/: /.test(n) && !/^(image|component|in the)/.test(n) ? ` (${n.replace(/^[^:]*:\s*/, '')})` : ''}`).join('\n')}`).join('\n\n')}

## Not carried over

- **Portfolio page** (WordPress page 236): ${report.skipped.find((s) => s.id === 236)?.reason ?? 'skipped'}.
- **All-time views per post**: \`legacy.views_all_time\` is 0 everywhere. The WordPress.com connector only returns site totals, so the per-post numbers need the CSV from Stats → Posts & pages (export before cancelling the plan).
- **Alt text**: ${totals.alt} of ${totals.images} images have none. They had none on WordPress either; nothing was lost, but it's worth fixing over time.
- **Contact form**: Jetpack forms don't survive a static site. \`/contact/\` has placeholder text with social links until you pick a plain email address or a small Resend form.
- **Email subscribers**: deliberately untouched. Not exported, not in the repo.
- **Drafts and private posts** (16 on WordPress): not imported; this run covered published content only.

## What moved

- ${report.posts.length} posts and ${report.pages.length} pages; ${totals.images} images and ${totals.media} media files now live beside their posts (${totals.resized} oversized originals were scaled to 2000 px on the long edge).
- Embeds became components: ${Object.entries(embeds).map(([k, v]) => `${k.replace('_', ' ')} ${v}`).join(', ')}.
- ${Object.keys(report.tagSlugOverrides).length ? `${Object.keys(report.tagSlugOverrides).length} tags needed slug overrides to keep their WordPress URLs.` : 'Every tag URL matches WordPress without overrides.'}
- Archived comments: ${JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'wpcom', 'comments.json'), 'utf8')).length} (comments and pingbacks), shown read-only under their posts.

<details><summary>Word counts, every post and page</summary>

| Post | WordPress | Built | Δ |
| --- | ---: | ---: | ---: |
${w.rows.map((x) => `| [${x.title.replace(/[[\]|]/g, '')}](${x.path}) | ${x.words} | ${x.built ?? '—'} | ${x.ok ? '' : '❌ '}${pct(x.delta)} |`).join('\n')}

</details>
`;

fs.writeFileSync(path.join(ROOT, out), md);
console.log(`${out}: urls ${u.passed}/${u.total}${uHttp ? `, http ${uHttp.passed}/${uHttp.total}` : ''}, words ${w.passed}/${w.total}, rss ${r.passed}/${r.total}, links ${l.checked - l.broken.length}/${l.checked}, ${warnings.length} import warnings`);
process.exit(failedHard ? 1 : 0);
