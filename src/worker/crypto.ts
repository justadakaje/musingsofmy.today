/**
 * Web Crypto helpers for stateless HMAC-SHA256 subscription tokens and keyed hashing.
 * Zero external dependencies; relies solely on standard Web Crypto and TextEncoder/TextDecoder.
 */

export type TokenPurpose = 'confirm' | 'unsubscribe';

export interface TokenPayload {
  e: string;
  exp: number;
  p: TokenPurpose;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Encode raw bytes to unpadded base64url (RFC 4648 §5). */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Decode unpadded base64url into raw bytes, returning null on malformed input. */
export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const remainder = value.length % 4;
  if (remainder === 1) return null;
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + (remainder === 0 ? '' : '='.repeat(4 - remainder));
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    return null;
  }
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function importHmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

/** Sign a TokenPayload into `<base64url(payload)>.<base64url(hmac)>`. */
export async function signToken(payload: TokenPayload, secret: string): Promise<string> {
  if (!secret) throw new Error('SUBSCRIBE_HMAC_SECRET is required to sign tokens');
  const payloadPart = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await importHmacKey(secret, 'sign');
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadPart));
  return `${payloadPart}.${toBase64Url(new Uint8Array(sig))}`;
}

/**
 * Verify an HMAC-SHA256 token in constant time and check its purpose and expiry.
 * Returns null if malformed, tampered, expired, or issued for a different purpose.
 */
export async function verifyToken(
  token: string,
  secret: string,
  expectedPurpose: TokenPurpose,
  nowMs: number = Date.now(),
): Promise<TokenPayload | null> {
  if (!token || !secret) return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0 || token.indexOf('.', dotIdx + 1) !== -1) return null;

  const payloadPart = token.slice(0, dotIdx);
  const sigPart = token.slice(dotIdx + 1);
  const sigBytes = fromBase64Url(sigPart);
  const payloadBytes = fromBase64Url(payloadPart);
  if (!sigBytes || !payloadBytes) return null;

  const key = await importHmacKey(secret, 'verify');
  const validSig = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payloadPart));
  if (!validSig) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(payloadBytes));
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if (
    typeof record.e !== 'string' ||
    record.e.length === 0 ||
    typeof record.exp !== 'number' ||
    !Number.isFinite(record.exp) ||
    record.p !== expectedPurpose
  ) {
    return null;
  }

  const nowSec = Math.floor(nowMs / 1000);
  if (record.exp <= nowSec) return null;

  return {
    e: record.e,
    exp: record.exp,
    p: expectedPurpose,
  };
}

/** Keyed SHA-256 hex digest so rate-limiter buckets and Idempotency-Key headers hold no raw PII. */
export async function hashKey(value: string, secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${secret}:${value}`));
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}
