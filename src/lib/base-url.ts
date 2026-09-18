/**
 * Single resolver for the app's public origin, for links that leave the app
 * (client portal URLs, emails, Slack). Set NEXT_PUBLIC_BASE_URL in Vercel to
 * pin it; otherwise production resolves to app.activeset.co, previews to the
 * Vercel deployment URL, and local runs to localhost.
 */
export function getBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  if (process.env.VERCEL_ENV === 'production') return 'https://app.activeset.co';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export function portalPath(token: string): string {
  return `/portal/${token}`;
}

export function portalUrl(token: string): string {
  return `${getBaseUrl()}${portalPath(token)}`;
}
