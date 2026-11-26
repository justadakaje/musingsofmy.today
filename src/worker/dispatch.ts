/**
 * Air-gapped newsletter dispatch endpoint (POST /api/subscribe/dispatch).
 * Zero external imports; authenticates via constant-time shared secret,
 * signs per-recipient RFC 8058 unsubscribe tokens, and dispatches through Resend REST API.
 */

import { hashKey, signToken, verifySharedSecret } from './crypto.ts';
import type { WorkerEnv } from './types.ts';

export interface DispatchDeps {
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
}

interface ResendContact {
  email?: string;
  unsubscribed?: boolean;
}

const DEFAULT_FROM = 'Kenneth Henseler <newsletter@musingsofmy.today>';
const SLUG_REGEX = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const BATCH_SIZE = 100;

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPostDispatchHtml(opts: {
  eyebrow: string;
  title: string;
  summary: string;
  postUrl: string;
  unsubscribeUrl: string;
}): string {
  const safeEyebrow = escapeHtml(opts.eyebrow);
  const safeTitle = escapeHtml(opts.title);
  const safeSummary = escapeHtml(opts.summary);
  const safePostUrl = opts.postUrl.replace(/"/g, '&quot;');
  const safeUnsubUrl = opts.unsubscribeUrl.replace(/"/g, '&quot;');

  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#05070a;color:#d4e0e8;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:28px;background:#0a1218;border:1px solid #164e63;">
    <p style="margin:0 0 8px;font-family:monospace;font-size:12px;color:#e0a93b;">${safeEyebrow}</p>
    <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#ffffff;">${safeTitle}</h1>
    <p style="margin:0 0 24px;color:#9bb0bd;line-height:1.65;">${safeSummary}</p>
    <p style="margin:0 0 24px;">
      <a href="${safePostUrl}" style="display:inline-block;padding:12px 20px;background:#22d3ee;color:#04181d;font-weight:700;text-decoration:none;font-family:monospace;">
        Read the full post →
      </a>
    </p>
    <hr style="border:0;border-top:1px solid rgba(34,211,238,0.2);margin:20px 0;" />
    <p style="margin:0;font-size:12px;color:#5c7080;line-height:1.5;">
      Sent to confirmed subscribers of Musings of My Today.
      <a href="${safeUnsubUrl}" style="color:#9bb0bd;text-decoration:underline;">Unsubscribe in one click</a>.
    </p>
  </div>
</body>
</html>`;
}

async function buildRecipientMessage(opts: {
  from: string;
  to: string;
  slug: string;
  title: string;
  eyebrow: string;
  summary: string;
  postUrl: string;
  hmacSecret: string;
  nowSec: number;
}): Promise<Record<string, unknown>> {
  const unsubToken = await signToken(
    { e: opts.to, exp: opts.nowSec + 90 * 24 * 60 * 60, p: 'unsubscribe' },
    opts.hmacSecret,
  );
  const unsubscribeUrl = `https://musingsofmy.today/api/subscribe/unsubscribe?token=${encodeURIComponent(unsubToken)}`;

  return {
    from: opts.from,
    to: [opts.to],
    subject: opts.title,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    text: [
      opts.eyebrow,
      '',
      opts.title,
      '',
      opts.summary,
      '',
      `Read the full post: ${opts.postUrl}`,
      '',
      '---',
      `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n'),
    html: buildPostDispatchHtml({
      eyebrow: opts.eyebrow,
      title: opts.title,
      summary: opts.summary,
      postUrl: opts.postUrl,
      unsubscribeUrl,
    }),
  };
}

async function fetchConfirmedRecipients(
  env: WorkerEnv,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; emails: string[] } | { ok: false; status: number }> {
  const res = await fetchImpl(
    `https://api.resend.com/audiences/${encodeURIComponent(env.RESEND_AUDIENCE_ID!)}/contacts`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY!}`,
      },
    },
  );
  if (!res.ok) {
    return { ok: false, status: res.status };
  }

  let body: { data?: ResendContact[] } | null = null;
  try {
    body = (await res.json()) as { data?: ResendContact[] };
  } catch {
    return { ok: false, status: 502 };
  }

  const seen = new Set<string>();
  const emails: string[] = [];
  for (const contact of body?.data ?? []) {
    if (contact?.unsubscribed) continue;
    const email = typeof contact?.email === 'string' ? contact.email.trim().toLowerCase() : '';
    if (!email || email.length > 254 || !EMAIL_REGEX.test(email) || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return { ok: true, emails };
}

/** Handle POST /api/subscribe/dispatch for air-gapped newsletter delivery. */
export async function handleNewsletterDispatch(
  request: Request,
  env: WorkerEnv,
  deps?: DispatchDeps,
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405, { Allow: 'POST' });
  }

  if (
    !env.NEWSLETTER_DISPATCH_SECRET ||
    !env.RESEND_API_KEY ||
    !env.RESEND_AUDIENCE_ID ||
    !env.SUBSCRIBE_HMAC_SECRET
  ) {
    return jsonResponse({ ok: false, error: 'unconfigured' }, 503);
  }

  const authHeader = request.headers.get('Authorization') || '';
  const match = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
  const providedSecret = match?.[1] || '';
  const authorized = await verifySharedSecret(providedSecret, env.NEWSLETTER_DISPATCH_SECRET);
  if (!authorized) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400);
  }

  if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
    return jsonResponse({ ok: false, error: 'invalid_body' }, 400);
  }

  const payload = rawBody as Record<string, unknown>;
  const slug = typeof payload.slug === 'string' ? payload.slug.trim() : '';
  const postUrlRaw = typeof payload.url === 'string' ? payload.url.trim() : '';
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const summary = typeof payload.summary === 'string' ? payload.summary.trim() : '';
  const eyebrow =
    typeof payload.eyebrow === 'string' && payload.eyebrow.trim().length > 0
      ? payload.eyebrow.trim().slice(0, 120)
      : '// musingsofmy.today · new post';
  const dryRun = payload.dryRun === true;
  const testToRaw = typeof payload.testTo === 'string' ? payload.testTo.trim().toLowerCase() : '';

  if (!SLUG_REGEX.test(slug)) {
    return jsonResponse({ ok: false, error: 'invalid_slug' }, 400);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(postUrlRaw);
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_url' }, 400);
  }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'musingsofmy.today') {
    return jsonResponse({ ok: false, error: 'invalid_url' }, 400);
  }

  if (!title || title.length > 240 || /[\r\n]/.test(title)) {
    return jsonResponse({ ok: false, error: 'invalid_title' }, 400);
  }
  if (!summary || summary.length > 2000) {
    return jsonResponse({ ok: false, error: 'invalid_summary' }, 400);
  }

  if (testToRaw && (testToRaw.length > 254 || !EMAIL_REGEX.test(testToRaw) || /[\r\n]/.test(testToRaw))) {
    return jsonResponse({ ok: false, error: 'invalid_test_recipient' }, 400);
  }

  const fetchImpl = deps?.fetchImpl ?? fetch;
  const now = (deps?.nowMs ?? Date.now)();
  const nowSec = Math.floor(now / 1000);
  const from = env.RESEND_FROM_EMAIL || DEFAULT_FROM;

  if (testToRaw && !dryRun) {
    const message = await buildRecipientMessage({
      from,
      to: testToRaw,
      slug,
      title,
      eyebrow,
      summary,
      postUrl: parsedUrl.toString(),
      hmacSecret: env.SUBSCRIBE_HMAC_SECRET,
      nowSec,
    });
    const minuteBucket = Math.floor(now / 60_000);
    const digest = await hashKey(`${testToRaw}:${minuteBucket}`, env.SUBSCRIBE_HMAC_SECRET);
    const sendRes = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `test-${slug}-${digest.slice(0, 16)}`,
      },
      body: JSON.stringify(message),
    });
    if (!sendRes.ok) {
      return jsonResponse({ ok: false, error: 'delivery_failed' }, 502);
    }
    return jsonResponse({ ok: true, mode: 'test', slug, title, sent: 1 }, 200);
  }

  const contacts = await fetchConfirmedRecipients(env, fetchImpl);
  if (!contacts.ok) {
    return jsonResponse({ ok: false, error: 'provider_error' }, 502);
  }

  if (dryRun) {
    return jsonResponse(
      {
        ok: true,
        mode: 'dry-run',
        slug,
        title,
        recipientCount: contacts.emails.length,
      },
      200,
    );
  }

  if (contacts.emails.length === 0) {
    return jsonResponse({ ok: true, mode: 'audience', slug, title, sent: 0, batches: 0 }, 200);
  }

  let batches = 0;
  for (let i = 0; i < contacts.emails.length; i += BATCH_SIZE) {
    const chunk = contacts.emails.slice(i, i + BATCH_SIZE);
    const messages = await Promise.all(
      chunk.map((to) =>
        buildRecipientMessage({
          from,
          to,
          slug,
          title,
          eyebrow,
          summary,
          postUrl: parsedUrl.toString(),
          hmacSecret: env.SUBSCRIBE_HMAC_SECRET!,
          nowSec,
        }),
      ),
    );

    const batchRes = await fetchImpl('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `post-${slug}-batch-${batches}`,
      },
      body: JSON.stringify(messages),
    });

    if (!batchRes.ok) {
      return jsonResponse({ ok: false, error: 'delivery_failed', completedBatches: batches }, 502);
    }
    batches += 1;
  }

  return jsonResponse(
    {
      ok: true,
      mode: 'audience',
      slug,
      title,
      sent: contacts.emails.length,
      batches,
    },
    200,
  );
}
