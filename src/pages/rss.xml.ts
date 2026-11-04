/**
 * /rss.xml: full-text feed of the 10 newest posts (WordPress served 10, full text).
 * Imported posts keep WordPress's <guid> (http://musingsofmy.today/?p=ID) so feed readers
 * recognise them and don't re-deliver old posts as new after the move.
 */
import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { loadRenderers } from 'astro:container';
import { getContainerRenderer as mdxRenderer } from '@astrojs/mdx/container-renderer';
import { render } from 'astro:content';
import sanitizeHtml from 'sanitize-html';
import { getPosts, postPath } from '../lib/posts';
import { mdxComponents } from '../components/mdx';
import { SITE, sectionById } from '../site';

const FEED_SIZE = 10;

function absolutize(html: string, site: URL) {
  return html.replace(/(\s(?:src|href|poster)=")(\/[^"]*)"/g, (_m, attr, p) => `${attr}${new URL(p, site)}"`)
    .replace(/(\ssrcset=")([^"]*)"/g, (_m, attr, set) => `${attr}${set.split(',').map((part: string) => {
      const [u, w] = part.trim().split(/\s+/);
      return `${u.startsWith('/') ? new URL(u, site) : u}${w ? ` ${w}` : ''}`;
    }).join(', ')}"`);
}

export async function GET(context: APIContext) {
  const site = context.site ?? new URL(SITE.url);
  const renderers = await loadRenderers([mdxRenderer()]);
  const container = await AstroContainer.create({ renderers });
  const posts = (await getPosts()).slice(0, FEED_SIZE);

  const items = [];
  for (const post of posts) {
    const { Content } = await render(post);
    const raw = await container.renderToString(Content, { props: { components: mdxComponents } });
    const content = sanitizeHtml(absolutize(raw, site), {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'figure', 'figcaption', 'iframe', 'audio', 'video', 'source', 'sup', 'sub']),
      allowedAttributes: {
        a: ['href', 'title'],
        img: ['src', 'srcset', 'sizes', 'alt', 'width', 'height', 'loading'],
        iframe: ['src', 'title', 'width', 'height', 'allow', 'allowfullscreen', 'loading'],
        audio: ['src', 'controls'],
        video: ['src', 'controls', 'poster'],
        source: ['src', 'type'],
        '*': ['id'],
      },
      allowedSchemes: ['http', 'https', 'mailto'],
    });
    const link = new URL(postPath(post), site).toString();
    const guid = post.data.legacy?.guid ?? link;
    items.push({
      title: post.data.title,
      link,
      pubDate: post.data.date,
      description: post.data.description,
      content,
      categories: [sectionById(post.data.section).label, ...post.data.tags],
      author: SITE.author,
      customData: `<guid isPermaLink="${guid === link}">${guid}</guid><dc:creator><![CDATA[${SITE.author}]]></dc:creator>`,
    });
  }

  return rss({
    title: SITE.title,
    description: SITE.description,
    site,
    items,
    xmlns: { dc: 'http://purl.org/dc/elements/1.1/', atom: 'http://www.w3.org/2005/Atom' },
    customData: `<language>en</language><atom:link href="${new URL('/rss.xml', site)}" rel="self" type="application/rss+xml" />`,
    trailingSlash: true,
  });
}
