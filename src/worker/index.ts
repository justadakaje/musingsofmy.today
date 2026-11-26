/**
 * Cloudflare Worker entrypoint for /api/* routes with static asset fallback.
 * Zero external imports; uses explicit .ts extensions for Wrangler & Node compatibility.
 */

import { handleDiscordThread } from './discord.ts';
import { handleNewsletterDispatch } from './dispatch.ts';
import { handleSubscribe } from './subscribe.ts';
import type { WorkerEnv } from './types.ts';

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/api/subscribe/dispatch') {
      return handleNewsletterDispatch(request, env);
    }

    if (pathname === '/api/subscribe' || pathname.startsWith('/api/subscribe/')) {
      return handleSubscribe(request, env);
    }

    if (pathname.startsWith('/api/discord/thread/')) {
      return handleDiscordThread(request, env);
    }

    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ ok: false, error: 'not_found' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex',
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
