#!/usr/bin/env node
/**
 * Every URL in WordPress's sitemap.xml must resolve on the new site.
 *
 *   node scripts/check-urls.mjs                          # frozen data/wpcom/sitemap.xml vs dist/
 *   node scripts/check-urls.mjs --live                   # fetch the live sitemap first (before cut-over!)
 *   node scripts/check-urls.mjs --base=https://musingsofmy-today.musingsofmy-today.workers.dev   # over HTTP
 *
 * Posts must answer 200 with no redirect ("zero redirects for posts", MIGRATION.md).
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, distFileFor, loadRedirects, matchRedirect, ensureBuilt } from './lib/dist.mjs';

const POST_PATH = /^\/\d{4}\/\d{2}\/\d{2}\/[^/]+\/$/;

export async function run({ live = false, base = null } = {}) {
  let xml;
  const snapshot = path.join(ROOT, 'data', 'wpcom', 'sitemap.xml');
  if (live) {
    const res = await fetch('https://musingsofmy.today/sitemap.xml');
    xml = await res.text();
    if (!xml.includes('generator="wordpress.com"')) console.warn('note: the live sitemap is no longer WordPress’s; you are checking the new site against itself.');
  } else xml = fs.readFileSync(snapshot, 'utf8');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  const results = [];

  if (!base) {
    ensureBuilt();
    const rules = loadRedirects();
    for (const u of urls) {
      const p = new URL(u).pathname;
      const file = distFileFor(p);
      const redirect = file ? null : matchRedirect(rules, p);
      const ok = Boolean(file) || (Boolean(redirect) && !POST_PATH.test(p));
      results.push({ url: u, path: p, ok, how: file ? 'file' : redirect ? `redirect → ${redirect.to}` : 'missing' });
    }
  } else {
    const origin = new URL(base).origin;
    const queue = [...urls];
    const worker = async () => {
      while (queue.length) {
        const u = queue.shift();
        const p = new URL(u).pathname;
        let status = 0;
        let location = '';
        try {
          const res = await fetch(origin + p, { redirect: 'manual', headers: { 'user-agent': 'musingsofmy.today-validate/1.0' } });
          status = res.status;
          location = res.headers.get('location') ?? '';
          await res.arrayBuffer();
        } catch (e) {
          location = e.message;
        }
        const ok = status === 200 || (!POST_PATH.test(p) && status >= 300 && status < 400);
        results.push({ url: u, path: p, ok, how: `HTTP ${status}${location ? ` → ${location}` : ''}` });
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    results.sort((a, b) => a.path.localeCompare(b.path));
  }
  return { total: urls.length, passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok), results, mode: base ? `HTTP against ${base}` : `dist/ (${live ? 'live' : 'frozen'} sitemap)` };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const base = args.find((a) => a.startsWith('--base='))?.slice(7) ?? null;
  const r = await run({ live: args.includes('--live'), base });
  console.log(`URLs from WordPress sitemap: ${r.passed}/${r.total} resolve (${r.mode})`);
  for (const f of r.failed) console.log(`  ✗ ${f.path}  ${f.how}`);
  process.exitCode = r.failed.length ? 1 : 0;
}
