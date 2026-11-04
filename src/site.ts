/**
 * Site-wide facts in one place: identity, the five sections, the two podcasts.
 * The import script, the routes, the redirects and the RSS feed all read from here,
 * so a section rename is a one-line change.
 */

export const SITE = {
  title: 'Musings of My Today',
  domain: 'musingsofmy.today',
  url: 'https://musingsofmy.today',
  description: 'The weblog of a curious mind.',
  author: 'Kenneth Henseler',
  /** WordPress permalinks use the site's local date, so URLs are computed in this zone. */
  timezone: 'America/Chicago',
  /** Reading speed used for "N min read" (same as the mockup). */
  wordsPerMinute: 230,
} as const;

export const SECTION_IDS = ['engineering', 'history-politics', 'science-nature', 'signal', 'field-notes'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export interface Section {
  id: SectionId;
  label: string;
  /** Small grey suffix on the lane chip, e.g. "signal  music". */
  hint?: string;
  /** Colour class used on log rows (matches blog-mock.html). */
  tone: '' | 'h' | 's' | 'm' | 'f';
  blurb: string;
  /** Original WordPress categories this lane absorbs (PLAN.md). Drives old /category/ redirects. */
  categories: { name: string; path: string }[];
}

export const SECTIONS: Section[] = [
  {
    id: 'engineering',
    label: 'engineering',
    tone: '',
    blurb: 'Platform engineering, AI systems that misbehave, WoW addons and the tools behind them.',
    categories: [
      { name: 'Technology', path: 'technology' },
      { name: 'AI', path: 'technology/ai' },
      { name: 'Gaming', path: 'gaming' },
      { name: 'Design', path: 'design' },
      { name: 'Business', path: 'business' },
    ],
  },
  {
    id: 'history-politics',
    label: 'history & politics',
    tone: 'h',
    blurb: 'History, government and the systems people build to run each other.',
    categories: [
      { name: 'History', path: 'history' },
      { name: 'Politics', path: 'politics' },
      { name: 'Government', path: 'government' },
      { name: 'True Crime', path: 'true-crime' },
    ],
  },
  {
    id: 'science-nature',
    label: 'science & nature',
    tone: 's',
    blurb: 'Biology, space, plants, animals and trails.',
    categories: [
      { name: 'Science', path: 'science' },
      { name: 'Nature', path: 'nature' },
      { name: 'Biology', path: 'biology' },
      { name: 'Space', path: 'space' },
      { name: 'Plants', path: 'plants' },
      { name: 'Animals', path: 'animals' },
    ],
  },
  {
    id: 'signal',
    label: 'signal',
    hint: 'music',
    tone: 'm',
    blurb: 'Monthly playlists, explained, and the occasional lyric taken apart.',
    categories: [
      { name: 'Music', path: 'music' },
      { name: 'Playlist Explained', path: 'music/playlist-explained' },
      { name: 'LyricalAnalysis', path: 'music/lyricalanalysis' },
    ],
  },
  {
    id: 'field-notes',
    label: 'field notes',
    tone: 'f',
    blurb: 'Writing, poetry, cigars, food, film, travel and money.',
    categories: [
      { name: 'Writings', path: 'writings' },
      { name: 'Poetry', path: 'poetry' },
      { name: 'Cigars', path: 'cigars' },
      { name: 'Food', path: 'food' },
      { name: 'Films', path: 'films' },
      { name: 'Travel', path: 'travel' },
      { name: 'Finance', path: 'finance' },
      { name: 'Mini Motorways', path: 'gaming/mini-motorways' },
      { name: 'calaveras literarias', path: 'poetry/calaveras-literarias' },
    ],
  },
];

export const sectionById = (id: SectionId): Section => {
  const s = SECTIONS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown section "${id}"`);
  return s;
};

export const SHOW_IDS = ['runtime-reality', 'chronos-archive'] as const;
export type ShowId = (typeof SHOW_IDS)[number];

export interface Show {
  id: ShowId;
  name: string;
  short: string;
  kicker: string;
  blurb: string;
  appleId: string;
  apple: string;
  spotify: string;
  tone: 'rr' | 'ca';
}

export const SHOWS: Record<ShowId, Show> = {
  'runtime-reality': {
    id: 'runtime-reality',
    name: 'Runtime Reality',
    short: 'RR',
    kicker: 'TECH · INFRASTRUCTURE · AI',
    blurb: 'Engineering post-mortems in plain English.',
    appleId: 'id1887004265',
    apple: 'https://podcasts.apple.com/us/podcast/runtime-reality/id1887004265',
    spotify: 'https://open.spotify.com/show/7dApwSu5skMv03dZHTZEIK',
    tone: 'rr',
  },
  'chronos-archive': {
    id: 'chronos-archive',
    name: 'The Chronos Archive',
    short: 'CA',
    kicker: 'HISTORY · SCIENCE',
    blurb: 'Deep dives where old history collides with modern systems.',
    appleId: 'id1831231439',
    apple: 'https://podcasts.apple.com/us/podcast/the-chronos-archive/id1831231439',
    spotify: 'https://open.spotify.com/show/5ZkuVRGr2KvzQQA2iBwg2k',
    tone: 'ca',
  },
};

export const SOCIAL = [
  { label: 'github · justadakaje', href: 'https://github.com/justadakaje' },
  { label: 'twitch · kenhenchan', href: 'https://www.twitch.tv/kenhenchan' },
  { label: 'youtube · @KenHenChan', href: 'https://www.youtube.com/@KenHenChan' },
  { label: 'threads · @kjhenseler', href: 'https://www.threads.com/@kjhenseler' },
  { label: 'linkedin · kennethhenseler', href: 'https://www.linkedin.com/in/kennethhenseler' },
];

export const SUPPORT = [
  { label: 'github sponsors', href: 'https://github.com/sponsors/justadakaje' },
  { label: 'goldfinder on curseforge', href: 'https://www.curseforge.com/wow/addons/goldfinder' },
  { label: 'rss feed', href: '/rss.xml' },
];

/**
 * Comments: archived WordPress comments render read-only under each post.
 * New comments use Giscus (GitHub Discussions) once these IDs are filled in from
 * https://giscus.app after enabling Discussions and installing the giscus app on the repo.
 * Leave repoId empty to keep new comments off.
 */
export const GISCUS = {
  repo: 'justadakaje/musingsofmy.today',
  repoId: '',
  category: 'Comments',
  categoryId: '',
};
