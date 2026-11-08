import http from 'node:http';
import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '9127cb3052804477b2c45305357c0413';
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || 'f5db2487a4cf4b18a5ff2a4615840dfe';
const PORT = 8888;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = ['user-read-currently-playing', 'user-read-playback-state'].join(' ');

const CREDENTIALS_DIR = 'C:\\Users\\khens\\.gemini\\config';
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'spotify_credentials.json');

console.log('🎵 Starting Spotify Authorization Flow...');
console.log(`Using Client ID: ${CLIENT_ID.slice(0, 6)}...`);
console.log(`Redirect URI: ${REDIRECT_URI}`);
console.log(`Scopes: ${SCOPES}`);

const authUrl = new URL('https://accounts.spotify.com/authorize');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('scope', SCOPES);

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);
  
  if (reqUrl.pathname === '/callback') {
    const code = reqUrl.searchParams.get('code');
    const error = reqUrl.searchParams.get('error');

    if (error) {
      console.error('❌ Authorization failed:', error);
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`<h1>Spotify Authorization Failed</h1><p>${error}</p>`);
      server.close();
      return;
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h1>No code provided in callback</h1>');
      return;
    }

    try {
      console.log('🔑 Exchanging authorization code for tokens...');
      const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
      const tokenResp = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
        }),
      });

      if (!tokenResp.ok) {
        const errText = await tokenResp.text();
        throw new Error(`Token exchange failed (${tokenResp.status}): ${errText}`);
      }

      const tokenData = await tokenResp.json();
      console.log('✅ Token exchange successful!');

      if (!fs.existsSync(CREDENTIALS_DIR)) {
        fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
      }

      const storedData = {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: tokenData.refresh_token,
        access_token: tokenData.access_token,
        expires_at: Date.now() + (tokenData.expires_in * 1000),
        scope: tokenData.scope,
        updated_at: new Date().toISOString(),
      };

      fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(storedData, null, 2), 'utf8');
      console.log(`💾 Saved credentials to: ${CREDENTIALS_FILE}`);

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Spotify Connected</title>
          <style>
            body { font-family: system-ui, sans-serif; background: #05070a; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #0a1218; border: 1px solid #1db954; border-radius: 12px; padding: 32px; text-align: center; box-shadow: 0 8px 32px rgba(29, 185, 84, 0.2); }
            h1 { color: #1db954; margin: 0 0 12px; font-size: 24px; }
            p { color: #9bb0bd; margin: 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Connected to Spotify!</h1>
            <p>Your stream overlay can now display currently playing tracks.</p>
            <p style="margin-top: 16px; font-size: 13px; color: #5c7080;">You may close this tab.</p>
          </div>
        </body>
        </html>
      `);

      // Test currently playing immediately
      setTimeout(async () => {
        try {
          const testResp = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
          });
          if (testResp.status === 204) {
            console.log('🎶 Spotify is active, but nothing is currently playing.');
          } else if (testResp.ok) {
            const track = await testResp.json();
            const artistNames = (track.item?.artists || []).map(a => a.name).join(', ');
            console.log(`🎶 Now Playing: "${track.item?.name}" by ${artistNames}`);
          }
        } catch (e) {
          console.warn('Test playback check warning:', e.message);
        }
        server.close();
        process.exit(0);
      }, 1000);

    } catch (err) {
      console.error('❌ Error handling callback:', err.message);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<h1>Internal Error</h1><p>${err.message}</p>`);
      server.close();
      process.exit(1);
    }
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n🌐 Listening on http://127.0.0.1:${PORT}/callback`);
  console.log('👉 Opening your browser to authorize with Spotify...');
  console.log(`\nIf the browser doesn't open automatically, visit this URL:\n${authUrl.toString()}\n`);

  // Open default browser on Windows
  exec(`start "" "${authUrl.toString()}"`);
});
