#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(REPO_ROOT, 'src', 'content', 'posts');
const HTML_FILE = path.join(__dirname, 'stenbane-editor.html');

const PARTS = [
  { id: 'part-1', dir: '2026-11-12-the-stenbane-question-part-1', title: 'Part 1: Name for the Tab?', url: '/2026/11/12/the-stenbane-question-part-1/' },
  { id: 'part-2', dir: '2026-11-16-the-stenbane-question-part-2', title: 'Part 2: You No Take Name', url: '/2026/11/16/the-stenbane-question-part-2/' },
  { id: 'part-3', dir: '2026-11-19-the-stenbane-question-part-3', title: 'Part 3: Grave Matters', url: '/2026/11/19/the-stenbane-question-part-3/' },
  { id: 'part-4', dir: '2026-11-23-the-stenbane-question-part-4', title: 'Part 4: The Earthmother and the Dream', url: '/2026/11/23/the-stenbane-question-part-4/' },
  { id: 'part-5', dir: '2026-11-26-the-stenbane-question-part-5', title: 'Part 5: Two Names, One Metal', url: '/2026/11/26/the-stenbane-question-part-5/' },
];

const PORT = 4322;

function getPostPath(dir) {
  return path.join(POSTS_DIR, dir, 'index.mdx');
}

function getAllPostsData() {
  const posts = {};
  for (const p of PARTS) {
    const f = getPostPath(p.dir);
    posts[p.id] = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  }
  return { parts: PARTS, posts };
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = reqUrl.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API: List parts
  if (pathname === '/api/parts' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(PARTS));
    return;
  }

  // API: Load post content
  const loadMatch = pathname.match(/^\/api\/post\/([^/]+)$/);
  if (loadMatch && req.method === 'GET') {
    const partId = loadMatch[1];
    const part = PARTS.find(p => p.id === partId || p.dir === partId);
    if (!part) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Part not found' }));
      return;
    }
    const filePath = getPostPath(part.dir);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ part, content, mtime: fs.statSync(filePath).mtime }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API: Save post content
  if (loadMatch && req.method === 'POST') {
    const partId = loadMatch[1];
    const part = PARTS.find(p => p.id === partId || p.dir === partId);
    if (!part) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Part not found' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { content } = JSON.parse(body);
        if (typeof content !== 'string') throw new Error('Content must be a string');
        const filePath = getPostPath(part.dir);
        fs.writeFileSync(filePath, content, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, savedAt: new Date().toISOString() }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: Serve images from post directories
  const imgMatch = pathname.match(/^\/images\/([^/]+)\/(.+)$/);
  if (imgMatch && req.method === 'GET') {
    const partDir = imgMatch[1];
    const imgFile = imgMatch[2];
    const safePart = PARTS.find(p => p.dir === partDir || p.id === partDir);
    if (!safePart) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const imgPath = path.join(POSTS_DIR, safePart.dir, path.basename(imgFile));
    if (fs.existsSync(imgPath)) {
      const ext = path.extname(imgPath).toLowerCase();
      const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.png' ? 'image/png' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      fs.createReadStream(imgPath).pipe(res);
      return;
    }
    res.writeHead(404);
    res.end('Image not found');
    return;
  }

  // Serve Main Web UI
  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    const initialData = getAllPostsData();
    const rawHtml = fs.readFileSync(HTML_FILE, 'utf8');
    const jsonInjection = `<script>window.__INITIAL_DATA__ = ${JSON.stringify(initialData).replace(/</g, '\\u003c')};</script>`;
    const fullHtml = rawHtml.replace('</head>', `${jsonInjection}\n</head>`);
    res.end(fullHtml);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Stenbane In-Browser Editor running at http://localhost:${PORT}/`);
});
