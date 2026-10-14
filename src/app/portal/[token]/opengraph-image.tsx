import { getBaseUrl } from '@/lib/base-url';
import { hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { PORTAL_CARD_SIZE, renderPortalCard } from '@/lib/og/portal-card';
import { loadPortalOgData, type PortalOgData } from '@/lib/portal-og';

/**
 * The preview card shown when a portal link is pasted into Slack, WhatsApp,
 * iMessage, email... Next adds the og:image tag to the page from this file.
 * See src/lib/og/portal-card.tsx for the design and why it cannot break.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'Project page prepared by ActiveSet';
export const size = PORTAL_CARD_SIZE;
export const contentType = 'image/png';

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let data: PortalOgData | null = null;
  if (hasFirebaseAdminCredentials) {
    try {
      data = await loadPortalOgData(token);
    } catch (err) {
      console.error('[portal-og] load failed, drawing the plain card:', err);
    }
  }

  const { png, branded } = await renderPortalCard(data, hostOf(getBaseUrl()));

  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      // Short-lived: a renamed client or a revoked link should stop showing
      // within the hour. Unfurlers keep their own copy regardless.
      'Cache-Control': branded
        ? 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400'
        : 'public, max-age=60, s-maxage=300',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
}
