/**
 * Minimal Cloudflare Worker environment bindings for musingsofmy.today.
 * Zero external imports so Wrangler deploys cleanly without `npm ci`.
 */

export interface AssetsBinding {
  fetch(input: Request | string): Promise<Response>;
}

export interface WorkerEnv {
  ASSETS: AssetsBinding;
  RESEND_API_KEY?: string;
  RESEND_AUDIENCE_ID?: string;
  RESEND_FROM_EMAIL?: string;
  SUBSCRIBE_HMAC_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  DISCORD_BOT_TOKEN?: string;
}
