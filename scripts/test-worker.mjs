import test from 'node:test';
import assert from 'node:assert/strict';

import { hashKey, signToken, verifySharedSecret, verifyToken } from '../src/worker/crypto.ts';
import { handleDiscordThread } from '../src/worker/discord.ts';
import { handleNewsletterDispatch } from '../src/worker/dispatch.ts';
import { handleSubscribe } from '../src/worker/subscribe.ts';
import worker from '../src/worker/index.ts';

const TEST_SECRET = 'test-hmac-secret-0123456789abcdef';
const TEST_AUDIENCE_ID = 'aud_test_123';
const TEST_RESEND_KEY = 're_test_key';

function makeBaseEnv(overrides = {}) {
  return {
    ASSETS: {
      async fetch() {
        return new Response('asset-ok', { status: 200 });
      },
    },
    RESEND_API_KEY: TEST_RESEND_KEY,
    RESEND_AUDIENCE_ID: TEST_AUDIENCE_ID,
    SUBSCRIBE_HMAC_SECRET: TEST_SECRET,
    ...overrides,
  };
}

test('crypto: signToken and verifyToken round-trip and reject tamper/expiry/wrong-purpose', async () => {
  const nowMs = 1_700_000_000_000;
  const exp = Math.floor(nowMs / 1000) + 3600;
  const confirmToken = await signToken({ e: 'reader@example.com', exp, p: 'confirm' }, TEST_SECRET);

  const verified = await verifyToken(confirmToken, TEST_SECRET, 'confirm', nowMs);
  assert.deepEqual(verified, { e: 'reader@example.com', exp, p: 'confirm' });

  // Wrong purpose rejected
  assert.equal(await verifyToken(confirmToken, TEST_SECRET, 'unsubscribe', nowMs), null);

  // Tampered signature rejected
  const [payloadPart, sigPart] = confirmToken.split('.');
  const flipped = (sigPart[0] === 'A' ? 'B' : 'A') + sigPart.slice(1);
  assert.equal(await verifyToken(`${payloadPart}.${flipped}`, TEST_SECRET, 'confirm', nowMs), null);

  // Expired token rejected
  assert.equal(await verifyToken(confirmToken, TEST_SECRET, 'confirm', (exp + 1) * 1000), null);

  // Keyed hash never equals raw input and is deterministic
  const h1 = await hashKey('192.0.2.1', TEST_SECRET);
  const h2 = await hashKey('192.0.2.1', TEST_SECRET);
  assert.equal(h1, h2);
  assert.equal(h1.length, 64);
  assert.ok(!h1.includes('192.0.2.1'));
});

test('subscribe: rejects cross-origin and cross-site POSTs with 403', async () => {
  const env = makeBaseEnv();
  const resBadOrigin = await handleSubscribe(
    new Request('https://musingsofmy.today/api/subscribe', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.1',
      },
      body: JSON.stringify({ email: 'reader@example.com' }),
    }),
    env,
  );
  assert.equal(resBadOrigin.status, 403);
  assert.deepEqual(await resBadOrigin.json(), { ok: false, error: 'forbidden_origin' });

  const resCrossSite = await handleSubscribe(
    new Request('https://musingsofmy.today/api/subscribe', {
      method: 'POST',
      headers: {
        Origin: 'https://musingsofmy.today',
        'Sec-Fetch-Site': 'cross-site',
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.2',
      },
      body: JSON.stringify({ email: 'reader@example.com' }),
    }),
    env,
  );
  assert.equal(resCrossSite.status, 403);
  assert.deepEqual(await resCrossSite.json(), { ok: false, error: 'forbidden_origin' });
});

