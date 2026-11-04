#!/usr/bin/env node
/**
 * Per-post word count on the built site vs what WordPress served, within ±2%.
 * Baseline: data/wpcom/wordcounts.json (written by the importer from the WordPress HTML).
 * Both sides are counted by scripts/lib/text.mjs, so the comparison measures content, not
 * tokenizers. Players/embeds are excluded on both sides (data-wc-ignore / embed wrappers).
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseHTML } from 'linkedom';
import { countWords } from './lib/text.mjs';
import { ROOT, distFileFor, ensureBuilt } from './lib/dist.mjs';

export const TOLERANCE = 0.02;

export async function run() {
  ensureBuilt();
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'wpcom', 'wordcounts.json'), 'utf8'));
  const rows = [];
  for (const b of baseline) {
    const file = distFileFor(b.path);
    if (!file) {
      rows.push({ ...b, built: null, delta: null, ok: false, why: 'page missing from dist/' });
      continue;
    }
    const { document } = parseHTML(fs.readFileSync(file, 'utf8'));
    const body = document.querySelector('[data-post-body]');
    const built = body ? countWords(body.innerHTML) : 0;
    let ok;
    let why = '';
    let delta = null;
    if (b.words === 0) {
      ok = true;
      why = built === 0 ? 'no text on WordPress either (embed-only)' : 'WordPress page had no text; new page has placeholder copy';
    } else {
      delta = (built - b.words) / b.words;
      ok = Math.abs(delta) <= TOLERANCE;
      if (!ok) why = delta < 0 ? 'text missing on the new site' : 'extra text on the new site';
    }
    rows.push({ ...b, built, delta, ok, why });
  }
  return { tolerance: TOLERANCE, total: rows.length, passed: rows.filter((r) => r.ok).length, failed: rows.filter((r) => !r.ok), rows };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await run();
  console.log(`Word counts within ±${r.tolerance * 100}%: ${r.passed}/${r.total}`);
  for (const f of r.failed) console.log(`  ✗ ${f.path}  wp ${f.words} → built ${f.built ?? '—'} (${f.delta == null ? f.why : `${(f.delta * 100).toFixed(1)}%`})`);
  process.exit(r.failed.length ? 1 : 0);
}
