# Handoff: The Stenbane Question (blog series)

_Last updated 2026-11-06, 9:30 AM ET. Paused partway through Ken's read of Part 1._

## Status

- Five-part comedic fiction series about the WoW: Forever "Stenbane" alts. All five parts are written.
- Every part is set to **`draft: true`** and **nothing is committed**. The five post folders are untracked in git.
- **In-Browser Review & Live Editor established:** `scripts/stenbane-editor.mjs` runs on `http://localhost:4322/`. It is 100% self-contained and zero-dependency (no external CDNs, preloaded initial payload, built-in markdown parser, image serving from post directories, split/reader/editor view modes, and direct Ctrl+S save back to the `.mdx` files on disk). This is the preferred setup for all future blog review sessions.
- Astro dev server can run in parallel on port 4321 when final site layout preview is needed.

## Files

| Part | Folder (`src/content/posts/…`) | Title | Planned date | Images |
|---|---|---|---|---|
| 1 | `2026-11-12-the-stenbane-question-part-1/` | Name for the Tab? | Thu Nov 12 | all 9 alts + `naming-thun.jpg` |
| 2 | `2026-11-16-the-stenbane-question-part-2/` | You No Take Name | Mon Nov 16 | kobalt, ting |
| 3 | `2026-11-19-the-stenbane-question-part-3/` | Grave Matters | Thu Nov 19 | nick, penny |
| 4 | `2026-11-23-the-stenbane-question-part-4/` | The Earthmother and the Dream | Mon Nov 23 | thun, thor |
| 5 | `2026-11-26-the-stenbane-question-part-5/` | Two Names, One Metal | Thu Nov 26 (Thanksgiving) | wulf, tung |

All parts use `section: field-notes`, `categories: ["Writings", "Gaming"]`, and the tag `The Stenbane Question`.

## Where review stopped

Ken was reading **Part 1's "Behind the Scenes" section**. He got through the intro paragraphs and the name-split paragraph. **Still to review:** the rest of Part 1 (naming-game table, gallery, schedule, the story itself), then Parts 2–5.

## Corrections made during review (2026-11-06)

All in Part 1's Behind the Scenes:

1. **Krajed**: pronounced "caged". Ken played him from 2004 all the way through *Wrath of the Lich King*, then moved on to a different character and left him behind.
2. **The return**: Ken came back for *Classic Wrath* **with his daughter Ava** (not with Justin). That's when he rolled Tungstenbane, his first Alliance character and first Paladin. Tungstenbane went on into *Cataclysm* and eventually joined **Sassy Fiends**. Justin has been removed from the series.
3. **Aeldorath**: a **Skyborn Elf Hunter** (not a Night Elf, not Season of Discovery), rolled when Ken and Ava jumped into the **WoW: Forever beta** together. In the beta his name was **Aeldorath Zephrai**. At the production launch he rerolled as **Aeldorath Cirrostratus**.
4. **Why the name split**: besides Forever's two name boxes, everyone in Sassy Fiends always called him "Tung."

> [!WARNING]
> The source dossiers at `f:\scratch\musingsofmytoday\` (`TUNGSTENBANE_CONTEXT.md`, `TUNGSTENBANE_LORE.md`) still have the **old** facts: Justin during Classic Wrath/Cata, Aeldorath as a Night Elf in Season of Discovery. Treat the corrections above as canonical. I haven't edited those files.

## Story decisions that change the dossier lore (still need Ken's sign-off)

- Krajed hands off the tungsten ore and his compass at the **fall of Gnomeregan**, not on the eve of the Cataclysm in Blackrock. This keeps the handoff in the Classic timeline. Krajed's quote is kept word for word.
- **Krajed is Wulf's uncle.** He named Wulf after the wolframite. Wulf's line "Same stone" is the series' emotional payoff.
- **Ting is a Gnomeregan refugee** whom Tung carried out. She kept a singed braid from Tung's beard.
- I left out titanium and saronite (Northrend metals). The ore becomes the boss of Tung's shield.
- Part 5's Author's Note says Krajed was Ken's original Tauren Shaman and main from 2004. It doesn't yet mention "played through Wrath" or the "caged" pronunciation. Decide whether to repeat those there.

## Open decisions

1. **Release mechanism.** The site has no future-date filter, so a post goes live as soon as it's built with `draft: false`. Options:
   - **Manual:** on each release day, set that part to `draft: false`, commit, and push to `main`.
   - **Automated:** a scheduled GitHub Action that flips the flag for each part on its date. Not built yet.
2. **Dates.** If a date changes, rename the folder too (the build fails when the folder date and the frontmatter date disagree) and update the "previously" links in the later parts. Each part only links to earlier parts.
3. **Commit plan.** Small, separate commits, one per part, are suggested. Unrelated uncommitted work is already in the repo (`VALIDATION.md`, overlay, Spotify scripts, the dual-harness post), so stage only the Stenbane folders.

## Characters (canonical)

| Name | Race / Class | Name origin |
|---|---|---|
| Tung | Dwarf Paladin | Tungsten. Patriarch, Miner/Blacksmith |
| Tong | Dwarf Warrior | Tongs. Tung's twin ("older by four minutes") |
| Ting | Gnome Mage | Smallest vowel |
| Kobalt | Gnome Warlock | Cobalt, named after kobolds |
| Nick | Human Rogue | Nickel |
| Penny | Human Priest | Copper. Nick's opposite |
| Thor | Night Elf Druid | Thorium (Winterspring) |
| Thun | Tauren Shaman | Thunder + Tung |
| Wulf | Tauren Hunter | Wolfram (tungsten's other name) |

Supporting cast: Innkeeper Vizzie (goblin, Everlook inn), Fram (Wulf's wolf), Kobalt's imp.
