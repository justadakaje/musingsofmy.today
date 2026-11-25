/**
 * Hardened double opt-in newsletter subscription Worker routes.
 * Zero external imports; never mutates state on GET; never logs PII.
 */

import { hashKey, signToken, verifyToken } from './crypto.ts';
import type { WorkerEnv } from './types.ts';

export interface SubscribeDeps {
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
}

const UNIFORM_SUBSCRIBE_MESSAGE =
  "If that address isn't subscribed yet, check your inbox for a confirmation link.";
const UNCONFIGURED_MESSAGE =
  'Email sign-ups are being finalized. Try RSS in the meantime.';
const DEFAULT_FROM = 'Kenneth Henseler <newsletter@musingsofmy.today>';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_REQUESTS = 5;

const rateBuckets = new Map<string, number[]>();

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
      ...extraHeaders,
    },
  });
}

function redirectResponse(location: string, status: number = 303): Response {
  return new Response(null, {
    status,
    headers: {
      Location: location,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}

function htmlActionPage(opts: {
  title: string;
  eyebrow: string;
  heading: string;
  bodyCopy: string;
  action: string;
  token: string;
  buttonLabel: string;
}): Response {
  const escapedToken = opts.token
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>${opts.title} · Musings of My Today</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: #05070a;
      background-image: radial-gradient(rgba(34, 211, 238, 0.08) 1px, transparent 1px);
      background-size: 28px 28px;
      color: #d4e0e8;
      font: 400 16px/1.6 system-ui, -apple-system, sans-serif;
    }
    .card {
      width: 100%;
      max-width: 480px;
      padding: 32px;
      background: rgba(10, 18, 24, 0.92);
      border: 1px solid rgba(34, 211, 238, 0.4);
      clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
    }
    .eyebrow {
      margin: 0 0 10px;
      font: 500 13px ui-monospace, monospace;
      color: #e0a93b;
      letter-spacing: 0.04em;
    }
    h1 {
      margin: 0 0 12px;
      font: 800 26px/1.2 system-ui, sans-serif;
      color: #ffffff;
    }
    p {
      margin: 0 0 24px;
      color: #9bb0bd;
    }
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      padding: 12px 20px;
      border: 0;
      background: #22d3ee;
      color: #04181d;
      font: 700 14px ui-monospace, monospace;
      cursor: pointer;
      clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
    }
    button:hover { background: #67e8f9; }
    button:focus-visible { outline: 2px solid #22d3ee; outline-offset: 2px; }
    .back {
      display: inline-block;
      margin-top: 18px;
      font: 500 13px ui-monospace, monospace;
      color: #9bb0bd;
      text-decoration: none;
    }
    .back:hover { color: #22d3ee; }
  </style>
</head>
<body>
  <main class="card">
    <p class="eyebrow">${opts.eyebrow}</p>
    <h1>${opts.heading}</h1>
    <p>${opts.bodyCopy}</p>
    <form method="POST" action="${opts.action}">
      <input type="hidden" name="token" value="${escapedToken}" />
      <button type="submit">${opts.buttonLabel}</button>
    </form>
    <a class="back" href="/subscribe/">← Back to subscribe options</a>
  </main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
    },
  });
}

function isAllowedOrigin(origin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  const { protocol, hostname } = parsed;
  if (protocol === 'https:') {
    if (hostname === 'musingsofmy.today') return true;
    if (hostname.endsWith('.workers.dev')) {
      const labels = hostname.slice(0, -'.workers.dev'.length).split('.');
      const workerLabel = labels[0] ?? '';
      return (
        workerLabel === 'musingsofmy-today' ||
        workerLabel.endsWith('-musingsofmy-today') ||
        hostname.endsWith('.musingsofmy-today.workers.dev')
      );
    }
    return false;
  }

  if (protocol === 'http:') {
    return hostname === 'localhost' || hostname === '127.0.0.1';
  }

  return false;
}

function resolvePublicOrigin(request: Request, url: URL): string {
  const originHeader = request.headers.get('Origin');
  if (originHeader && isAllowedOrigin(originHeader)) return originHeader;
  if (isAllowedOrigin(url.origin)) return url.origin;
  return 'https://musingsofmy.today';
}

function wantsJsonResponse(request: Request): boolean {
  const accept = (request.headers.get('Accept') || '').toLowerCase();
  const contentType = (request.headers.get('Content-Type') || '').toLowerCase();
  return accept.includes('application/json') || contentType.includes('application/json');
}

interface ParsedBody {
  fields: Record<string, string>;
  rawText: string;
}

async function parseRequestBody(request: Request): Promise<ParsedBody | null> {
  const contentType = (request.headers.get('Content-Type') || '').toLowerCase();

  if (contentType.includes('multipart/form-data')) {
    try {
      const formData = await request.formData();
      const fields: Record<string, string> = {};
      for (const [key, value] of formData.entries()) {
        if (typeof value === 'string') fields[key] = value;
      }
      return { fields, rawText: '' };
    } catch {
      return null;
    }
  }

  let rawText = '';
  try {
    rawText = await request.text();
  } catch {
    return null;
  }

  if (!rawText) {
    return { fields: {}, rawText: '' };
  }

  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(rawText) as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
      const fields: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'string') fields[key] = value;
      }
      return { fields, rawText };
    } catch {
      return null;
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded') || !contentType) {
    const params = new URLSearchParams(rawText);
    const fields: Record<string, string> = {};
    for (const [key, value] of params.entries()) {
      fields[key] = value;
    }
    return { fields, rawText };
  }

  return null;
}

