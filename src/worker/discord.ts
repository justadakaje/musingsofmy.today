/**
 * Live Discord thread preview Worker endpoint (/api/discord/thread/:postId).
 * Zero external imports; uses build-time _discord-threads.json allowlist and strips all user snowflakes.
 */

import type { WorkerEnv } from './types.ts';

export interface DiscordDeps {
  fetchImpl?: typeof fetch;
  cache?: Cache | null;
}

interface DiscordAuthor {
  id?: string;
  username?: string;
  global_name?: string | null;
  bot?: boolean;
}

interface DiscordReaction {
  count?: number;
  emoji?: { name?: string | null; id?: string | null };
}

interface DiscordMessage {
  type?: number;
  content?: string;
  timestamp?: string;
  author?: DiscordAuthor;
  reactions?: DiscordReaction[];
}

interface DiscordChannel {
  message_count?: number;
}

export interface SanitizedMessage {
  authorName: string;
  initial: string;
  createdAt: string;
  text: string;
  reactions: Array<{ emoji: string; count: number }>;
}

const POST_ID_REGEX = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/;
const SNOWFLAKE_REGEX = /^\d{17,20}$/;
const DISCORD_GUILD_ID = '723592473527713853';
const DISCORD_INVITE_URL = 'https://discord.gg/AkmBGKPVFQ';

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  cacheControl: string = 'no-store',
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
      'X-Robots-Tag': 'noindex',
      ...extraHeaders,
    },
  });
}

function sanitizeDiscordContent(raw: string): string {
  return raw
    .replace(/<@!?\d+>/g, '@member')
    .replace(/<@&\d+>/g, '@role')
    .replace(/<#\d+>/g, '#channel')
    .replace(/<a?:([a-zA-Z0-9_]+):\d+>/g, ':$1:')
    .trim();
}

function toSafeMessages(rawMessages: unknown): SanitizedMessage[] {
  if (!Array.isArray(rawMessages)) return [];
  const sanitized: SanitizedMessage[] = [];

  for (const entry of rawMessages) {
    if (typeof entry !== 'object' || entry === null) continue;
    const m = entry as DiscordMessage;
    if (m.author?.bot) continue;
    if (m.type !== 0 && m.type !== 19) continue;

    const text = typeof m.content === 'string' ? sanitizeDiscordContent(m.content) : '';
    if (!text) continue;

    const displayName = (m.author?.global_name || m.author?.username || 'Member').trim() || 'Member';
    const initial = Array.from(displayName)[0]?.toUpperCase() || '?';
    const createdAt = typeof m.timestamp === 'string' ? m.timestamp : '';
    const reactions = Array.isArray(m.reactions)
      ? m.reactions
          .map((r) => ({
            emoji: typeof r?.emoji?.name === 'string' ? r.emoji.name : '',
            count: typeof r?.count === 'number' ? r.count : 0,
          }))
          .filter((r) => r.emoji.length > 0 && r.count > 0)
      : [];

    sanitized.push({
      authorName: displayName,
      initial,
      createdAt,
      text,
      reactions,
    });
  }

  // Discord returns newest-first by default; present replies chronologically.
  sanitized.reverse();
  return sanitized;
}

/** Handle GET /api/discord/thread/:postId with allowlist lookup, edge cache, and snowflake stripping. */
export async function handleDiscordThread(
  request: Request,
  env: WorkerEnv,
  deps?: DiscordDeps,
): Promise<Response> {
  if (request.method !== 'GET') {
    return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405, 'no-store', { Allow: 'GET' });
  }

  const url = new URL(request.url);
  const prefix = '/api/discord/thread/';
  if (!url.pathname.startsWith(prefix)) {
    return jsonResponse({ ok: false, error: 'not_found' }, 404);
  }

  const postId = url.pathname.slice(prefix.length).replace(/\/+$/, '');
  if (!POST_ID_REGEX.test(postId)) {
    return jsonResponse({ ok: false, error: 'invalid_post_id' }, 400);
  }

  const mapUrl = new URL('/_discord-threads.json', url.origin).toString();
  let mapRes: Response;
  try {
    mapRes = await env.ASSETS.fetch(mapUrl);
  } catch {
    return jsonResponse({ ok: false, error: 'not_found' }, 404);
  }
  if (!mapRes.ok) {
    return jsonResponse({ ok: false, error: 'not_found' }, 404);
  }

  let threadMap: unknown;
  try {
    threadMap = await mapRes.json();
  } catch {
    return jsonResponse({ ok: false, error: 'not_found' }, 404);
  }

  const threadId =
    typeof threadMap === 'object' &&
    threadMap !== null &&
    Object.prototype.hasOwnProperty.call(threadMap, postId)
      ? (threadMap as Record<string, unknown>)[postId]
      : undefined;

  if (typeof threadId !== 'string' || !SNOWFLAKE_REGEX.test(threadId)) {
    return jsonResponse({ ok: false, error: 'not_found' }, 404);
  }

  if (!env.DISCORD_BOT_TOKEN) {
    return jsonResponse({ ok: false, code: 'unconfigured' }, 503);
  }

  const edgeCache =
    deps?.cache !== undefined
      ? deps.cache
      : typeof caches !== 'undefined'
        ? ((caches as unknown as { default?: Cache }).default ?? null)
        : null;

  const cacheKey = new Request(`${url.origin}${prefix}${postId}`, { method: 'GET' });
  if (edgeCache) {
    try {
      const hit = await edgeCache.match(cacheKey);
      if (hit) return hit;
    } catch {
      // Cache read failures fall through cleanly to Discord API fetch.
    }
  }

  const fetchImpl = deps?.fetchImpl ?? fetch;
  const authHeaders = {
    Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
  };

  let channelRes: Response;
  let messagesRes: Response;
  try {
    [channelRes, messagesRes] = await Promise.all([
      fetchImpl(`https://discord.com/api/v10/channels/${threadId}`, { headers: authHeaders }),
      fetchImpl(`https://discord.com/api/v10/channels/${threadId}/messages?limit=20`, {
        headers: authHeaders,
      }),
    ]);
  } catch {
    return jsonResponse({ ok: false, error: 'upstream_error' }, 502);
  }

  if (channelRes.status === 404 || messagesRes.status === 404) {
    return jsonResponse({ ok: false, error: 'not_found' }, 404);
  }

  if (!channelRes.ok || !messagesRes.ok) {
    return jsonResponse({ ok: false, error: 'upstream_error' }, 502);
  }

  let channelData: DiscordChannel = {};
  let rawMessages: unknown = [];
  try {
    [channelData, rawMessages] = await Promise.all([
      channelRes.json() as Promise<DiscordChannel>,
      messagesRes.json(),
    ]);
  } catch {
    return jsonResponse({ ok: false, error: 'upstream_error' }, 502);
  }

  const messages = toSafeMessages(rawMessages);
  const replyCount =
    typeof channelData?.message_count === 'number' && Number.isFinite(channelData.message_count)
      ? channelData.message_count
      : messages.length;

  const response = jsonResponse(
    {
      ok: true,
      threadUrl: `https://discord.com/channels/${DISCORD_GUILD_ID}/${threadId}`,
      inviteUrl: DISCORD_INVITE_URL,
      replyCount,
      messages,
    },
    200,
    'public, s-maxage=300, stale-while-revalidate=600',
  );

  if (edgeCache) {
    try {
      await edgeCache.put(cacheKey, response.clone());
    } catch {
      // Cache write failure should never fail the API response.
    }
  }

  return response;
}
