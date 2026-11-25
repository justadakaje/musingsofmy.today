/**
 * /llms.txt: concise plain-text index of site structure, shows, projects, and latest posts
 * for LLM/agent discovery following the llms.txt convention.
 */
import type { APIContext } from 'astro';
import { PROJECTS } from '../data/home';
import { fmtDate, getPosts, postPath } from '../lib/posts';
import { SECTIONS, SHOWS, SHOW_IDS, SITE, sectionById } from '../site';

const LATEST_LIMIT = 15;

export async function GET(context: APIContext) {
  const site = context.site ?? new URL(SITE.url);
  const abs = (p: string) => new URL(p, site).toString();
  const posts = (await getPosts()).slice(0, LATEST_LIMIT);

  const lines: string[] = [
    `# ${SITE.title}`,
    '',
    `> ${SITE.description} Written by ${SITE.author}.`,
    '',
    `- URL: ${site.toString()}`,
    `- RSS: ${abs('/rss.xml')}`,
    `- Subscribe: ${abs('/subscribe/')}`,
    `- Search: ${abs('/search/')}`,
    `- Archive: ${abs('/archive/')}`,
    `- Podcasts: ${abs('/podcasts/')}`,
    '',
    '## Sections',
    '',
    ...SECTIONS.map((s) => `- [${s.label}](${abs(`/section/${s.id}/`)}): ${s.blurb}`),
    '',
    '## Podcasts',
    '',
    ...SHOW_IDS.map((id) => {
      const s = SHOWS[id];
      return `- ${s.name} (${s.kicker}): ${s.blurb} Apple Podcasts: ${s.apple} | Spotify: ${s.spotify} | RSS: ${abs(s.rss)}`;
    }),
    '',
    '## Projects',
    '',
    ...PROJECTS.map((pr) => {
      const links = pr.links.map((l) => `${l.label}: ${l.href}`).join(' | ');
      return `- ${pr.name} (${pr.status.label}): ${pr.blurb} ${links}`;
    }),
    '',
    `## Latest ${posts.length} Posts`,
    '',
    ...posts.map((p) => {
      const sec = sectionById(p.data.section).label;
      const desc = p.data.description ? ` — ${p.data.description}` : '';
      return `- [${p.data.title}](${abs(postPath(p))}) (${fmtDate(p.data.date)}, ${sec})${desc}`;
    }),
  ];

  return new Response(`${lines.join('\n')}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