function getClientIp(request: Request): string {
  const cfIp = request.headers.get('CF-Connecting-IP')?.trim();
  if (cfIp) return cfIp;
  const xff = request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim();
  if (xff) return xff;
  return 'unknown';
}

function checkRateLimit(bucketKey: string, nowMs: number): { allowed: boolean; retryAfterSec: number } {
  const cutoff = nowMs - RATE_WINDOW_MS;
  const existing = rateBuckets.get(bucketKey) ?? [];
  const active = existing.filter((ts) => ts > cutoff);

  if (active.length >= RATE_MAX_REQUESTS) {
    rateBuckets.set(bucketKey, active);
    const oldest = active[0] ?? nowMs;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + RATE_WINDOW_MS - nowMs) / 1000));
    return { allowed: false, retryAfterSec };
  }

  active.push(nowMs);
  rateBuckets.set(bucketKey, active);

  // Opportunistic cleanup so long-lived isolates do not retain expired buckets indefinitely.
  if (rateBuckets.size > 1000) {
    for (const [key, timestamps] of rateBuckets.entries()) {
      if (timestamps.every((ts) => ts <= cutoff)) {
        rateBuckets.delete(key);
      }
    }
  }

  return { allowed: true, retryAfterSec: 0 };
}

function buildConfirmationEmailHtml(confirmUrl: string): string {
  const safeUrl = confirmUrl.replace(/"/g, '&quot;');
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#05070a;color:#d4e0e8;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:28px;background:#0a1218;border:1px solid #164e63;">
    <p style="margin:0 0 8px;font-family:monospace;font-size:12px;color:#e0a93b;">// musingsofmy.today</p>
    <h1 style="margin:0 0 12px;font-size:22px;color:#ffffff;">Confirm your email subscription</h1>
    <p style="margin:0 0 22px;color:#9bb0bd;line-height:1.6;">
      Click below to confirm you want email updates when new posts go live on Musings of My Today.
      This link expires in 24 hours.
    </p>
    <p style="margin:0 0 22px;">
      <a href="${safeUrl}" style="display:inline-block;padding:12px 20px;background:#22d3ee;color:#04181d;font-weight:700;text-decoration:none;font-family:monospace;">
        Confirm email subscription →
      </a>
    </p>
    <p style="margin:0;font-size:12px;color:#5c7080;line-height:1.5;">
      If you did not request this, you can safely ignore this message — nothing will be added without confirmation.
    </p>
  </div>
</body>
</html>`;
}

async function upsertResendContact(
  env: WorkerEnv,
  fetchImpl: typeof fetch,
  email: string,
  unsubscribed: boolean,
): Promise<Response> {
  return fetchImpl(
    `https://api.resend.com/audiences/${encodeURIComponent(env.RESEND_AUDIENCE_ID!)}/contacts`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY!}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, unsubscribed }),
    },
  );
}

