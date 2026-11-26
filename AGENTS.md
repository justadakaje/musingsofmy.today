# Project Rules — musingsofmy.today

- **Public Blog Boundary:** This repository is public. Never commit operational automation scripts, OAuth flows, API tokens, subscriber exports, or personal streaming utilities here — those belong in private `d:\Code\GitHub\livestream-production\`.
- **Cloudflare Workers Static Assets:** Because `wrangler.jsonc` exists at repo root, use Wrangler / `npm run deploy` (or `cf` only for account/zone inspection) per platform config. Notice `wrangler.jsonc` uses `"not_found_handling": "404-page"` (`src/pages/404.astro`), which renders an opaque `#05070a` HTML page.
- **Route Removal Check:** Before removing files from `public/`, grep sibling repos, `~/.gemini/config/skills/`, and `%APPDATA%\slobs-client\SceneCollections\*.json` for references, and preserve compatibility redirects in `astro.config.mjs` when needed.
- **Validation Gate:** Run `npm run check` and `npm run build` / `npm run validate` after content, layout, or routing edits.

## Project context (shared by Claude Code and Antigravity)

*Section added 2026-11-26 from the README, code and git history. The rules above are unchanged.*

### What this is

Kenneth Henseler's blog as content-as-code. Public repo. Production is https://musingsofmy.today. Every URL from the WordPress.com years still resolves.

### Stack

- Astro 7 + MDX, Pagefind search, TypeScript; Node `>=22.12`.
- Cloudflare Workers static assets (`wrangler.jsonc`); only `/api/*` runs Worker code (`src/worker/index.ts`).
- Posts: `src/content/posts/YYYY-MM-DD-slug/index.mdx` (the folder name is the URL). Site config: `src/site.ts`; home page data: `src/data/home.ts`.
- `src/styles/tokens.css` is copied from `kenhenchan-design-system`. Don't edit it here.
- Comments: archived WordPress comments in `data/wpcom/comments.json`; new comments via Giscus (`GISCUS` in `src/site.ts`).

### Build, test, deploy

```bash
npm ci
npm run check      # astro check
npm run build      # Astro + Pagefind
npm run validate   # URLs, word counts, RSS, internal links -> VALIDATION.md
npm test           # Worker tests
```

GitHub Actions (`.github/workflows/ci.yml`) builds, validates, then deploys `main` to production and pull requests to a preview URL. Deploys skip when the Cloudflare secrets are missing. Merge through a PR after the preview looks right.

### Key decisions

- 2026-11-04: Moved off WordPress.com to Astro on Cloudflare Workers static assets; DNS on Cloudflare; `www` 301s to the apex. `data/wpcom/` is the frozen baseline the checks compare against.
- 2026-11-10: Livestream overlay, Spotify auth and daemons moved out of this public repo.
- 2026-11-14: Operational docs, handoffs, scripts and Archify receipts stay local-only (PR #1). Static podcast RSS feeds added.
- 2026-11-15: Real-world locations in fiction posts are generalized before publishing.
- 2026-11-25: Dynamic OG cards, 2x2 Projects grid, Archify trailing-slash redirect, Giscus fallback for zero-comment posts (PR #2).

### In flight (as of 2026-11-26)

- No open PRs.
- `VALIDATION.md` lists import items still needing a decision (for example an Amazon embed rendered as a link card).

## Working across Claude Code and Antigravity

Both tools work in this repo, and neither can see the other's chat history. This file is the shared memory between them.

- Read this file before starting. `CLAUDE.md` and `GEMINI.md` only point here.
- When a session makes a decision a later session needs (a convention, a rejected approach, a version pin, a domain or config change), add a dated line under **Key decisions** in the same PR.
- Update **In flight** when multi-session work starts or finishes.
- Mark anything not verified against the code or history as *inferred*.
