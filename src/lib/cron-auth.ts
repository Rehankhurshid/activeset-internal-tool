import { timingSafeEqual } from 'node:crypto';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Cron routes accept `Authorization: Bearer <CRON_SECRET>` (what Vercel Cron
 * sends when the env var is set) or `x-cron-secret: <CRON_SECRET>` (internal
 * dispatch, see {@link getCronSecretHeaders}).
 *
 * Fail-closed in production: when CRON_SECRET is unset every caller is
 * rejected, so a deploy that forgot the secret cannot leave the cron endpoints
 * open to the internet. Outside production an unset secret still lets local
 * runs through.
 */
export function isCronAuthorized(request: Pick<Request, 'headers'>): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[cron-auth] CRON_SECRET is not set; rejecting cron request');
      return false;
    }
    return true;
  }

  const authorization = request.headers.get('authorization') || '';
  if (authorization.startsWith('Bearer ') && safeEqual(authorization.slice(7).trim(), expectedSecret)) {
    return true;
  }

  const header = request.headers.get('x-cron-secret');
  return !!header && safeEqual(header, expectedSecret);
}

export function getCronSecretHeaders(): Record<string, string> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return {};

  return {
    Authorization: `Bearer ${secret}`,
    'x-cron-secret': secret,
  };
}
