# DNS cutover: WordPress.com → Cloudflare

Started 2026-11-04 with Ken's go-ahead. The registrar is **Porkbun** (domain expires 2027-02-01);
only the nameservers move. Email isn't affected: the domain has no MX records.

## Before (snapshot 2026-11-04, from WordPress.com's zone)

| Name | Type | Value | TTL |
| --- | --- | --- | --- |
| `@` | NS | ns1.wordpress.com, ns2.wordpress.com, ns3.wordpress.com | — |
| `@` | A | 192.0.78.24, 192.0.78.25 (WordPress.com, managed) | — |
| `@` | TXT | `v=spf1 mx ~all` | 3600 |
| `www` | CNAME | musingsofmy.today | 14400 |
| `*` | CNAME | musingsofmy.today | 14400 |
| `deanne` | CNAME | e29686a81c87ef58.vercel-dns-017.com (a Vercel project) | 3600 |
| `_acme-challenge` | TXT | `sbGN32SoUm_fcGtkPL_c1P68v4UZvv9lHSEq9xlpNk0` | 3600 |
| `_acme-challenge` | TXT | `xYWQcVCFmbElM0soPX9or7WzgUU2C2AURrcfULG40lo` | 3600 |
| `_domainconnect` | TXT | `public-api.wordpress.com/rest/v1.3/domain-connect` | 3600 |

DNSSEC: off (no DS record at the registry), so nothing to disable before the switch.

## After (Cloudflare zone, account KenHenChan)

| Name | Type | Value | Proxy | Notes |
| --- | --- | --- | --- | --- |
| `@` | Worker custom domain | `musingsofmy-today` | yes | created by `wrangler deploy` (routes in wrangler.jsonc) |
| `www` | Worker custom domain | `musingsofmy-today` | yes | 301 to the apex via a Redirect Rule |
| `@` | TXT | `v=spf1 mx ~all` | — | unchanged |
| `deanne` | CNAME | e29686a81c87ef58.vercel-dns-017.com | **DNS only** | proxying would break Vercel's certificate |
| `_acme-challenge` | TXT | (both values above) | — | kept; harmless |

Dropped on purpose: `*` (WordPress default, nothing used it, and on Cloudflare it would only
produce certificate errors) and `_domainconnect` (would point services at WordPress.com's DNS API).

## Timeline (UTC, 2026-11-04)

| Time | Step |
| --- | --- |
| ~07:35 | Zone created on Cloudflare (Free plan); records above added; apex and www as DNS-only bridges to WordPress.com |
| ~07:40 | Page Rule `www.musingsofmy.today/*` → `https://musingsofmy.today/$1` (301); Always Use HTTPS on; min TLS 1.2 |
| ~07:48 | Ken switched the nameservers at Porkbun to daphne/garret.ns.cloudflare.com |
| 07:50 | `.today` registry delegating to Cloudflare |
| 07:51 | Zone active |
| 07:54 | Universal SSL certificate active (Let's Encrypt, `musingsofmy.today` + `*.musingsofmy.today`) |
| 07:55 | Bridge A records deleted and the apex attached to the Worker (`wrangler triggers deploy`); about 4 s without an A record |
| 07:56 | `www` CNAME proxied; the Page Rule now 301s it to the apex |
| 07:58 | `validate.mjs --base=https://musingsofmy.today`: 58/58 sitemap URLs, 57/57 word counts, 17/17 RSS (W3C valid), 11,499 internal links |

Old addresses keep working: `musingsofmytoday.wordpress.com/<path>` and `wp.me/…` shortlinks 301 to
`musingsofmy.today/<path>` because WordPress.com still has the domain mapped as primary. That stops
when the WordPress.com plan ends; plan before then (see MIGRATION.md).

Why the custom domain needed a delete first: the Workers API refuses to attach a hostname that has
DNS records it didn't create (code 100117). The apex had a TXT record, so the brief A-less window
returned NODATA rather than NXDOMAIN, and visitors' resolvers already held the 300 s A records.

## Rollback

At Porkbun, set the nameservers back to `ns1.wordpress.com`, `ns2.wordpress.com`, `ns3.wordpress.com`.
WordPress.com's zone and the Personal plan (paid through 2027-11-01) are untouched, so the old
site comes back as soon as resolvers pick up the change (minutes to a few hours).
