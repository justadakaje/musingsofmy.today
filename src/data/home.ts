/**
 * Hand-edited bits of the front page. Everything else on it comes from the posts.
 * Update `now` when the work changes; `updated` is shown under it, so keep it honest.
 */
export const NOW = {
  updated: '2026-11-24',
  rows: [
    { k: 'streaming', v: 'twitch.tv/kenhenchan · off for Thanksgiving week', href: 'https://www.twitch.tv/kenhenchan' },
    { k: 'building', v: 'daw-agent-skills: Audio DSP forensics for DAW copilots (#2)' },
    // `latest ep` is filled in from the newest post with a podcast episode.
    { k: 'focus', v: 'DAW Agent Skills, skyalerts.space & Thanksgiving break' },
  ],
};

/** The featured post (folder name) and the little terminal beside it. */
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
    status: { cls: 'ship', label: 'shipped · v2.0.1' },
    name: 'GoldFinder',
    blurb: 'An auction house tab that finds crafting materials listed well below their usual price, with net profit after the AH cut.',
    facts: ['v2.0.1 live on CurseForge', 'P&L ledger, Smart Buy parity, HUD profiles', 'MIT · open source'],
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
    facts: ['Flutter Web · Firestore · Firebase', 'public dashboard + audio brief', 'skyalerts.space'],
    links: [{ label: 'open dashboard', href: 'https://skyalerts.space' }],
  },
];
