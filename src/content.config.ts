import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { SECTION_IDS, SHOW_IDS } from './site';

/**
 * Dates must carry a time and a UTC offset, because the permalink date is the
 * *local* date in America/Chicago. "2026-09-24" alone would be read as UTC midnight,
 * which is 2026-09-23 in Indiana/Chicago, and the post would land on the wrong URL.
 * Quote the value in YAML: date: "2026-09-24T21:55:13-05:00"
 */
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const zonedDate = z
  .union([
    z.string().regex(ISO_WITH_OFFSET, {
      message: 'needs a time and a timezone offset, quoted, e.g. "2026-09-24T21:55:13-05:00"',
    }),
    // Unquoted YAML timestamps arrive as Date objects. They are only safe if they had a
    // time part; the folder-name check in src/lib/posts.ts catches date-only values.
    z.date(),
  ])
  .transform((v) => (v instanceof Date ? v : new Date(v)));

const legacy = z
  .object({
    wpcom_id: z.number().int().positive(),
    /** All-time views on WordPress.com, filled from the stats export (0 = not exported yet). */
    views_all_time: z.number().int().nonnegative().default(0),
    /** Approved comments + pingbacks on WordPress.com; archived in data/wpcom/comments.json. */
    comments: z.number().int().nonnegative().default(0),
    /** RSS <guid> WordPress used. Kept so feed readers don't re-deliver old posts as new. */
    guid: z.string().optional(),
    /** wp.me short link, for reference. */
    short_url: z.string().optional(),
  })
  .strict();

const posts = defineCollection({
  // One folder per post: src/content/posts/YYYY-MM-DD-slug/index.mdx, images beside it.
  loader: glob({
    pattern: '*/index.{md,mdx}',
    base: './src/content/posts',
    generateId: ({ entry }) => entry.split('/')[0],
  }),
  schema: ({ image }) =>
    z
      .object({
        title: z.string().min(1),
        date: zonedDate,
        updated: zonedDate.optional(),
        section: z.enum(SECTION_IDS),
        /** Original WordPress categories, kept for history and search. */
        categories: z.array(z.string()).default([]),
        tags: z.array(z.string()).default([]),
        description: z.string().default(''),
        cover: z
          .object({
            src: image(),
            alt: z.string().default(''),
            /** The cover also appears in the post body, so don't repeat it above the text. */
            inline: z.boolean().default(false),
          })
          .strict()
          .optional(),
        podcast: z
          .object({
            show: z.enum(SHOW_IDS),
            episode: z.string().optional(),
            title: z.string().optional(),
            apple: z.url().optional(),
            spotify: z.url().optional(),
            youtube: z.url().optional(),
          })
          .strict()
          .optional(),
        draft: z.boolean().default(false),
        legacy: legacy.optional(),
      })
      .strict(),
});

const pages = defineCollection({
  loader: glob({
    pattern: '*/index.{md,mdx}',
    base: './src/content/pages',
    generateId: ({ entry }) => entry.split('/')[0],
  }),
  schema: z
    .object({
      title: z.string().min(1),
      description: z.string().default(''),
      updated: zonedDate.optional(),
      legacy: legacy.optional(),
    })
    .strict(),
});

export const collections = { posts, pages };
