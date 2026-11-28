#!/usr/bin/env node
/**
 * RSS 2.0 checks on dist/rss.xml and per-section dist/section/<id>/rss.xml feeds, plus the /feed/ redirect.
 *
 *   node scripts/check-rss.mjs
 *   node scripts/check-rss.mjs --w3c=https://musingsofmy-today.musingsofmy-today.workers.dev/rss.xml   # also ask the W3C Feed Validator
 *
 * Local checks are structural (well-formed XML, required RSS elements, RFC 822 dates, unique
 * GUIDs, absolute URLs inside content:encoded, links that exist in dist/). The W3C validator is
 * the authority; it needs a public URL, so it runs only when --w3c is given.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as fxp from 'fast-xml-parser';
import { ROOT, DIST, distFileFor, loadRedirects, matchRedirect, ensureBuilt } from './lib/dist.mjs';

const { XMLParser } = fxp;
const xmlValidator = /** @type {{ validate: (xml: string) => true | { err: unknown } }} */ (
  /** @type {Record<string, unknown>} */ (fxp)['XMLValidator']
);

const RFC822 = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} (GMT|[+-]\d{4})$/;
const SECTIONS = ['engineering', 'history-politics', 'science-nature', 'signal', 'field-notes'];

/**
 * Validates one built RSS 2.0 XML document and records structural check results.
 */
function checkFeedXml({ xml, expectedSelfPath, prefix = '', add, wpGuid }) {
  const valid = xmlValidator.validate(xml);
  add(`${prefix}well-formed XML`, valid === true, valid === true ? '' : JSON.stringify(valid.err));
  if (valid !== true) return [];

  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' }).parse(xml);
  const rss = doc.rss ?? {};
  const ch = rss.channel ?? {};
  add(`${prefix}rss version="2.0"`, rss['@version'] === '2.0');
  add(`${prefix}channel has title, link, description`, ch.title && ch.link && ch.description);
  const self = [].concat(ch['atom:link'] ?? []).find((l) => l['@rel'] === 'self');
  add(
    `${prefix}atom:link rel="self" points at ${expectedSelfPath}`,
    self && new URL(self['@href']).pathname === expectedSelfPath,
    self?.['@href'] ?? 'missing',
  );

  const items = [].concat(ch.item ?? []);
  add(`${prefix}has items (WordPress served 10)`, items.length > 0 && items.length <= 10, `${items.length} items`);
  const guids = items.map((i) => (typeof i.guid === 'object' ? i.guid['#text'] : i.guid));
  add(`${prefix}every item has a unique guid`, guids.every(Boolean) && new Set(guids).size === guids.length);
  add(`${prefix}every item has a title and link`, items.every((i) => i.title && i.link));
  const badDates = items.filter((i) => !RFC822.test(i.pubDate ?? '') || Number.isNaN(Date.parse(i.pubDate)));
  add(`${prefix}pubDate is RFC 822`, badDates.length === 0, badDates.map((i) => i.pubDate).join(', '));
  const dates = items.map((i) => Date.parse(i.pubDate));
  add(`${prefix}items newest first`, dates.every((d, n) => n === 0 || d <= dates[n - 1]));
  const deadLinks = items.filter((i) => !distFileFor(new URL(i.link).pathname));
  add(`${prefix}item links exist in the build`, deadLinks.length === 0, deadLinks.map((i) => i.link).join(', '));
  const relative = items.filter((i) => /\s(?:src|href)="\/(?!\/)/.test(i['content:encoded'] ?? ''));
  add(`${prefix}content:encoded has no site-relative URLs`, relative.length === 0, relative.map((i) => i.title).join('; '));
  add(`${prefix}every item has full content`, items.every((i) => (i['content:encoded'] ?? '').length > 0));
  add(`${prefix}content:encoded has no iframes (readers strip them; W3C warns)`, items.every((i) => !/<iframe/i.test(i['content:encoded'] ?? '')));
  // RSS 2.0's <author> must be an email address; the name goes in <dc:creator>.
  add(`${prefix}no <author> without an email address`, items.every((i) => !i.author || /@/.test(String(i.author))));

  if (wpGuid) {
    // GUIDs must match what WordPress published, or readers re-deliver old posts as new.
    const mismatched = items.filter((i) => {
      const g = wpGuid.get(new URL(i.link).pathname);
      const mine = typeof i.guid === 'object' ? i.guid['#text'] : i.guid;
      return g && g !== mine;
    });
    add(`${prefix}imported posts keep their WordPress guid`, mismatched.length === 0, mismatched.map((i) => i.link).join(', '));
  }

  return items;
}

export async function run({ w3c = null } = {}) {
  ensureBuilt();
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });

  const wp = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'wpcom', 'posts.json'), 'utf8'));
  const wpGuid = new Map(wp.map((p) => [new URL(p.URL).pathname, p.guid]));

  const xml = fs.readFileSync(path.join(DIST, 'rss.xml'), 'utf8');
  const items = checkFeedXml({ xml, expectedSelfPath: '/rss.xml', add, wpGuid });

  for (const section of SECTIONS) {
    const secPath = path.join(DIST, 'section', section, 'rss.xml');
    const prefix = `[section/${section}] `;
    const exists = fs.existsSync(secPath);
    add(`${prefix}dist/section/${section}/rss.xml exists`, exists);
    if (exists) {
      const secXml = fs.readFileSync(secPath, 'utf8');
      checkFeedXml({
        xml: secXml,
        expectedSelfPath: `/section/${section}/rss.xml`,
        prefix,
        add,
        wpGuid,
      });
    }
  }

  const rules = loadRedirects();
  const feed = matchRedirect(rules, '/feed/');
  add('/feed/ redirects to /rss.xml (301)', feed && feed.to === '/rss.xml' && feed.status === 301, feed ? `${feed.from} → ${feed.to} ${feed.status}` : 'no rule');

  if (w3c) {
    try {
      // The validator caches by URL; a throwaway query string makes it fetch the current feed.
      const target = `${w3c}${w3c.includes('?') ? '&' : '?'}v=${Date.now()}`;
      const res = await fetch(`https://validator.w3.org/feed/check.cgi?output=soap12&url=${encodeURIComponent(target)}`, { headers: { 'user-agent': 'musingsofmy.today-validate/1.0' } });
      const body = await res.text();
      const types = [...body.matchAll(/<type>([^<]+)<\/type>/g)].map((m) => m[1]);
      const validity = /<m:validity>(true|false)<\/m:validity>/.exec(body)?.[1];
      const errors = /<m:errorcount>(\d+)<\/m:errorcount>/.exec(body)?.[1];
      const warnings = /<m:warningcount>(\d+)<\/m:warningcount>/.exec(body)?.[1];
      // SelfDoesntMatchLocation is our own doing: the cache-busting ?v= makes the fetched URL differ
      // from the feed's atom:link self.
      const real = types.filter((t) => t !== 'SelfDoesntMatchLocation');
      const warningSummary = real.length ? real.length : (warnings ?? '0');
      add('W3C Feed Validator: valid', validity === 'true', `${errors ?? '?'} errors, ${warningSummary} warnings${real.length ? `: ${real.join(', ')}` : ''} (${w3c}; SelfDoesntMatchLocation ignored, caused by the cache-busting query)`);
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
  process.exitCode = r.failed.length ? 1 : 0;
}
