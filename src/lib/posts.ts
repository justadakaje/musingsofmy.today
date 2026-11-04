import { getCollection, type CollectionEntry } from 'astro:content';
import { SITE } from '../site';
import tagSlugOverrides from '../data/tag-slugs.json';

export type Post = CollectionEntry<'posts'>;

const FOLDER = /^(\d{4})-(\d{2})-(\d{2})-([a-z0-9][a-z0-9-]*)$/;

/** YYYY-MM-DD of an instant, in the site's timezone (where WordPress computed permalinks). */
export function localDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SITE.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * The permalink, from the folder name. The folder is the source of truth so a URL never
 * moves by accident; the date in frontmatter must agree with it, or the build fails.
 */
export function postPath(post: Post): string {
  const m = FOLDER.exec(post.id);
  if (!m) {
    throw new Error(`Post folder "${post.id}" must be named YYYY-MM-DD-slug (lowercase, hyphens).`);
  }
  const [, y, mo, d, slug] = m;
  const folderDate = `${y}-${mo}-${d}`;
  const dated = localDate(post.data.date);
  if (dated !== folderDate) {
    throw new Error(
      `Post "${post.id}": folder says ${folderDate} but date is ${dated} in ${SITE.timezone}. ` +
        `Fix one of them (and quote the date with its offset).`,
    );
  }
  return `/${y}/${mo}/${d}/${slug}/`;
}

export function postParams(post: Post) {
  const [, year, month, day, slug] = FOLDER.exec(post.id) ?? [];
  return { year, month, day, slug };
}

/** Published posts, newest first. Drafts build only in `astro dev`. */
export async function getPosts(): Promise<Post[]> {
  const all = await getCollection('posts', ({ data }) => import.meta.env.DEV || !data.draft);
  return all.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function readMinutes(body: string | undefined): number {
  const words = (body ?? '')
    .replace(/^import .*$/gm, '')
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return Math.max(1, Math.round(words / SITE.wordsPerMinute));
}

/** WordPress-compatible tag slug: lowercase, punctuation dropped, spaces to hyphens. */
export function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&[a-z]+;/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Tag URLs must match WordPress's /tag/<slug>/ exactly; the importer records any exceptions. */
export function tagSlug(name: string): string {
  return (tagSlugOverrides as Record<string, string>)[name] ?? slugify(name);
}

export const fmtDate = (d: Date) => localDate(d);
