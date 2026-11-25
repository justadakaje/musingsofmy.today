import type { APIRoute } from 'astro';
import { renderPostOgPng } from '../../lib/og-card';
import { getPosts, type Post } from '../../lib/posts';

export async function getStaticPaths() {
  const posts = await getPosts();
  return posts
    .filter((post) => !post.data.cover)
    .map((post) => ({
      params: { id: post.id },
      props: { post },
    }));
}

export const GET: APIRoute = async ({ props }) => {
  const { post } = props as { post: Post };
  const png = await renderPostOgPng(post);
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
