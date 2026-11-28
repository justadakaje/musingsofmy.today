/**
 * /rss.xml: full-text feed of the 10 newest posts (WordPress served 10, full text).
 */
import type { APIContext } from 'astro';
import { getPosts } from '../lib/posts';
import { buildRssResponse } from '../lib/rss';
import { SITE } from '../site';

export async function GET(context: APIContext) {
  const site = context.site ?? new URL(SITE.url);
  const posts = await getPosts();
  return buildRssResponse({
    title: SITE.title,
    description: SITE.description,
    selfPath: '/rss.xml',
    posts,
    site,
  });
}
