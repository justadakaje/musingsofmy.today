/**
 * Hand-edited / CLI-synced data for the front page and /llms.txt.
 * - `NOW` is updated via `npm run now -- --streaming "..." --building "..." --focus "..."` (scripts/update-now.mjs).
 * - `FEATURED` is the fallback featured post & terminal panel when no post has `featured: true` in frontmatter.
 * - `PROJECTS` (`GoldFinder` release tag/facts) is synced from GitHub Releases via `npm run sync:projects` (scripts/sync-projects.mjs).
 */
export const NOW = {
  updated: '2026-11-28',
  rows: [
    { k: 'streaming', v: 'twitch.tv/kenhenchan · WoW: Forever & live agentic builds', href: 'https://www.twitch.tv/kenhenchan' },
    { k: 'building', v: 'daw-agent-skills & musingsofmy.today platform' },
    // `latest ep` is filled in from the newest post with a podcast episode.
    { k: 'focus', v: 'Runtime Reality Dec 2 FAA hearing watch & DAW DSP forensics' },
  ],
};

/** Fallback featured post (folder name) and terminal lines if no post sets `featured: true`. */
export const FEATURED = {
  id: '2026-11-19-velvet-static',
  term: [
    { kind: 'prompt', text: 'velvet-static --sequence v2 --mixed' },
    { kind: 'x', text: '3 AI draft outliers', note: '— cut darksynth & EBM' },
    { kind: 'x', text: '6 web BPM mismatches', note: '— fixed vs Spotify grid' },
    { kind: 'ok', text: '+8 neuro-bass additions (35 tracks, 5 acts)' },
    { kind: 'ok', text: '14 Camelot seams · Act III ≤ 5 BPM' },
    { kind: 'ok', text: 'shipped via phone PKCE + SongShift' },
  ],
};

export const PROJECTS = [
  {
    status: { cls: 'ship', label: 'shipped · v2.0.3' },
    name: 'GoldFinder',
    blurb: 'Multi-client auction house deal & crafting arbitrage scanner with net profit after the AH cut, Disenchant EV, and Goblin Ledger P&L.',
    facts: ['v2.0.3 live on CurseForge', 'Forever, Retail, Classic Era & MoP', 'Goblin Ledger P&L, 30d charts & BiS bridge'],
    links: [
      { label: 'curseforge', href: 'https://www.curseforge.com/wow/addons/goldfinder' },
      { label: 'source', href: 'https://github.com/justadakaje/wow-addons' },
    ],
  },
  {
    status: { cls: 'live', label: 'live' },
    name: 'Sky Alerts',
    blurb: 'Real-time astronomy alerts from the ALeRCE broker (ZTF + Vera C. Rubin/LSST), paired with sky cutouts, observing forecasts, and a weekly plain-English digest.',
    facts: ['ALeRCE ZTF + Rubin/LSST broker stream', 'sky cutouts, observing forecast & audio brief', 'weekly Resend digest · skyalerts.space'],
    links: [{ label: 'open dashboard', href: 'https://skyalerts.space' }],
  },
  {
    status: { cls: 'live', label: 'live' },
    name: 'KenHen.Win',
    blurb: 'Local-first Warcraft alt roster poster and chroma-key portrait studio with Battle.net sync, green-screen cutter, and high-DPI canvas exports.',
    facts: ['Vite + TypeScript on Cloudflare Workers', 'zero-upload IndexedDB + RGBA chroma-key', 'companion /khr addon · Forever, Retail & Classic'],
    links: [
      { label: 'open studio', href: 'https://kenhen.win' },
      { label: 'companion addon', href: 'https://github.com/justadakaje/wow-addons/tree/master/addons/KenHenRoster' },
    ],
  },
  {
    status: { cls: 'test', label: 'in use' },
    name: 'wow-api MCP',
    blurb: "Answers WoW: Forever API questions from ForeverProbe's live client captures instead of LLM memory or retail wikis.",
    facts: ['ForeverProbe v0.7.0 · live client index', 'required gate across GoldFinder & BiSGearFinder', 'TypeScript MCP · MIT open source'],
    links: [
      { label: 'source', href: 'https://github.com/justadakaje/wow-addons/tree/master/mcp' },
    ],
  },
];
