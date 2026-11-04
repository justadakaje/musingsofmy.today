# Validation report

Generated 2026-11-04 17:52 UTC from commit `e2f2ab9` by `scripts/validate.mjs`.
Baselines are what WordPress.com served on 2026-11-04 (frozen in `data/wpcom/`).

## Checks

| Check (MIGRATION.md "Validation before cut-over") | Result |
| --- | --- |
| 1. Every URL in WordPress's `sitemap.xml` resolves on the build | ✅ 58/58 (dist/ (frozen sitemap)) |
| 2. Word count per post within ±2% of WordPress | ✅ 57/57 |
| 3. Internal links, images and #anchors resolve | ✅ 11499/11499 across 473 pages |
| 3b. External links (lychee) | CI only: see the `links` job in GitHub Actions. Informational, doesn't block a deploy |
| 4. RSS 2.0 structure, GUIDs kept, `/feed/` redirects | ✅ 16/16 (W3C validator runs only with --base) |
| 5. Side-by-side screenshots of five posts | Not automated. Done by eye on the preview |

No hard failures.


## Didn't convert cleanly (needs a decision or a fix)

- [Interpreting Chevelle’s “Piistol Star (Gravity Heals)”](/2021/05/03/interpreting-chevelles-piistol-star-gravity-heals/): embed without a component, rendered as a link card: https://read.amazon.com/kp/card?preview=inline&linkCode=kpd&ref_=k4w_oembed_2YFXJ4scAdjwW6&asin=B08QRRYD6M&tag=kpembed-20
- [Contact](/contact/): WordPress served an empty Contact page (the Jetpack form is not in the API); wrote a placeholder for you to replace

## Converted, but not 1:1 (worth knowing)

**VideoPress video moved into the repo** (1)

- [Terraforming Chamber 04.26: System Migration](/2026/04/25/terraforming-chamber-04-26-system-migration/)

**In-post h1 demoted to h2** (2)

- [Comparative Analysis of Daily Greens Powders for Optimal Nutrition](/2025/07/10/comparative-analysis-of-daily-greens-powders-for-optimal-nutrition/)
- [The Intertwined Essence of Existence](/2025/04/20/the-intertwined-essence-of-existence/)

**Malformed link repaired (it was broken on WordPress too)** (1)