async function handleSubscribePost(
  request: Request,
  env: WorkerEnv,
  url: URL,
  fetchImpl: typeof fetch,
  nowMs: () => number,
): Promise<Response> {
  const secFetchSite = request.headers.get('Sec-Fetch-Site');
  if (secFetchSite && secFetchSite !== 'same-origin') {
    return jsonResponse({ ok: false, error: 'forbidden_origin' }, 403);
  }

  const originHeader = request.headers.get('Origin');
  if (originHeader !== null && !isAllowedOrigin(originHeader)) {
    return jsonResponse({ ok: false, error: 'forbidden_origin' }, 403);
  }

  const wantsJson = wantsJsonResponse(request);
  const parsed = await parseRequestBody(request);
  if (!parsed) {
    return jsonResponse({ ok: false, error: 'invalid_body' }, 400);
  }

  const honeypot = (parsed.fields.company_website || '').trim();
  if (honeypot.length > 0) {
    return wantsJson
      ? jsonResponse({ ok: true, message: UNIFORM_SUBSCRIBE_MESSAGE }, 200)
      : redirectResponse('/subscribe/?status=check-inbox');
  }

  const rawEmail = parsed.fields.email ?? '';
  if (/[\r\n]/.test(rawEmail)) {
    return jsonResponse(
      { ok: false, error: 'invalid_email', message: 'Enter an email address in the format you@example.com.' },
      400,
    );
  }

  const email = rawEmail.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
    return jsonResponse(
      { ok: false, error: 'invalid_email', message: 'Enter an email address in the format you@example.com.' },
      400,
    );
  }

  const now = nowMs();
  const clientIp = getClientIp(request);
  const rateKey = await hashKey(clientIp, env.SUBSCRIBE_HMAC_SECRET || 'anon');
  const limit = checkRateLimit(rateKey, now);
  if (!limit.allowed) {
    return jsonResponse(
      { ok: false, error: 'rate_limited', message: 'Too many requests. Please try again in a few minutes.' },
      429,
      { 'Retry-After': String(limit.retryAfterSec) },
    );
  }

  if (env.TURNSTILE_SECRET_KEY) {
    const turnstileToken = (parsed.fields['cf-turnstile-response'] || '').trim();
    if (!turnstileToken) {
      return jsonResponse(
        { ok: false, error: 'turnstile_required', message: 'Verification check failed. Please try again.' },
        400,
      );
    }

    const verifyParams = new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY,
      response: turnstileToken,
    });
    if (clientIp !== 'unknown') verifyParams.set('remoteip', clientIp);

    const tsRes = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: verifyParams.toString(),
    });
    let tsData: { success?: boolean } | null = null;
    try {
      tsData = (await tsRes.json()) as { success?: boolean };
    } catch {
      tsData = null;
    }
    if (!tsRes.ok || !tsData?.success) {
      return jsonResponse(
        { ok: false, error: 'turnstile_failed', message: 'Verification check failed. Please try again.' },
        400,
      );
    }
  }

  if (!env.RESEND_API_KEY || !env.SUBSCRIBE_HMAC_SECRET || !env.RESEND_AUDIENCE_ID) {
    return wantsJson
      ? jsonResponse({ ok: false, code: 'unconfigured', message: UNCONFIGURED_MESSAGE }, 503)
      : redirectResponse('/subscribe/?status=unconfigured');
  }

  const nowSec = Math.floor(now / 1000);
  const confirmToken = await signToken(
    { e: email, exp: nowSec + 24 * 60 * 60, p: 'confirm' },
    env.SUBSCRIBE_HMAC_SECRET,
  );
  const unsubToken = await signToken(
    { e: email, exp: nowSec + 30 * 24 * 60 * 60, p: 'unsubscribe' },
    env.SUBSCRIBE_HMAC_SECRET,
  );

  const origin = resolvePublicOrigin(request, url);
  const confirmUrl = `${origin}/api/subscribe/confirm?token=${encodeURIComponent(confirmToken)}`;
  const unsubUrl = `${origin}/api/subscribe/unsubscribe?token=${encodeURIComponent(unsubToken)}`;

  const hourBucket = Math.floor(now / 3_600_000);
  const emailDigest = await hashKey(email, env.SUBSCRIBE_HMAC_SECRET);
  const idempotencyKey = `sub-${hourBucket}-${emailDigest.slice(0, 24)}`;

  const resendRes = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL || DEFAULT_FROM,
      to: [email],
      subject: 'Confirm your subscription to Musings of My Today',
      headers: {
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      text: [
        'Confirm your subscription to Musings of My Today.',
        '',
        'Open this link within 24 hours to confirm:',
        confirmUrl,
        '',
        'If you did not request this, ignore this email.',
      ].join('\n'),
      html: buildConfirmationEmailHtml(confirmUrl),
    }),
  });

  if (!resendRes.ok) {
    return jsonResponse(
      { ok: false, error: 'delivery_failed', message: 'Unable to send confirmation email right now.' },
      502,
    );
  }

  return wantsJson
    ? jsonResponse({ ok: true, message: UNIFORM_SUBSCRIBE_MESSAGE }, 200)
    : redirectResponse('/subscribe/?status=check-inbox');
}

