#!/usr/bin/env node
/**
 * Sync GoldFinder's release tag and CurseForge fact in src/data/home.ts
 * from the latest GitHub Release of justadakaje/wow-addons.
 *
 * Usage:
 *   node scripts/sync-projects.mjs
 *   node scripts/sync-projects.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME_PATH = path.join(REPO_ROOT, 'src', 'data', 'home.ts');
const RELEASE_URL = 'https://api.github.com/repos/justadakaje/wow-addons/releases/latest';
const TAG_RE = /^v?\d+\.\d+\.\d+([-.][a-zA-Z0-9.]+)?$/;

function parseArgs(argv) {
  let dryRun = false;
  let help = false;
  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--help' || arg === '-h') help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return { dryRun, help };
}

function usage() {
  console.log(`Usage: node scripts/sync-projects.mjs [--dry-run] [--help]

Fetches the latest release tag from justadakaje/wow-addons and updates
GoldFinder's status.label and facts[0] in src/data/home.ts.

Options:
  --dry-run   Print planned changes without writing src/data/home.ts
  --help, -h  Show this help text`);
}

async function fetchLatestTag() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'musingsofmy.today-sync',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const res = await fetch(RELEASE_URL, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status} ${res.statusText} for ${RELEASE_URL}`);
  }
  const data = await res.json();
  const rawTag = typeof data?.tag_name === 'string' ? data.tag_name.trim() : '';
  // Monorepo releases for GoldFinder are tagged `goldfinder-vX.Y.Z`; strip the addon prefix before validating.
  const tag = rawTag.replace(/^goldfinder-/, '');
  if (!TAG_RE.test(tag)) {
    throw new Error(`Invalid or unexpected release tag_name: ${JSON.stringify(data?.tag_name)}`);
  }
  return tag;
}

/**
 * Update only the GoldFinder object inside PROJECTS in src/data/home.ts.
 */
function updateGoldFinder(source, tag) {
  const blockRe = /(\{\s*\r?\n\s*status:\s*\{\s*cls:\s*'[^']+',\s*label:\s*')([^']*)('\s*\},\s*\r?\n\s*name:\s*'GoldFinder',[\s\S]*?facts:\s*\[\s*')([^']*)(')/;
  const match = blockRe.exec(source);
  if (!match) {
    throw new Error('Could not locate GoldFinder block in src/data/home.ts');
  }

  const prevStatus = match[2];
  const prevFact0 = match[4];
  const nextStatus = `shipped · ${tag}`;
  const nextFact0 = `${tag} live on CurseForge`;

  const updated = source.replace(blockRe, `$1${nextStatus}$3${nextFact0}$5`);
  return { updated, prevStatus, nextStatus, prevFact0, nextFact0 };
}

async function main() {
  const { dryRun, help } = parseArgs(process.argv.slice(2));
  if (help) {
    usage();
    return;
  }

  const tag = await fetchLatestTag();
  const original = fs.readFileSync(HOME_PATH, 'utf8');
  const { updated, prevStatus, nextStatus, prevFact0, nextFact0 } = updateGoldFinder(original, tag);

  if (updated === original) {
    console.log(`GoldFinder is already up to date (${tag}).`);
    return;
  }

  console.log(`GoldFinder sync (${tag}):`);
  if (prevStatus !== nextStatus) {
    console.log(`- status.label: "${prevStatus}"`);
    console.log(`+ status.label: "${nextStatus}"`);
  }
  if (prevFact0 !== nextFact0) {
    console.log(`- facts[0]:     "${prevFact0}"`);
    console.log(`+ facts[0]:     "${nextFact0}"`);
  }

  if (dryRun) {
    console.log('[dry-run] No files written.');
    return;
  }

  fs.writeFileSync(HOME_PATH, updated, 'utf8');
  console.log('Updated src/data/home.ts.');
}

main().catch((err) => {
  console.error(`sync-projects failed: ${err.message}`);
  process.exitCode = 1;
});
