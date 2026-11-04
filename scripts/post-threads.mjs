#!/usr/bin/env node
/**
 * post-threads.mjs: Publish single posts or multi-post threads to Meta Threads.
 *
 * Usage:
 *   node scripts/post-threads.mjs path/to/threads.md
 *   node scripts/post-threads.mjs path/to/threads.md --dry-run
 *
 * Environment variables (or in .env):
 *   THREADS_USER_ID      Your Threads User ID (from Graph API /me)
 *   THREADS_ACCESS_TOKEN Your Long-Lived Threads User Access Token
 *
 * Markdown format:
 *   Separate posts in a thread using "---" on a line by itself.
 *   Each section must be <= 500 characters.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GRAPH_BASE = 'https://graph.threads.net/v1.0';
const MAX_CHARS = 500;

// Simple .env loader
async function loadEnv() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    const raw = await fs.readFile(path.join(root, '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env is optional
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  await loadEnv();

  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const replyToArg = args.find((a) => a.startsWith('--reply-to='));
  const initialReplyTo = replyToArg ? replyToArg.split('=')[1] : null;
  const imageUrlArg = args.find((a) => a.startsWith('--image-url='));
  const imageUrl = imageUrlArg ? imageUrlArg.split('=')[1] : null;
  const fileArg = args.find((a) => !a.startsWith('--'));

  if (!fileArg) {
    console.error('Usage: node scripts/post-threads.mjs <file.md> [--dry-run]');
    process.exit(1);
  }

  const content = await fs.readFile(fileArg, 'utf8');
  // Split on "---" surrounded by newlines
  const rawPosts = content
    .split(/\r?\n---\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (rawPosts.length === 0) {
    console.error('Error: No content found in file.');
    process.exit(1);
  }

  console.log(`\n🧵 Found ${rawPosts.length} post(s) to publish in thread:\n`);

  let hasErrors = false;
  rawPosts.forEach((post, i) => {
    const len = [...post].length; // Character count handles emojis correctly
    console.log(`[Post ${i + 1}/${rawPosts.length}] (${len}/${MAX_CHARS} chars)`);
    console.log(post.split('\n').map((l) => `  │ ${l}`).join('\n'));
    console.log('');
    if (len > MAX_CHARS) {
      console.error(`  ❌ Error: Post ${i + 1} exceeds 500 characters (${len}/${MAX_CHARS})!`);
      hasErrors = true;
    }
  });

  if (hasErrors) {
    console.error('Aborting: Please trim posts exceeding the 500-character limit.');
    process.exit(1);
  }

  if (isDryRun) {
    console.log('✅ Dry-run complete. All posts passed character length checks.');
    return;
  }

  const userId = process.env.THREADS_USER_ID;
  const token = process.env.THREADS_ACCESS_TOKEN;

  if (!userId || !token) {
    console.error('⚠️  Missing credentials: THREADS_USER_ID or THREADS_ACCESS_TOKEN not set.');
    console.error('Set them in environment variables or your .env file.');
    console.error('Re-run with --dry-run to validate post formatting without credentials.');
    process.exit(1);
  }

  console.log('🚀 Connecting to Threads API...\n');

  let previousPostId = initialReplyTo;
  const publishedIds = [];

  for (let i = 0; i < rawPosts.length; i++) {
    const text = rawPosts[i];
    console.log(`Publishing post ${i + 1}/${rawPosts.length}...`);

    // 1. Create Media Container
    const isImage = (i === 0 && Boolean(imageUrl));
    const containerParams = new URLSearchParams({
      media_type: isImage ? 'IMAGE' : 'TEXT',
      text: text,
      access_token: token,
    });

    if (isImage) {
      containerParams.append('image_url', imageUrl);
    }

    if (previousPostId) {
      containerParams.append('reply_to_id', previousPostId);
    }

    const containerRes = await fetch(`${GRAPH_BASE}/${userId}/threads`, {
      method: 'POST',
      body: containerParams,
    });

    const containerData = await containerRes.json();
    if (!containerRes.ok || !containerData.id) {
      console.error(`❌ Failed to create container for post ${i + 1}:`, containerData);
      process.exit(1);
    }

    const creationId = containerData.id;

    // Wait for container processing (images require async processing by Meta)
    if (isImage) {
      console.log('  ⏳ Waiting for media container processing...');
      let status = 'IN_PROGRESS';
      for (let attempt = 0; attempt < 12; attempt++) {
        await sleep(3000);
        const statusRes = await fetch(`${GRAPH_BASE}/${creationId}?fields=status,error_message&access_token=${token}`);
        const statusData = await statusRes.json();
        status = statusData.status;
        if (status === 'FINISHED') break;
        if (status === 'ERROR') {
          console.error('❌ Media container processing failed:', statusData.error_message);
          process.exit(1);
        }
      }
    } else {
      await sleep(2000);
    }

    // 2. Publish Container
    const publishParams = new URLSearchParams({
      creation_id: creationId,
      access_token: token,
    });

    const publishRes = await fetch(`${GRAPH_BASE}/${userId}/threads_publish`, {
      method: 'POST',
      body: publishParams,
    });

    const publishData = await publishRes.json();
    if (!publishRes.ok || !publishData.id) {
      console.error(`❌ Failed to publish post ${i + 1}:`, publishData);
      process.exit(1);
    }

    const publishedId = publishData.id;
    publishedIds.push(publishedId);
    previousPostId = publishedId;

    console.log(`  ✓ Published: ID ${publishedId}`);

    if (i < rawPosts.length - 1) {
      await sleep(1500); // Wait between thread chain replies
    }
  }

  console.log('\n🎉 Complete thread successfully published!');
  console.log(`Root Post ID: ${publishedIds[0]}`);
  console.log(`View live thread: https://www.threads.net/t/${publishedIds[0]}`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
