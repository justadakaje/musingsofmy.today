# Project Rules — musingsofmy.today

- **Public Blog Boundary:** This repository is public. Never commit operational automation scripts, OAuth flows, API tokens, subscriber exports, or personal streaming utilities here — those belong in private `d:\Code\GitHub\livestream-production\`.
- **Cloudflare Workers Static Assets:** Because `wrangler.jsonc` exists at repo root, use Wrangler / `npm run deploy` (or `cf` only for account/zone inspection) per platform config. Notice `wrangler.jsonc` uses `"not_found_handling": "404-page"` (`src/pages/404.astro`), which renders an opaque `#05070a` HTML page.
- **Route Removal Check:** Before removing files from `public/`, grep sibling repos, `~/.gemini/config/skills/`, and `%APPDATA%\slobs-client\SceneCollections\*.json` for references, and preserve compatibility redirects in `astro.config.mjs` when needed.
- **Validation Gate:** Run `npm run check` and `npm run build` / `npm run validate` after content, layout, or routing edits.
