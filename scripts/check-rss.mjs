#!/usr/bin/env node
/**
 * RSS 2.0 checks on dist/rss.xml, plus the /feed/ redirect.
 *
 *   node scripts/check-rss.mjs
 *   node scripts/check-rss.mjs --w3c=https://<preview>.pages.dev/rss.xml   # also ask the W3C Feed Validator
 *
 * Local checks are structural (well-formed XML, required RSS elements, RFC 822 dates, unique
 * GUIDs, absolute URLs inside content:encoded, links that exist in dist/). The W3C validator is
 * the authority; it needs a public URL, so it runs only when --w3c is given.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { ROOT, DIST, distFileFor, loadRedirects, matchRedirect, ensureBuilt } from './lib/dist.mjs';

const RFC822 = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} (GMT|[+-]\d{4})$/;

export async function run({ w3c = null } = {}) {
  ensureBuilt();
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });
  const xml = fs.readFileSync(path.join(DIST, 'rss.xml'), 'utf8');

  const valid = XMLValidator.validate(xml);
  add('well-formed XML', valid === true, valid === true ? '' : JSON.stringify(valid.err));
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' }).parse(xml);
  const rss = doc.rss ?? {};
  const ch = rss.channel ?? {};
  add('rss version="2.0"', rss['@version'] === '2.0');
  add('channel has title, link, description', ch.title && ch.link && ch.description);
  const self = [].concat(ch['atom:link'] ?? []).find((l) => l['@rel'] === 'self');
  add('atom:link rel="self" points at /rss.xml', self && new URL(self['@href']).pathname === '/rss.xml', self?.['@href'] ?? 'missing');

  const items = [].concat(ch.item ?? []);
  add('has items (WordPress served 10)', items.length > 0 && items.length <= 10, `${items.length} items`);
  const guids = items.map((i) => (typeof i.guid === 'object' ? i.guid['#text'] : i.guid));
  add('every item has a unique guid', guids.every(Boolean) && new Set(guids).size === guids.length);
  add('every item has a title and link', items.every((i) => i.title && i.link));
  const badDates = items.filter((i) => !RFC822.test(i.pubDate ?? '') || Number.isNaN(Date.parse(i.pubDate)));
  add('pubDate is RFC 822', badDates.length === 0, badDates.map((i) => i.pubDate).join(', '));
  const dates = items.map((i) => Date.parse(i.pubDate));
  add('items newest first', dates.every((d, n) => n === 0 || d <= dates[n - 1]));
  const deadLinks = items.filter((i) => !distFileFor(new URL(i.link).pathname));
  add('item links exist in the build', deadLinks.length === 0, deadLinks.map((i) => i.link).join(', '));
  const relative = items.filter((i) => /\s(?:src|href)="\/(?!\/)/.test(i['content:encoded'] ?? ''));
  add('content:encoded has no site-relative URLs', relative.length === 0, relative.map((i) => i.title).join('; '));
  add('every item has full content', items.every((i) => (i['content:encoded'] ?? '').length > 0));

  // GUIDs must match what WordPress published, or readers re-deliver old posts as new.
  const wp = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'wpcom', 'posts.json'), 'utf8'));
  const wpGuid = new Map(wp.map((p) => [new URL(p.URL).pathname, p.guid]));
  const mismatched = items.filter((i) => {
    const g = wpGuid.get(new URL(i.link).pathname);
    const mine = typeof i.guid === 'object' ? i.guid['#text'] : i.guid;
    return g && g !== mine;
  });
  add('imported posts keep their WordPress guid', mismatched.length === 0, mismatched.map((i) => i.link).join(', '));

  const rules = loadRedirects();
  const feed = matchRedirect(rules, '/feed/');
  add('/feed/ redirects to /rss.xml (301)', feed && feed.to === '/rss.xml' && feed.status === 301, feed ? `${feed.from} → ${feed.to} ${feed.status}` : 'no rule');

  if (w3c) {
    try {
      const res = await fetch(`https://validator.w3.org/feed/check.cgi?output=soap12&url=${encodeURIComponent(w3c)}`, { headers: { 'user-agent': 'musingsofmy.today-validate/1.0' } });
      const body = await res.text();
      const validity = /<m:validity>(true|false)<\/m:validity>/.exec(body)?.[1];
      const errors = /<m:errorcount>(\d+)<\/m:errorcount>/.exec(body)?.[1];
      const warnings = /<m:warningcount>(\d+)<\/m:warningcount>/.exec(body)?.[1];
      add('W3C Feed Validator: valid', validity === 'true', `${errors ?? '?'} errors, ${warnings ?? '?'} warnings (${w3c})`);
    } catch (e) {
      add('W3C Feed Validator reachable', false, e.message);
    }
  }
  return { total: checks.length, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok), checks, items: items.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const w3c = process.argv.slice(2).find((a) => a.startsWith('--w3c='))?.slice(6) ?? null;
  const r = await run({ w3c });
  console.log(`RSS checks: ${r.passed}/${r.total}`);
  for (const c of r.checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
  process.exit(r.failed.length ? 1 : 0);
}