- [From cardinal to Pope](/2025/05/03/from-cardinal-to-pope/) (https://www.rundown.ai/tools/video-to-sound-effects-generator)

**Audio transcoded** (1)

- [Y2K38: Risks, Solutions, and Real-World Implications](/2025/05/02/y2k38-risks-solutions-and-real-world-implications/)

**Section chosen by hand, not by the category vote** (4)

- [Y2K38: Risks, Solutions, and Real-World Implications](/2025/05/02/y2k38-risks-solutions-and-real-world-implications/) (Y2K38 is a software-time bug; WordPress tied History and Technology)
- [Branding SharePoint: The New Normal](/2021/10/20/branding-sharepoint-the-new-normal/) (SharePoint branding post, filed under Nature on WordPress)
- [Interpreting Chevelle’s “Piistol Star (Gravity Heals)”](/2021/05/03/interpreting-chevelles-piistol-star-gravity-heals/) (Chevelle lyric analysis, filed under Nature on WordPress)
- [Introducing custom registration pages for Microsoft Teams meetings](/2021/05/01/introducing-custom-registration-pages-for-microsoft-teams-meetings/) (Microsoft registration-pages post, filed under Nature on WordPress)

**Reblogs of other blogs (quoted excerpt + link, as on WordPress)** (2)

- [Branding SharePoint: The New Normal](/2021/10/20/branding-sharepoint-the-new-normal/) (quotes another blog’s post, with a link to it)
- [Introducing custom registration pages for Microsoft Teams meetings](/2021/05/01/introducing-custom-registration-pages-for-microsoft-teams-meetings/) (quotes another blog’s post, with a link to it)

**Cover block shown as image, then text** (1)

- [Sorta kinda calaveras literarias for 2020](/2020/11/01/panteones-por-mi-familia/)

**Image moved out of a paragraph (text order kept)** (1)

- [My Night Sky Observations for 5/1/2020 01:00AM CDT](/2020/05/01/night-sky-observations-for-5-1-2020-0700-utc/)

## Not carried over

- **Portfolio page** (WordPress page 236): never-published draft page; still the theme’s lorem-ipsum template.
- **All-time views per post**: `legacy.views_all_time` is 0 everywhere. The WordPress.com connector only returns site totals, so the per-post numbers need the CSV from Stats → Posts & pages (export before cancelling the plan).
- **Alt text**: 166 of 170 images have none. They had none on WordPress either; nothing was lost, but it's worth fixing over time.
- **Contact form**: Jetpack forms don't survive a static site. `/contact/` has placeholder text with social links until you pick a plain email address or a small Resend form.
- **Email subscribers**: deliberately untouched. Not exported, not in the repo.
- **Drafts and private posts** (16 on WordPress): not imported; this run covered published content only.

## What moved

- 55 posts and 2 pages; 170 images and 174 media files now live beside their posts (0 oversized originals were scaled to 2000 px on the long edge).
- Embeds became components: spotify 31, youtube 26, apple podcasts 8, videopress 1, apple music 3, other 1.
- Every tag URL matches WordPress without overrides.
- Archived comments: 14 (comments and pingbacks), shown read-only under their posts.

<details><summary>Word counts, every post and page</summary>

| Post | WordPress | Built | Δ |
| --- | ---: | ---: | ---: |
| [Rediscovering the music](/2020/02/01/rediscovering-the-music/) | 313 | 313 | +0.0% |
| [My Night Sky Observations for 5/1/2020 01:00AM CDT](/2020/05/01/night-sky-observations-for-5-1-2020-0700-utc/) | 402 | 402 | +0.0% |
| [Sorta kinda calaveras literarias for 2020](/2020/11/01/panteones-por-mi-familia/) | 265 | 265 | +0.0% |
| [qubits – an electronic music playlist, inspired by quantum information](/2020/11/01/qubits-electronic-music-playlist/) | 0 | 0 | — |
| [Nov. 3 2020 Election Most Secure Ever](/2020/11/12/nov-3-2020-election-most-secure-ever/) | 31 | 31 | +0.0% |
| [Mid-November Hickory Creek Hike](/2020/11/14/mid-november-hickory-creek-hike/) | 208 | 208 | +0.0% |
| [These are for the bees](/2020/11/20/for-the-bees/) | 38 | 38 | +0.0% |
| [Road-trippin’ for Thanksgiving](/2020/11/21/road-trippin-for-thanksgiving/) | 153 | 153 | +0.0% |
| [My Spotify 2020 Wrapped](/2020/12/04/my-2020-spotify-wrapped/) | 20 | 20 | +0.0% |
| [Introducing custom registration pages for Microsoft Teams meetings](/2021/05/01/introducing-custom-registration-pages-for-microsoft-teams-meetings/) | 188 | 188 | +0.0% |
| [Persisting Petrichor and a Millipede](/2021/05/02/persisting-petrichor-and-a-millipede/) | 550 | 550 | +0.0% |
| [Interpreting Chevelle’s “Piistol Star (Gravity Heals)”](/2021/05/03/interpreting-chevelles-piistol-star-gravity-heals/) | 605 | 605 | +0.0% |
| [Branding SharePoint: The New Normal](/2021/10/20/branding-sharepoint-the-new-normal/) | 112 | 112 | +0.0% |
| [Partial Lunar Eclipse – Nov 19, 2021](/2021/11/19/390/) | 133 | 133 | +0.0% |
| [Exploring the Veal Springs Branch trail and an Elm Fork Trail hawk encounter on Earth Day 2023](/2023/04/23/exploring-the-veal-springs-branch-trail-and-an-elm-fork-trail-hawk-encounter-on-earth-day-2023/) | 0 | 0 | — |
| [Playlist: May 12023](/2023/05/22/playlist-may-12023/) | 93 | 93 | +0.0% |
| [FebruFuzzz](/2024/02/17/februfuzzz/) | 35 | 35 | +0.0% |
| [Echoes of Affinity](/2024/04/28/echoes-of-affinity/) | 981 | 981 | +0.0% |
| [The Intertwined Essence of Existence](/2025/04/20/the-intertwined-essence-of-existence/) | 4036 | 4036 | +0.0% |
| [A Sea of Red: Discovering the Texas Paintbrush](/2025/04/23/a-sea-of-red-discovering-the-texas-paintbrush/) | 233 | 233 | +0.0% |
| [Y2K38: Risks, Solutions, and Real-World Implications](/2025/05/02/y2k38-risks-solutions-and-real-world-implications/) | 8712 | 8712 | +0.0% |
| [From cardinal to Pope](/2025/05/03/from-cardinal-to-pope/) | 206 | 206 | +0.0% |
| [Comparative Analysis of Daily Greens Powders for Optimal Nutrition](/2025/07/10/comparative-analysis-of-daily-greens-powders-for-optimal-nutrition/) | 2010 | 2010 | +0.0% |
| [Experience the Sound of Mid Summer Static](/2025/08/05/experience-the-sound-of-late-summer-mid-summer-static/) | 434 | 434 | +0.0% |
| [The Enduring Legacy: A Deep Dive into the Pre-Contact and Historical Journey of the Pueblo People and Their Inter-Societal Relations](/2025/08/05/the-enduring-legacy-a-deep-dive-into-the-pre-contact-and-historical-journey-of-the-pueblo-people-and-their-inter-societal-relations/) | 8800 | 8800 | +0.0% |
| [Sonic Convergences: The August Playlist Where Rock Meets Electronic](/2025/08/27/sonic-convergences-the-august-playlist-where-rock-meets-electronic/) | 408 | 408 | +0.0% |
| [Unlocking Endless Possibilities: My First Look at the New Mini Motorways Creative Mode](/2025/08/31/mini-motorways-creative-mode-first-look/) | 635 | 635 | +0.0% |
| [September 2025: Industrial Pulse](/2025/09/30/september-2025-industrial-pulse/) | 288 | 288 | +0.0% |
| [The War for Digital Truth: Elon Musk, Wikipedia, and the AI-Powered Future of Knowledge](/2025/10/01/the-war-for-digital-truth-elon-musk-wikipedia-and-the-ai-powered-future-of-knowledge/) | 3917 | 3917 | +0.0% |
| [The Ghost in the Machine: Finding Reality Between the Pings](/2025/10/04/the-ghost-in-the-machine-finding-reality-between-the-pings/) | 963 | 963 | +0.0% |
| [October Ascent: A Journey Through Propeller Synths and Bass Turbulence](/2025/11/01/october-ascent-a-journey-through-propeller-synths-and-bass-turbulence/) | 436 | 436 | +0.0% |
| [Reforged in Fire: Turning the ‘Dragon Compendium’ into ‘Mythic Circuitry’ (2025 Update)](/2025/11/03/from-dragon-compendium-to-mythic-circuitry/) | 632 | 632 | +0.0% |
| [A Heritage Forged in Timber: An Analysis of Parke County, Indiana, “The Covered Bridge Capital of the World”](/2025/11/09/a-heritage-forged-in-timber-an-analysis-of-parke-county-indiana-the-covered-bridge-capital-of-the-world/) | 2970 | 2970 | +0.0% |
| [Turbine Twilight: The Electrocessnas of November 12025](/2025/11/30/turbinetwilight/) | 313 | 313 | +0.0% |
| [The White House January 6 Webpage: A Factual Review and Contextual Analysis](/2026/01/06/the-epistemic-sovereign-a-comprehensive-analysis-of-the-white-house-january-6th-portal-and-the-legal-architecture-of-executive-revisionism/) | 865 | 865 | +0.0% |
| [The Architecture of a Feast: Deconstructing Pixel Grip’s “Crows Feast”](/2026/01/29/the-architecture-of-a-feast-deconstructing-pixel-grips-crows-feast/) | 549 | 549 | +0.0% |
| [Hammer, Anvil, and the 20,000-Year-Old Border](/2026/02/08/hammer-anvil-and-the-20000-year-old-border/) | 570 | 570 | +0.0% |
| [Software-mageddon: Why Wall Street Just Deleted $1 Trillion from SaaS (And How to Survive)](/2026/02/12/software-mageddon-why-wall-street-just-deleted-1-trillion-from-saas-and-how-to-survive/) | 276 | 276 | +0.0% |
| [The 0.00% Crime: Why Sober Drivers Are Going to Jail (And How to Protect Yourself)](/2026/02/14/the-0-00-crime-why-sober-drivers-are-going-to-jail-and-how-to-protect-yourself/) | 717 | 717 | +0.0% |
| [From Ticket-Taking to Platform-Building: Why We Are Pivoting to Product Mode](/2026/02/16/from-ticket-taking-to-platform-building-why-we-are-pivoting-to-product-mode/) | 564 | 564 | +0.0% |
| [Unmasking “Fresh Start Union”: The Fake Loan Scam Bombarding Your Phone](/2026/02/16/unmasking-fresh-start-union-the-fake-loan-scam-bombarding-your-phone/) | 599 | 599 | +0.0% |
| [Viral Fiction vs. Thermodynamic Fact: The Truth About AI Data Center Cooling](/2026/02/20/viral-fiction-vs-thermodynamic-fact-the-truth-about-ai-data-center-cooling/) | 538 | 538 | +0.0% |
| [New Podcast Launch: Welcome to The Architecture Archive (Plus a Little Feed Housekeeping)](/2026/03/27/new-podcast-launch-welcome-to-the-architecture-archive-plus-a-little-feed-housekeeping/) | 353 | 353 | +0.0% |
| [The Source Code of Atrocity: How “AI Psychosis” Hid the Truth Behind the Minab School Strike](/2026/04/11/the-source-code-of-atrocity-how-ai-psychosis-hid-the-truth-behind-the-minab-school-strike/) | 510 | 510 | +0.0% |
| [Terraforming Chamber 04.26: System Migration](/2026/04/25/terraforming-chamber-04-26-system-migration/) | 179 | 179 | +0.0% |
| [Deep Research to Podcast: The Complete 2026 AI Workflow](/2026/04/26/deep-research-to-podcast-in-an-hour/) | 649 | 649 | +0.0% |
| [The Eighty-Fourth Iteration: How Camacho Defied Thermodynamics to Craft the Impossible Maduro](/2026/04/26/impossible-architecture-camacho-triple-maduro/) | 1170 | 1170 | +0.0% |
| [The 4.2-Billion-Year-Old Ancestor: The Dawn of the Viral Wars](/2026/05/03/all-life-on-earth-comes-from-one-single-ancestor/) | 423 | 423 | +0.0% |
| [The Porcelain Collision: When Ancient Traditions Met Modern Military Logistics](/2026/05/09/the-porcelain-collision-afghan-war-logistics/) | 1537 | 1537 | +0.0% |
| [Beyond Bloodlines: How Ancient DNA is Rewriting the Caribbean—and Fueling Modern Culture Wars](/2026/05/10/caribbean-aquatic-motorway-dna-migrations/) | 788 | 788 | +0.0% |
| [Beyond the Headlines: 5 Surprising Realities of the 2026 US-Iran War](/2026/07/19/middle-east-total-war-2026/) | 1857 | 1857 | +0.0% |
| [From Prompt to Published: The Architecture of an AI Podcast Pipeline](/2026/08/05/ai-podcast-publishing-pipeline/) | 659 | 659 | +0.0% |
| [The Illusion of Containment: Engineering Lessons from the 2026 AI Sandbox Breaches](/2026/09/10/ai-sandbox-containment-hugging-face-artifactory-breach/) | 890 | 887 | -0.3% |
| [Confidently Wrong: Four AI Errors a Beta Game Client Caught in Four Hours](/2026/09/24/ai-confidently-wrong-wow-addon-verification/) | 1744 | 1740 | -0.2% |
| [Absent from the Docs, Present in the Client: Mapping WoW Forever’s Real API Surface](/2026/09/24/wow-forever-api-surface-build-69913/) | 1463 | 1459 | -0.3% |
| [About](/about/) | 150 | 150 | +0.0% |
| [Contact](/contact/) | 0 | 39 | — |

</details>
