import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 8889;
const CREDENTIALS_FILE = 'C:\\Users\\khens\\.gemini\\config\\spotify_credentials.json';
const OVERLAY_JSON_FILE = 'D:\\Code\\GitHub\\musingsofmy.today\\public\\overlay\\now-playing.json';

let cachedTrack = { isPlaying: false };
let lastFetchTime = 0;
const CACHE_TTL_MS = 3000; // 3 second cache

function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    throw new Error(`Credentials file not found: ${CREDENTIALS_FILE}`);
  }
  return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
}

async function refreshAccessToken(creds) {
  console.log('🔄 Refreshing Spotify access token...');
  const basicAuth = Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString('base64');
  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: creds.refresh_token,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Failed to refresh token (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  creds.access_token = data.access_token;
  if (data.refresh_token) creds.refresh_token = data.refresh_token;
  creds.expires_at = Date.now() + (data.expires_in * 1000);
  creds.updated_at = new Date().toISOString();

  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), 'utf8');
  console.log('✅ Access token refreshed successfully.');
  return creds.access_token;
}

async function getValidToken() {
  const creds = loadCredentials();
  // Refresh if within 2 minutes of expiration
  if (Date.now() > (creds.expires_at - 120000)) {
    return await refreshAccessToken(creds);
  }
  return creds.access_token;
}

export async function fetchCurrentlyPlaying() {
  const now = Date.now();
  if (now - lastFetchTime < CACHE_TTL_MS) {
    return cachedTrack;
  }

  try {
    let token = await getValidToken();
    let resp = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    // Handle token expiration retry
    if (resp.status === 401) {
      console.warn('Received 401, forcing token refresh...');
      const creds = loadCredentials();
      token = await refreshAccessToken(creds);
      resp = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
    }

    // Handle rate limits
    if (resp.status === 429) {
      const retryAfter = parseInt(resp.headers.get('Retry-After') || '5', 10);
      console.warn(`⚠️ Spotify rate limit (429). Retrying after ${retryAfter}s`);
      lastFetchTime = now + (retryAfter * 1000);
      return cachedTrack;
    }

    if (resp.status === 204 || resp.status === 202) {
      cachedTrack = { isPlaying: false, updatedAt: new Date().toISOString() };
    } else if (resp.ok) {
      const data = await resp.json();
      if (data && data.item && data.is_playing) {
        cachedTrack = {
          isPlaying: true,
          title: data.item.name || 'Unknown Track',
          artist: (data.item.artists || []).map(a => a.name).join(', ') || 'Unknown Artist',
          album: data.item.album?.name || '',
          albumArt: data.item.album?.images?.[0]?.url || '',
          durationMs: data.item.duration_ms || 0,
          progressMs: data.progress_ms || 0,
          spotifyUrl: data.item.external_urls?.spotify || '',
          updatedAt: new Date().toISOString(),
        };
      } else {
        cachedTrack = { isPlaying: false, updatedAt: new Date().toISOString() };
      }
    } else {
      console.warn(`Unexpected Spotify status: ${resp.status}`);
      cachedTrack = { isPlaying: false, error: resp.status };
    }
  } catch (err) {
    console.error('Error fetching currently playing:', err.message);
  }

  lastFetchTime = Date.now();

  // Save to public overlay JSON for static reference
  try {
    fs.writeFileSync(OVERLAY_JSON_FILE, JSON.stringify(cachedTrack, null, 2), 'utf8');
  } catch (_) {}

  return cachedTrack;
}

// Micro HTTP Server for Overlay CORS requests
const server = http.createServer(async (req, res) => {
  // Enable CORS for stream overlay browser sources
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (reqUrl.pathname === '/now-playing' || reqUrl.pathname === '/api/now-playing') {
    const data = await fetchCurrentlyPlaying();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    res.end(JSON.stringify(data));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`🎶 Spotify Overlay Daemon active on http://127.0.0.1:${PORT}/now-playing`);
  // Immediate poll
  fetchCurrentlyPlaying().then(track => {
    if (track.isPlaying) {
      console.log(`▶ Now Playing: "${track.title}" by ${track.artist}`);
    } else {
      console.log('⏸ No track currently playing.');
    }
  });
});