async function handleConfirm(
  request: Request,
  env: WorkerEnv,
  url: URL,
  fetchImpl: typeof fetch,
  nowMs: () => number,
): Promise<Response> {
  if (request.method === 'GET') {
    const token = url.searchParams.get('token') || '';
    if (!env.SUBSCRIBE_HMAC_SECRET || !token) {
      return redirectResponse('/subscribe/?status=expired');
    }
    const payload = await verifyToken(token, env.SUBSCRIBE_HMAC_SECRET, 'confirm', nowMs());
    if (!payload) {
      return redirectResponse('/subscribe/?status=expired');
    }
    return htmlActionPage({
      title: 'Confirm Subscription',
      eyebrow: '// subscribe · confirm',
      heading: 'Confirm your email subscription',
      bodyCopy:
        'Press the button below to finish subscribing to new posts on Musings of My Today.',
      action: '/api/subscribe/confirm',
      token,
      buttonLabel: 'Confirm email subscription →',
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405, { Allow: 'GET, POST' });
  }

  const wantsJson = wantsJsonResponse(request);
  if (!env.RESEND_API_KEY || !env.SUBSCRIBE_HMAC_SECRET || !env.RESEND_AUDIENCE_ID) {
    return wantsJson
      ? jsonResponse({ ok: false, code: 'unconfigured', message: UNCONFIGURED_MESSAGE }, 503)
      : redirectResponse('/subscribe/?status=unconfigured');
  }

  const parsed = await parseRequestBody(request);
  const token = (parsed?.fields.token || url.searchParams.get('token') || '').trim();
  const payload = await verifyToken(token, env.SUBSCRIBE_HMAC_SECRET, 'confirm', nowMs());
  if (!payload) {
    return wantsJson
      ? jsonResponse({ ok: false, error: 'invalid_token' }, 400)
      : redirectResponse('/subscribe/?status=expired');
  }

  const resendRes = await upsertResendContact(env, fetchImpl, payload.e, false);
  if (!resendRes.ok) {
    return jsonResponse({ ok: false, error: 'provider_error' }, 502);
  }

  return wantsJson
    ? jsonResponse({ ok: true, status: 'confirmed' }, 200)
    : redirectResponse('/subscribe/?status=confirmed');
}

async function handleUnsubscribe(
  request: Request,
  env: WorkerEnv,
  url: URL,
  fetchImpl: typeof fetch,
  nowMs: () => number,
): Promise<Response> {
  if (request.method === 'GET') {
    const token = url.searchParams.get('token') || '';
    if (!env.SUBSCRIBE_HMAC_SECRET || !token) {
      return redirectResponse('/subscribe/?status=expired');
    }
    const payload = await verifyToken(token, env.SUBSCRIBE_HMAC_SECRET, 'unsubscribe', nowMs());
    if (!payload) {
      return redirectResponse('/subscribe/?status=expired');
    }
    return htmlActionPage({
      title: 'Unsubscribe',
      eyebrow: '// subscribe · unsubscribe',
      heading: 'Unsubscribe from email updates',
      bodyCopy:
        'Press the button below to stop receiving email updates from Musings of My Today. RSS remains available anytime.',
      action: '/api/subscribe/unsubscribe',
      token,
      buttonLabel: 'Confirm unsubscribe →',
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405, { Allow: 'GET, POST' });
  }

  const wantsJson = wantsJsonResponse(request);
  const parsed = await parseRequestBody(request);
  const isOneClick =
    parsed?.fields['List-Unsubscribe'] === 'One-Click' ||
    (parsed?.rawText ?? '').includes('List-Unsubscribe=One-Click');

  if (!env.RESEND_API_KEY || !env.SUBSCRIBE_HMAC_SECRET || !env.RESEND_AUDIENCE_ID) {
    return wantsJson || isOneClick
      ? jsonResponse({ ok: false, code: 'unconfigured', message: UNCONFIGURED_MESSAGE }, 503)
      : redirectResponse('/subscribe/?status=unconfigured');
  }

  const token = (url.searchParams.get('token') || parsed?.fields.token || '').trim();
  const payload = await verifyToken(token, env.SUBSCRIBE_HMAC_SECRET, 'unsubscribe', nowMs());
  if (!payload) {
    return wantsJson || isOneClick
      ? jsonResponse({ ok: false, error: 'invalid_token' }, 400)
      : redirectResponse('/subscribe/?status=expired');
  }

  const resendRes = await upsertResendContact(env, fetchImpl, payload.e, true);
  if (!resendRes.ok) {
    return jsonResponse({ ok: false, error: 'provider_error' }, 502);
  }

  return wantsJson || isOneClick
    ? jsonResponse({ ok: true, status: 'unsubscribed' }, 200)
    : redirectResponse('/subscribe/?status=unsubscribed');
}

/** Route /api/subscribe and its /confirm and /unsubscribe sub-routes. */
export async function handleSubscribe(
  request: Request,
  env: WorkerEnv,
  deps?: SubscribeDeps,
): Promise<Response> {
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const nowMs = deps?.nowMs ?? Date.now;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (path === '/api/subscribe') {
    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405, { Allow: 'POST' });
    }
    return handleSubscribePost(request, env, url, fetchImpl, nowMs);
  }

  if (path === '/api/subscribe/confirm') {
    return handleConfirm(request, env, url, fetchImpl, nowMs);
  }

  if (path === '/api/subscribe/unsubscribe') {
    return handleUnsubscribe(request, env, url, fetchImpl, nowMs);
  }

  return jsonResponse({ ok: false, error: 'not_found' }, 404);
}
