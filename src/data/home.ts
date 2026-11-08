/**
 * Hand-edited bits of the front page. Everything else on it comes from the posts.
 * Update `now` when the work changes; `updated` is shown under it, so keep it honest.
 */
export const NOW = {
  updated: '2026-11-08',
  rows: [
    { k: 'streaming', v: 'twitch.tv/kenhenchan · LIVE NOW! 🔴', href: 'https://www.twitch.tv/kenhenchan' },
    { k: 'building', v: 'BiSFinder: Best-in-Slot BoE Arbitrage & Scarcity Radar (#55)' },
    // `latest ep` is filled in from the newest post with a podcast episode.
    { k: 'focus', v: 'GoldFinder v1.0.0 Production Gold Master & BiSFinder Kickoff' },
  ],
};

/** The featured post (folder name) and the little terminal beside it. */
export const FEATURED = {
  id: '2026-11-07-goldfinder-v1-production-gold-master',
  term: [
    { kind: 'prompt', text: 'goldfinder --verify-release-v1.0.0' },
    { kind: 'x', text: 'CopyToClipboard()', note: '— protected sandbox call' },
    { kind: 'x', text: 'FrameUtil secret alpha', note: '— Chomp filter taint' },
    { kind: 'x', text: 'right-justified values', note: '— coin icon border overflow' },
    { kind: 'ok', text: 'HUD Edit Mode profiles & relative anchoring' },
    { kind: 'ok', text: 'published to CurseForge #1715781' },
  ],
};

export const PROJECTS = [
  {
    status: { cls: 'ship', label: 'shipped · v1.0.0' },
    name: 'GoldFinder',
    blurb: 'An auction house tab that finds crafting materials listed well below their usual price, with net profit after the AH cut.',
    facts: ['v1.0.0 live on CurseForge', 'P&L ledger, snipe mode, HUD profiles', 'MIT · open source'],
    links: [
      { label: 'curseforge', href: 'https://www.curseforge.com/wow/addons/goldfinder' },
      { label: 'source', href: 'https://github.com/justadakaje/wow-addons' },
    ],
  },
  {
    status: { cls: 'test', label: 'in use' },
    name: 'wow-api MCP',
    blurb: "Answers WoW: Forever API questions from the live client's API index, not from memory or the wiki.",
    facts: ['required on every addon in the repo', "catches APIs that don't exist", 'TypeScript · open source'],
    links: [
      { label: 'source', href: 'https://github.com/justadakaje/wow-addons/tree/master/mcp' },
    ],
  },
  {
    status: { cls: 'live', label: 'live' },
    name: 'Sky Alerts',
    blurb: 'Astronomy alerts from ALeRCE (ZTF + Rubin/LSST), with a weekly plain-English digest.',
    facts: ['Next.js · Neon Postgres · Vercel', 'public dashboard', 'sky.henseler.app'],
    links: [{ label: 'open dashboard', href: 'https://sky.henseler.app' }],
  },
];
