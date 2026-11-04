// Helpers for checking a built site in dist/ the way Cloudflare static assets will serve it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DIST = path.join(ROOT, 'dist');

/** dist file that serves a URL path, or null. Mirrors Pages: /a/ → a/index.html, /a.xml → a.xml. */
export function distFileFor(urlPath) {
  const p = decodeURIComponent(urlPath.split(/[?#]/)[0]);
  const candidates = p.endsWith('/') ? [path.join(DIST, p, 'index.html')] : [path.join(DIST, p), path.join(DIST, p, 'index.html'), path.join(DIST, `${p}.html`)];
  return candidates.find((f) => fs.existsSync(f) && fs.statSync(f).isFile()) ?? null;
}

/** Parsed dist/_redirects as [{from, to, status, re}] using Cloudflare's :placeholder and * splat rules. */
export function loadRedirects() {
  const file = path.join(DIST, '_redirects');
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [from, to, status = '302'] = l.split(/\s+/);
      const re = new RegExp(
        '^' + from.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '(.*)').replace(/:(\w+)/g, '([^/]+)') + '$',
      );
      return { from, to, status: Number(status), re };
    });
}

export function matchRedirect(rules, urlPath) {
  const p = urlPath.split(/[?#]/)[0];
  return rules.find((r) => r.re.test(p)) ?? null;
}

export function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else out.push(f);
  }
  return out;
}

export const rel = (f) => path.relative(ROOT, f).replaceAll('\\', '/');

export function ensureBuilt() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('dist/ is missing. Run `npm run build` first.');
    process.exit(2);
  }
}
