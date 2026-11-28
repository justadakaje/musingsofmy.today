#!/usr/bin/env node
/**
 * Submits up to 20 priority + newest URLs from dist/sitemap.xml to IndexNow after deploy.
 * Node 24 built-ins only; logs rate-limits or upstream errors without failing CI.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = 'musingsofmy.today';
const KEY = 'b8e4c2a9f1d04763a5c8e91b2d3f4a56';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const MAX_URLS = 20;
const PRIORITY_PATHS = ['/', '/now/', '/uses/', '/podcasts/', '/archive/'];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITEMAP_PATH = path.join(ROOT, 'dist', 'sitemap.xml');

function extractSitemapUrls(xml) {
  const entries = [];
  const urlBlockRe = /<url>([\s\S]*?)<\/url>/g;
  for (const match of xml.matchAll(urlBlockRe)) {
    const block = match[1];
    const loc = /<loc>([^<]+)<\/loc>/.exec(block)?.[1]?.trim();
    if (!loc) continue;
    const lastmodRaw = /<lastmod>([^<]+)<\/lastmod>/.exec(block)?.[1]?.trim();
    const lastmodMs = lastmodRaw ? Date.parse(lastmodRaw) : Number.NaN;
    entries.push({
      loc,
      lastmodMs: Number.isFinite(lastmodMs) ? lastmodMs : -1,
    });
  }
  return entries;
}

function selectUrls(entries) {
  const seen = new Set();
  const selected = [];

  const byPath = new Map();
  for (const entry of entries) {
    try {
      const parsed = new URL(entry.loc);
      byPath.set(parsed.pathname, entry.loc);
    } catch {
      // Ignore malformed URLs in sitemap.
    }
  }

  for (const p of PRIORITY_PATHS) {
    const url = byPath.get(p) ?? `https://${HOST}${p}`;
    if (!seen.has(url)) {
      seen.add(url);
      selected.push(url);
    }
  }

  const newest = [...entries].sort((a, b) => b.lastmodMs - a.lastmodMs);
  for (const entry of newest) {
    if (selected.length >= MAX_URLS) break;
    if (!seen.has(entry.loc)) {
      seen.add(entry.loc);
      selected.push(entry.loc);
    }
  }

  return selected.slice(0, MAX_URLS);
}

async function main() {
  let xml;
  try {
    xml = await fs.readFile(SITEMAP_PATH, 'utf8');
  } catch (err) {
    console.warn(`indexnow: skipping, could not read ${SITEMAP_PATH}: ${err.message}`);
    return;
  }

  const entries = extractSitemapUrls(xml);
  const urlList = selectUrls(entries);
  if (urlList.length === 0) {
    console.warn('indexnow: skipping, no URLs found in dist/sitemap.xml');
    return;
  }

  const payload = {
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList,
  };

  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    const text = (await res.text()).trim();
    if (res.ok) {
      console.log(`indexnow: submitted ${urlList.length} URLs (HTTP ${res.status})${text ? ` — ${text}` : ''}`);
    } else {
      console.warn(`indexnow: non-2xx response HTTP ${res.status} for ${urlList.length} URLs${text ? ` — ${text}` : ''}`);
    }
  } catch (err) {
    console.warn(`indexnow: request failed (${err.message}); continuing without failing deploy`);
  }
}

await main();
