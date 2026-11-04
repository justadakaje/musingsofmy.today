/**
 * /sitemap.xml at the same address WordPress used, so Search Console needs no change.
 */
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import { getPosts, postPath, tagSlug } from '../lib/posts';
import { SECTIONS, SITE } from '../site';

export async function GET(context: APIContext) {
  const site = context.site ?? new URL(SITE.url);
  const posts = await getPosts();
  const pages = await getCollection('pages');
  const urls: { loc: string; lastmod?: Date }[] = [
    { loc: '/', lastmod: posts[0]?.data.date },
    { loc: '/archive/' },
    { loc: '/podcasts/' },
    ...pages.map((p) => ({ loc: `/${p.id}/`, lastmod: p.data.updated })),
    ...SECTIONS.map((s) => ({ loc: `/section/${s.id}/` })),
    ...posts.map((p) => ({ loc: postPath(p), lastmod: p.data.updated ?? p.data.date })),
    ...[...new Set(posts.flatMap((p) => p.data.tags.map(tagSlug)))].filter(Boolean).map((t) => ({ loc: `/tag/${t}/` })),
  ];
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls
      .map((u) => `  <url><loc>${new URL(u.loc, site)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.toISOString()}</lastmod>` : ''}</url>`)
      .join('\n') +
    '\n</urlset>\n';
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
