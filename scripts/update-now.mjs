#!/usr/bin/env node
/**
 * Update the `NOW` card in src/data/home.ts and stamp `NOW.updated` in America/Chicago.
 *
 * Usage:
 *   node scripts/update-now.mjs --streaming "..." --building "..." --focus "..."
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME_PATH = path.join(REPO_ROOT, 'src', 'data', 'home.ts');
const VALUE_FLAGS = new Set(['streaming', 'building', 'focus', 'streaming-href']);

function usage() {
  console.log(`Usage: node scripts/update-now.mjs [options]

Updates matching rows in NOW.rows and stamps NOW.updated (YYYY-MM-DD in
America/Chicago) in src/data/home.ts.

Options:
  --streaming <text>       Update the "streaming" row text
  --streaming-href <url>   Update the "streaming" row href ("" to remove href)
  --building <text>        Update the "building" row text
  --focus <text>           Update the "focus" row text
  --dry-run                Print planned changes without writing src/data/home.ts
  --help, -h               Show this help text`);
}

function parseArgs(argv) {
  const opts = { dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
      continue;
    }
    if (arg === '--dry-run') {
      opts.dryRun = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
    const eq = arg.indexOf('=');
    const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    if (!VALUE_FLAGS.has(key)) {
      throw new Error(`Unknown option: --${key}`);
    }
    let val;
    if (eq !== -1) {
      val = arg.slice(eq + 1);
    } else {
      if (i + 1 >= argv.length) {
        throw new Error(`Missing value for --${key}`);
      }
      val = argv[++i];
    }
    if (/[\r\n]/.test(val)) {
      throw new Error(`Value for --${key} must be a single line`);
    }
    opts[key] = val;
  }
  return opts;
}

function todayChicago() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function escapeSingleQuoted(value) {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

function replaceRowValue(nowBlock, key, newValue) {
  const rowRe = new RegExp(`(\\{\\s*k:\\s*'${key}',\\s*v:\\s*)'(?:\\\\.|[^'\\\\])*'`);
  if (!rowRe.test(nowBlock)) {
    throw new Error(`Could not find NOW row for "${key}"`);
  }
  return nowBlock.replace(rowRe, `$1'${escapeSingleQuoted(newValue)}'`);
}

function replaceStreamingHref(nowBlock, href) {
  const rowRe = /(\{\s*k:\s*'streaming',\s*v:\s*'(?:\\.|[^'\\])*')(\s*,\s*href:\s*'(?:\\.|[^'\\])*')?(\s*\})/;
  if (!rowRe.test(nowBlock)) {
    throw new Error('Could not find NOW row for "streaming"');
  }
  if (!href) {
    return nowBlock.replace(rowRe, '$1$3');
  }
  return nowBlock.replace(rowRe, `$1, href: '${escapeSingleQuoted(href)}'$3`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }

  const hasUpdate =
    opts.streaming !== undefined ||
    opts.building !== undefined ||
    opts.focus !== undefined ||
    opts['streaming-href'] !== undefined;

  if (!hasUpdate) {
    usage();
    process.exitCode = 1;
    return;
  }

  const original = fs.readFileSync(HOME_PATH, 'utf8');
  const nowRe = /(export const NOW = \{[\s\S]*?\r?\n\};)/;
  const nowMatch = nowRe.exec(original);
  if (!nowMatch) {
    throw new Error('Could not locate NOW export in src/data/home.ts');
  }

  let nextNow = nowMatch[1];
  const today = todayChicago();
  nextNow = nextNow.replace(/(updated:\s*')[^']*(')/, `$1${today}$2`);

  if (opts.streaming !== undefined) nextNow = replaceRowValue(nextNow, 'streaming', opts.streaming);
  if (opts['streaming-href'] !== undefined) nextNow = replaceStreamingHref(nextNow, opts['streaming-href']);
  if (opts.building !== undefined) nextNow = replaceRowValue(nextNow, 'building', opts.building);
  if (opts.focus !== undefined) nextNow = replaceRowValue(nextNow, 'focus', opts.focus);

  const updated = original.replace(nowRe, nextNow);
  if (updated === original) {
    console.log('NOW is already up to date.');
    return;
  }

  console.log('Planned NOW update:');
  for (const line of nextNow.split(/\r?\n/)) {
    console.log(`  ${line}`);
  }

  if (opts.dryRun) {
    console.log('[dry-run] No files written.');
    return;
  }

  fs.writeFileSync(HOME_PATH, updated, 'utf8');
  console.log('Updated src/data/home.ts.');
}

try {
  main();
} catch (err) {
  console.error(`update-now failed: ${err.message}`);
  process.exitCode = 1;
}