test('subscribe: invalid email returns 400 and honeypot returns 200 with zero Resend calls', async () => {
  const env = makeBaseEnv();
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return new Response('{}', { status: 200 });
  };

  for (const badEmail of ['', 'not-an-email', 'user@localhost', 'a@b.com\r\nBcc: x@y.com']) {
    const res = await handleSubscribe(
      new Request('https://musingsofmy.today/api/subscribe', {
        method: 'POST',
        headers: {
          Origin: 'https://musingsofmy.today',
          'Sec-Fetch-Site': 'same-origin',
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '198.51.100.3',
        },
        body: JSON.stringify({ email: badEmail }),
      }),
      env,
      { fetchImpl },
    );
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(badEmail)}`);
  }

  const honeypotRes = await handleSubscribe(
    new Request('https://musingsofmy.today/api/subscribe', {
      method: 'POST',
      headers: {
        Origin: 'https://musingsofmy.today',
        'Sec-Fetch-Site': 'same-origin',
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.4',
      },
      body: JSON.stringify({ email: 'bot@example.com', company_website: 'https://spam.example' }),
    }),
    env,
    { fetchImpl },
  );
  assert.equal(honeypotRes.status, 200);
  const hpBody = await honeypotRes.json();
  assert.equal(hpBody.ok, true);
  assert.match(hpBody.message, /check your inbox/i);
  assert.equal(fetchCalls, 0);
});

test('subscribe: POST /api/subscribe sends Resend email with Idempotency-Key and List-Unsubscribe-Post', async () => {
  const env = makeBaseEnv();
  const captured = [];
  const fetchImpl = async (url, init) => {
    captured.push({ url: String(url), init });
    return new Response(JSON.stringify({ id: 'email_123' }), { status: 200 });
  };

  const nowMs = 1_764_000_000_000;
  const res = await handleSubscribe(
    new Request('https://musingsofmy.today/api/subscribe', {
      method: 'POST',
      headers: {
        Origin: 'https://musingsofmy.today',
        'Sec-Fetch-Site': 'same-origin',
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.5',
      },
      body: JSON.stringify({ email: '  Reader@Example.COM  ' }),
    }),
    env,
    { fetchImpl, nowMs: () => nowMs },
  );

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.message, "If that address isn't subscribed yet, check your inbox for a confirmation link.");

  assert.equal(captured.length, 1);
  assert.equal(captured[0].url, 'https://api.resend.com/emails');
  assert.equal(captured[0].init.method, 'POST');
  assert.ok(captured[0].init.headers['Idempotency-Key']?.startsWith('sub-'));
  const sentPayload = JSON.parse(captured[0].init.body);
  assert.deepEqual(sentPayload.to, ['reader@example.com']);
  assert.equal(sentPayload.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.match(sentPayload.headers['List-Unsubscribe'], /^<https:\/\/musingsofmy\.today\/api\/subscribe\/unsubscribe\?token=/);
  assert.match(sentPayload.text, /https:\/\/musingsofmy\.today\/api\/subscribe\/confirm\?token=/);
});

test('subscribe: GET /confirm never mutates state; POST /confirm upserts contact; POST /unsubscribe supports RFC 8058 and form', async () => {
  const env = makeBaseEnv();
  const nowMs = 1_764_000_000_000;
  const exp = Math.floor(nowMs / 1000) + 3600;
  const confirmToken = await signToken({ e: 'reader@example.com', exp, p: 'confirm' }, TEST_SECRET);
  const unsubToken = await signToken({ e: 'reader@example.com', exp, p: 'unsubscribe' }, TEST_SECRET);

  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ id: 'contact_1' }), { status: 200 });
  };

  // GET /confirm must NOT call Resend
  const getConfirmRes = await handleSubscribe(
    new Request(`https://musingsofmy.today/api/subscribe/confirm?token=${encodeURIComponent(confirmToken)}`, {
      method: 'GET',
    }),
    env,
    { fetchImpl, nowMs: () => nowMs },
  );
  assert.equal(getConfirmRes.status, 200);
  assert.equal(getConfirmRes.headers.get('X-Robots-Tag'), 'noindex');
  assert.equal(getConfirmRes.headers.get('Cache-Control'), 'no-store');
  const confirmHtml = await getConfirmRes.text();
  assert.match(confirmHtml, /<form method="POST" action="\/api\/subscribe\/confirm">/);
  assert.equal(calls.length, 0);

  // POST /confirm upserts contact with unsubscribed: false
  const postConfirmRes = await handleSubscribe(
    new Request('https://musingsofmy.today/api/subscribe/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: confirmToken }).toString(),
    }),
    env,
    { fetchImpl, nowMs: () => nowMs },
  );
  assert.equal(postConfirmRes.status, 303);
  assert.equal(postConfirmRes.headers.get('Location'), '/subscribe/?status=confirmed');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://api.resend.com/audiences/${TEST_AUDIENCE_ID}/contacts`);
  assert.deepEqual(JSON.parse(calls[0].init.body), { email: 'reader@example.com', unsubscribed: false });

  // POST /unsubscribe RFC 8058 One-Click (query token + List-Unsubscribe=One-Click body)
  const oneClickRes = await handleSubscribe(
    new Request(`https://musingsofmy.today/api/subscribe/unsubscribe?token=${encodeURIComponent(unsubToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    }),
    env,
    { fetchImpl, nowMs: () => nowMs },
  );
  assert.equal(oneClickRes.status, 200);
  assert.deepEqual(await oneClickRes.json(), { ok: true, status: 'unsubscribed' });
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[1].init.body), { email: 'reader@example.com', unsubscribed: true });

  // POST /unsubscribe via HTML confirmation form
  const formUnsubRes = await handleSubscribe(
    new Request('https://musingsofmy.today/api/subscribe/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: unsubToken }).toString(),
    }),
    env,
    { fetchImpl, nowMs: () => nowMs },
  );
  assert.equal(formUnsubRes.status, 303);
  assert.equal(formUnsubRes.headers.get('Location'), '/subscribe/?status=unsubscribed');
  assert.equal(calls.length, 3);
  assert.deepEqual(JSON.parse(calls[2].init.body), { email: 'reader@example.com', unsubscribed: true });
});

test('subscribe: rate limits after 5 requests per 10 minutes and returns 503 when unconfigured', async () => {
  const unconfiguredEnv = makeBaseEnv({ RESEND_API_KEY: '' });
  const unconfRes = await handleSubscribe(
    new Request('https://musingsofmy.today/api/subscribe', {
      method: 'POST',
      headers: {
        Origin: 'https://musingsofmy.today',
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.50',
      },
      body: JSON.stringify({ email: 'reader@example.com' }),
    }),
    unconfiguredEnv,
  );
  assert.equal(unconfRes.status, 503);
  assert.equal((await unconfRes.json()).code, 'unconfigured');

  const env = makeBaseEnv();
  const fetchImpl = async () => new Response(JSON.stringify({ id: 'ok' }), { status: 200 });
  const nowMs = 1_764_000_500_000;

  for (let i = 0; i < 5; i += 1) {
    const r = await handleSubscribe(
      new Request('https://musingsofmy.today/api/subscribe', {
        method: 'POST',
        headers: {
          Origin: 'https://musingsofmy.today',
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '198.51.100.99',
        },
        body: JSON.stringify({ email: `user${i}@example.com` }),
      }),
      env,
      { fetchImpl, nowMs: () => nowMs + i * 1000 },
    );
    assert.equal(r.status, 200);
  }

  const limited = await handleSubscribe(
    new Request('https://musingsofmy.today/api/subscribe', {
      method: 'POST',
      headers: {
        Origin: 'https://musingsofmy.today',
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.99',
      },
      body: JSON.stringify({ email: 'user6@example.com' }),
    }),
    env,
    { fetchImpl, nowMs: () => nowMs + 6000 },
  );
  assert.equal(limited.status, 429);
});

test('discord: returns 404 when unmapped, 503 when unconfigured, and strips snowflakes/bots/mentions when mapped', async () => {
  const unmappedEnv = makeBaseEnv({
    DISCORD_BOT_TOKEN: 'bot_token',
    ASSETS: {
      async fetch() {
        return new Response(JSON.stringify({}), { status: 200 });
      },
    },
  });

  const unmappedRes = await handleDiscordThread(
    new Request('https://musingsofmy.today/api/discord/thread/2026-11-19-velvet-static'),
    unmappedEnv,
    { cache: null },
  );
  assert.equal(unmappedRes.status, 404);

  const invalidIdRes = await handleDiscordThread(
    new Request('https://musingsofmy.today/api/discord/thread/not-a-valid-post-id'),
    unmappedEnv,
    { cache: null },
  );
  assert.equal(invalidIdRes.status, 400);

  const mappedAssets = {
    async fetch() {
      return new Response(
        JSON.stringify({ '2026-11-19-velvet-static': '123456789012345678' }),
        { status: 200 },
      );
    },
  };

  const unconfDiscord = await handleDiscordThread(
    new Request('https://musingsofmy.today/api/discord/thread/2026-11-19-velvet-static'),
    makeBaseEnv({ ASSETS: mappedAssets, DISCORD_BOT_TOKEN: '' }),
    { cache: null },
  );
  assert.equal(unconfDiscord.status, 503);
  assert.equal(unconfDiscord.headers.get('Cache-Control'), 'no-store');

  const fetchImpl = async (url) => {
    const s = String(url);
    if (s.endsWith('/messages?limit=20')) {
      return new Response(
        JSON.stringify([
          {
            type: 0,
            content: 'Hello <@!999888777666555444>, check <#111222333444555666> and <@&777888999000111222> <a:spark:333444555666777888>',
            timestamp: '2026-11-20T12:00:00.000Z',
            author: { id: '999888777666555444', username: 'kenhen', global_name: 'Kenneth', bot: false },
            reactions: [{ count: 3, emoji: { name: '🔥', id: null } }],
          },
          {
            type: 0,
            content: 'Bot spam message',
            timestamp: '2026-11-20T11:55:00.000Z',
            author: { id: '444555666777888999', username: 'helperbot', bot: true },
          },
          {
            type: 3,
            content: 'System pin message',
            timestamp: '2026-11-20T11:50:00.000Z',
            author: { id: '999888777666555444', username: 'kenhen', bot: false },
          },
        ]),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ message_count: 1 }), { status: 200 });
  };

  const mappedRes = await handleDiscordThread(
    new Request('https://musingsofmy.today/api/discord/thread/2026-11-19-velvet-static'),
    makeBaseEnv({ ASSETS: mappedAssets, DISCORD_BOT_TOKEN: 'bot_token' }),
    { fetchImpl, cache: null },
  );
  assert.equal(mappedRes.status, 200);
  assert.match(mappedRes.headers.get('Cache-Control') || '', /s-maxage=300/);

  const rawJson = await mappedRes.text();
  assert.ok(!rawJson.includes('999888777666555444'), 'raw user snowflake must never appear in JSON response');

  const payload = JSON.parse(rawJson);
  assert.equal(payload.ok, true);
  assert.equal(payload.threadUrl, 'https://discord.com/channels/723592473527713853/123456789012345678');
  assert.equal(payload.inviteUrl, 'https://discord.gg/AkmBGKPVFQ');
  assert.equal(payload.replyCount, 1);
  assert.equal(payload.messages.length, 1);
  assert.deepEqual(payload.messages[0], {
    authorName: 'Kenneth',
    initial: 'K',
    createdAt: '2026-11-20T12:00:00.000Z',
    text: 'Hello @member, check #channel and @role :spark:',
    reactions: [{ emoji: '🔥', count: 3 }],
  });
});

test('dispatch: enforces auth/validation and supports dry-run, testTo, and idempotent batch audience send', async () => {
  const env = makeBaseEnv({ NEWSLETTER_DISPATCH_SECRET: 'dispatch-secret-xyz' });

  assert.equal(await verifySharedSecret('dispatch-secret-xyz', 'dispatch-secret-xyz'), true);
  assert.equal(await verifySharedSecret('wrong-secret', 'dispatch-secret-xyz'), false);

  const unauthRes = await handleNewsletterDispatch(
    new Request('https://musingsofmy.today/api/subscribe/dispatch', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),
    env,
  );
  assert.equal(unauthRes.status, 401);

  const invalidPayloadRes = await handleNewsletterDispatch(
    new Request('https://musingsofmy.today/api/subscribe/dispatch', {
      method: 'POST',
      headers: { Authorization: 'Bearer dispatch-secret-xyz', 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: '../bad', url: 'https://evil.example', title: 'Hi', summary: 'x' }),
    }),
    env,
  );
  assert.equal(invalidPayloadRes.status, 400);

  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/contacts')) {
      return new Response(
        JSON.stringify({
          data: [
            { email: 'confirmed1@example.com', unsubscribed: false },
            { email: 'optedout@example.com', unsubscribed: true },
            { email: 'confirmed2@example.com', unsubscribed: false },
            { email: 'CONFIRMED1@example.com', unsubscribed: false },
          ],
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ data: [{ id: 'em_1' }, { id: 'em_2' }] }), { status: 200 });
  };

  const dryRes = await handleNewsletterDispatch(
    new Request('https://musingsofmy.today/api/subscribe/dispatch', {
      method: 'POST',
      headers: { Authorization: 'Bearer dispatch-secret-xyz', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: '2026-11-26-config-as-code-cloudflare-workers-migration',
        url: 'https://musingsofmy.today/2026/11/26/config-as-code-cloudflare-workers-migration/',
        title: 'Config-as-Code at the Edge',
        eyebrow: '// engineering · 2026-11-26',
        summary: 'Summary text.',
        dryRun: true,
      }),
    }),
    env,
    { fetchImpl, nowMs: () => 1_764_100_000_000 },
  );
  assert.equal(dryRes.status, 200);
  const dryBody = await dryRes.json();
  assert.deepEqual(dryBody, {
    ok: true,
    mode: 'dry-run',
    slug: '2026-11-26-config-as-code-cloudflare-workers-migration',
    title: 'Config-as-Code at the Edge',
    recipientCount: 2,
  });
  assert.equal(calls.length, 1);

  const testRes = await handleNewsletterDispatch(
    new Request('https://musingsofmy.today/api/subscribe/dispatch', {
      method: 'POST',
      headers: { Authorization: 'Bearer dispatch-secret-xyz', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: '2026-11-26-config-as-code-cloudflare-workers-migration',
        url: 'https://musingsofmy.today/2026/11/26/config-as-code-cloudflare-workers-migration/',
        title: 'Config-as-Code at the Edge',
        summary: 'Summary text.',
        testTo: 'delivered@resend.dev',
      }),
    }),
    env,
    { fetchImpl, nowMs: () => 1_764_100_000_000 },
  );
  assert.equal(testRes.status, 200);
  assert.deepEqual(await testRes.json(), {
    ok: true,
    mode: 'test',
    slug: '2026-11-26-config-as-code-cloudflare-workers-migration',
    title: 'Config-as-Code at the Edge',
    sent: 1,
  });
  assert.equal(calls[1].url, 'https://api.resend.com/emails');
  assert.ok(calls[1].init.headers['Idempotency-Key'].startsWith('test-2026-11-26-'));

  const audRes = await handleNewsletterDispatch(
    new Request('https://musingsofmy.today/api/subscribe/dispatch', {
      method: 'POST',
      headers: { Authorization: 'Bearer dispatch-secret-xyz', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: '2026-11-26-config-as-code-cloudflare-workers-migration',
        url: 'https://musingsofmy.today/2026/11/26/config-as-code-cloudflare-workers-migration/',
        title: 'Config-as-Code at the Edge',
        summary: 'Summary text.',
      }),
    }),
    env,
    { fetchImpl, nowMs: () => 1_764_100_000_000 },
  );
  assert.equal(audRes.status, 200);
  assert.deepEqual(await audRes.json(), {
    ok: true,
    mode: 'audience',
    slug: '2026-11-26-config-as-code-cloudflare-workers-migration',
    title: 'Config-as-Code at the Edge',
    sent: 2,
    batches: 1,
  });
  assert.equal(calls[3].url, 'https://api.resend.com/emails/batch');
  assert.equal(
    calls[3].init.headers['Idempotency-Key'],
    'post-2026-11-26-config-as-code-cloudflare-workers-migration-batch-0',
  );
  const batchMessages = JSON.parse(calls[3].init.body);
  assert.equal(batchMessages.length, 2);
  assert.equal(batchMessages[0].headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.match(batchMessages[0].headers['List-Unsubscribe'], /^<https:\/\/musingsofmy\.today\/api\/subscribe\/unsubscribe\?token=/);
});

test('worker index: routes unknown /api/* to 404 and falls back to ASSETS', async () => {
  const env = makeBaseEnv();
  const api404 = await worker.fetch(new Request('https://musingsofmy.today/api/unknown'), env);
  assert.equal(api404.status, 404);
  assert.deepEqual(await api404.json(), { ok: false, error: 'not_found' });

  const assetRes = await worker.fetch(new Request('https://musingsofmy.today/about/'), env);
  assert.equal(assetRes.status, 200);
  assert.equal(await assetRes.text(), 'asset-ok');
});
