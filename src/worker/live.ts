/**
 * Edge-cached Twitch Live Pulse Worker endpoint (/api/live).
 * Zero external imports; never leaks credentials or throws 500 on upstream failures.
 */

import type { WorkerEnv } from './types.ts';

export interface LiveDeps {
  fetchImpl?: typeof fetch;
  cache?: Cache | null;
}

interface TwitchTokenResponse {
  access_token?: string;
}

interface TwitchStreamItem {
  type?: string;
  title?: string;
  game_name?: string;
  viewer_count?: number;
  started_at?: string;
}

interface TwitchStreamsResponse {
  data?: TwitchStreamItem[];
}

const TWITCH_LOGIN = 'kenhenchan';
const TWITCH_CHANNEL_URL = `https://www.twitch.tv/${TWITCH_LOGIN}`;
const CACHE_CONTROL_LIVE = 'public, s-maxage=60, stale-while-revalidate=120';

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  cacheControl: string,
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

function offlineResponse(): Response {
  return jsonResponse(
    { ok: true, live: false, channelUrl: TWITCH_CHANNEL_URL },
    200,
    CACHE_CONTROL_LIVE,
  );
}

async function fetchAppAccessToken(
  clientId: string,
  clientSecret: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  try {
    const tokenRes = await fetchImpl('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }).toString(),
    });
    if (!tokenRes.ok) return null;
    const data = (await tokenRes.json()) as TwitchTokenResponse;
    return typeof data?.access_token === 'string' && data.access_token.length > 0
      ? data.access_token
      : null;
  } catch {
    return null;
  }
}

async function queryHelixStream(
  clientId: string,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<{ status: number; data: TwitchStreamsResponse | null }> {
  const res = await fetchImpl(`https://api.twitch.tv/helix/streams?user_login=${TWITCH_LOGIN}`, {
    method: 'GET',
    headers: {
      'Client-Id': clientId,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    return { status: res.status, data: null };
  }
  const data = (await res.json()) as TwitchStreamsResponse;
  return { status: res.status, data };
}

/** Handle GET /api/live with edge caching and graceful offline fallback. */
export async function handleLiveStatus(
  request: Request,
  env: WorkerEnv,
  deps?: LiveDeps,
): Promise<Response> {
  if (request.method !== 'GET') {
    return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405, 'no-store', { Allow: 'GET' });
  }

  const clientId = env.TWITCH_CLIENT_ID?.trim() || '';
  const staticToken = env.TWITCH_ACCESS_TOKEN?.trim() || '';
  const clientSecret = env.TWITCH_CLIENT_SECRET?.trim() || '';

  if (!clientId || (!staticToken && !clientSecret)) {
    return offlineResponse();
  }

  const url = new URL(request.url);
  const edgeCache =
    deps?.cache !== undefined
      ? deps.cache
      : typeof caches !== 'undefined'
        ? ((caches as unknown as { default?: Cache }).default ?? null)
        : null;

  const cacheKey = new Request(`${url.origin}/api/live`, { method: 'GET' });
  if (edgeCache) {
    try {
      const hit = await edgeCache.match(cacheKey);
      if (hit) return hit;
    } catch {
      // Cache read failures fall through cleanly to Twitch Helix fetch.
    }
  }

  const fetchImpl = deps?.fetchImpl ?? fetch;

  try {
    let token = staticToken || (await fetchAppAccessToken(clientId, clientSecret, fetchImpl));
    if (!token) {
      return offlineResponse();
    }

    let helix = await queryHelixStream(clientId, token, fetchImpl);

    // If a pre-configured token expired and a client secret is available, refresh once.
    if (helix.status === 401 && staticToken && clientSecret) {
      const refreshed = await fetchAppAccessToken(clientId, clientSecret, fetchImpl);
      if (!refreshed) return offlineResponse();
      token = refreshed;
      helix = await queryHelixStream(clientId, token, fetchImpl);
    }

    if (!helix.data) {
      return offlineResponse();
    }

    const stream = Array.isArray(helix.data.data) ? helix.data.data[0] : undefined;
    const response =
      stream?.type === 'live'
        ? jsonResponse(
            {
              ok: true,
              live: true,
              channelUrl: TWITCH_CHANNEL_URL,
              title: typeof stream.title === 'string' ? stream.title.slice(0, 200) : '',
              gameName: typeof stream.game_name === 'string' ? stream.game_name.slice(0, 120) : '',
              viewerCount:
                typeof stream.viewer_count === 'number' && Number.isFinite(stream.viewer_count)
                  ? stream.viewer_count
                  : 0,
              startedAt: typeof stream.started_at === 'string' ? stream.started_at : '',
            },
            200,
            CACHE_CONTROL_LIVE,
          )
        : offlineResponse();

    if (edgeCache) {
      try {
        await edgeCache.put(cacheKey, response.clone());
      } catch {
        // Cache write failure should never fail the API response.
      }
    }

    return response;
  } catch {
    return offlineResponse();
  }
}
