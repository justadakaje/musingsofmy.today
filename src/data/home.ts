/**
 * Hand-edited bits of the front page. Everything else on it comes from the posts.
 * Update `now` when the work changes; `updated` is shown under it, so keep it honest.
 */
export const NOW = {
  updated: '2026-11-04',
  rows: [
    { k: 'building', v: 'GoldFinder: live testing on build 70707 & in-tab search (#24)' },
    { k: 'next', v: 'WoW: Forever Launch Live Stream · today @ 5:00 PM EST', href: 'https://www.twitch.tv/kenhenchan' },
    // `latest ep` is filled in from the newest post with a podcast episode.
    { k: 'streaming', v: 'twitch.tv/kenhenchan · Live today @ 5 PM EST', href: 'https://www.twitch.tv/kenhenchan' },
  ],
};

/** The featured post (folder name) and the little terminal beside it. */
export const FEATURED = {
  id: '2026-09-24-ai-confidently-wrong-wow-addon-verification',
  term: [
    { kind: 'prompt', text: 'verify --against running-client' },
    { kind: 'x', text: 'API "absent" from the docs', note: '— present' },
    { kind: 'x', text: 'migration', note: '— would destroy its data' },
    { kind: 'x', text: 'textbook separator', note: '— broke every message' },
    { kind: 'x', text: 'rescue plan', note: '— overwrote real data' },
    { kind: 'ok', text: 'caught before shipping' },
  ],
};

export const PROJECTS = [
  {
    status: { cls: 'ship', label: 'shipped · v0.2.0' },
    name: 'GoldFinder',
    blurb: 'An auction house tab that finds crafting materials listed well below their usual price, with net profit after the AH cut.',
    facts: ['v0.2.0 live on CurseForge', 'price trends, tooltip prices, CSV export', 'MIT · open source'],
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
