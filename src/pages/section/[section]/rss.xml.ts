/**
 * /section/<section>/rss.xml: per-section full-text RSS 2.0 feed of the 10 newest posts.
 */
import type { APIContext } from 'astro';
import { getPosts } from '../../../lib/posts';
import { buildRssResponse } from '../../../lib/rss';
import { SECTIONS, SITE, type Section } from '../../../site';

export async function getStaticPaths() {
  return SECTIONS.map((section) => ({
    params: { section: section.id },
    props: { section },
  }));
}

export async function GET(context: APIContext<{ section: Section }>) {
  const { section } = context.props;
  const site = context.site ?? new URL(SITE.url);
  const posts = (await getPosts()).filter((p) => p.data.section === section.id);
  return buildRssResponse({
    title: `${SITE.title} · ${section.label}`,
    description: section.blurb,
    selfPath: `/section/${section.id}/rss.xml`,
    posts,
    site,
  });
}
