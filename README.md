# musingsofmy.today

Kenneth Henseler's blog, as Markdown in a repo. Astro builds it to static HTML, Cloudflare (Workers static assets)
serves it, and every URL from the WordPress.com years still works.

- **Posts** live in `src/content/posts/YYYY-MM-DD-slug/index.mdx`, with their images beside them.
  The folder name *is* the URL: `2026-09-24-my-post` → `/2026/09/24/my-post/`.
- **Pages** (About, Contact) live in `src/content/pages/<slug>/index.mdx` → `/<slug>/`.
- **Sections, podcasts, social links** are in `src/site.ts`. The front page's "now.log",
  featured post and projects are in `src/data/home.ts`.
- **Design**: `src/styles/tokens.css` is copied from `kenhenchan-design-system` (don't edit it here);
  `src/styles/global.css` is the approved mockup (`profile-refresh/blog/blog-mock.html`) ported.

## Writing a post

```bash
mkdir src/content/posts/2026-11-10-my-new-post
```

`index.mdx`:

```mdx
---
title: "My new post"
date: "2026-11-10T09:00:00-06:00"   # quoted, with the UTC offset; the build checks it matches the folder date
section: engineering                 # engineering | history-politics | science-nature | signal | field-notes
tags: ["AI", "WoW addons"]
description: "One or two sentences for search results and link previews."
cover: { src: "./cover.jpg", alt: "What the image shows" }
---

import shot from './screenshot.png';

Text in Markdown.

<Figure src={shot} alt="Describe it">Optional caption, Markdown allowed.</Figure>
<YouTube id="dQw4w9WgXcQ" />
<Spotify type="episode" id="6cbzP7znE5jskiKK5fm2jL" />
```

Components available without importing them: `Figure`, `Gallery`, `YouTube` (`id` or `playlist`),
`Spotify`, `ApplePodcasts`, `AppleMusic`, `Video`, `Audio`, `Buttons`, `LinkCard`, `Verse`
(see `src/components/mdx/`). A podcast companion post adds
`podcast: { show: runtime-reality, episode: "S26.E1110", apple: "…", spotify: "…" }` to get the episode card.

Then `npm run dev`, open a PR, and merge when the preview looks right.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Local site with hot reload (search needs a build) |
| `npm run build` | Static site in `dist/`, then the Pagefind search index |
| `npm run preview` | Serve `dist/` locally |
| `npm run check` | Type-check frontmatter, components and pages |
| `npm run validate` | All checks below, written to `VALIDATION.md` |
| `npm run import` | Pull new posts from WordPress.com (skips posts already here; `--force` overwrites) |

Validation (`scripts/`), all against `dist/` unless given `--base=<deployed URL>`:

- `check-urls.mjs`: every URL in WordPress's sitemap (frozen in `data/wpcom/sitemap.xml`) resolves; posts with no redirect.
- `check-wordcount.mjs`: each post's word count within ±2% of what WordPress served.
- `check-rss.mjs`: RSS 2.0 structure, WordPress GUIDs kept, `/feed/` → `/rss.xml`. `--w3c=<url>` asks the W3C validator too.
- `check-internal-links.mjs`: every internal link, image and #anchor resolves. CI also runs lychee, including external links.

## Deploying

The site runs on **Cloudflare Workers static assets** (`wrangler.jsonc`), which is what Cloudflare
now recommends for new static sites instead of Pages: same free plan, same `_redirects` and
`_headers` files, no Worker code. Production is **https://musingsofmy.today** (a Workers custom
domain; DNS is on Cloudflare since 2026-11-04). `www` 301s to the apex.
https://musingsofmy-today.musingsofmy-today.workers.dev serves the same build with `noindex`.

GitHub Actions (`.github/workflows/ci.yml`) builds, validates, and then deploys: `main` to
production, pull requests to a preview URL (`pr-<number>-musingsofmy-today.<account>.workers.dev`).
A deploy only happens if validation passes. It needs two repository secrets:

- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare dashboard → Workers & Pages → Account ID.
- `CLOUDFLARE_API_TOKEN`: My Profile → API Tokens → Create Token → template *Edit Cloudflare Workers*.

Without them the deploy job skips and says so. Manual deploy: `npx wrangler login`, then
`npm run build && npm run deploy` (production) or `npm run deploy:preview` (preview URL only).

`_redirects` (old category, feed and archive URLs) and `_headers` are generated at build time from
`src/site.ts`; see `astro.config.mjs`. Anything on `*.workers.dev` is sent with `X-Robots-Tag: noindex`,
so previews never compete with the real domain in search.

## Comments

Old WordPress comments are archived read-only in `data/wpcom/comments.json` (names and text only;
no emails, IPs or avatars) and shown under each post. New comments use Giscus once it's set up:
enable Discussions on this repo, install the [giscus app](https://github.com/apps/giscus), make a
"Comments" category, and copy the repo and category IDs from [giscus.app](https://giscus.app) into
`GISCUS` in `src/site.ts`. Until then, no comment box is shown.

## What's in `data/`

`data/wpcom/` is a frozen copy of what WordPress.com served at import time: posts (HTML), pages,
categories, comments, the sitemap, and per-URL word counts. It's the baseline the checks compare
against, and the record of where everything came from. `data/import-report.json` lists everything
the importer had to change. **Subscriber lists never go in this repo** (`.gitignore` blocks the usual file names).
