import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse, requireProjectAccess } from '@/lib/api-auth';
import { refreshSitemapGap } from '@/lib/delivery-sitemap-gap';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/delivery/[projectId]/sitemap-gap  { origin? }
 *
 * Reads the live site's sitemap.xml and saves which of its static pages are not
 * on the page tracker (`delivery.sitemapGap`), returning the same snapshot.
 * `origin` is the live site to read when the team typed one; otherwise the
 * recorded launch, the custom domain, a "Live" link or the saved sitemap.
 * Team-only. A sitemap that cannot be read is a 200 with `error` set.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  try {
    await requireProjectAccess(req, projectId);
    const body = (await req.json().catch(() => ({}))) as { origin?: unknown };
    const origin = typeof body.origin === 'string' && body.origin.trim() ? body.origin.trim() : undefined;
    return NextResponse.json({ gap: await refreshSitemapGap(projectId, origin) });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[delivery/sitemap-gap] failed:', err);
    return NextResponse.json({ error: 'The sitemap could not be checked' }, { status: 500 });
  }
}
