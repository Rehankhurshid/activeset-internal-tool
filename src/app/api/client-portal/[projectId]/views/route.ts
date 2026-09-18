import { NextRequest, NextResponse } from 'next/server';
import { db, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { ApiAuthError, apiAuthErrorResponse, requireProjectAccess } from '@/lib/api-auth';

export const runtime = 'nodejs';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * GET /api/client-portal/[projectId]/views?limit=N — recent portal opens for
 * the Client tab. Same shape as /api/proposals/[id]/views so the shared
 * ViewsPopover can render either.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  try {
    await requireProjectAccess(req, projectId);
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    throw err;
  }
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  const url = new URL(req.url);
  const rawLimit = Number.parseInt(url.searchParams.get('limit') || '', 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;

  try {
    // Subcollection under the project: a single-field orderBy needs no
    // composite index, so the newest opens are always the ones returned.
    const snap = await db
      .collection(COLLECTIONS.PROJECTS)
      .doc(projectId)
      .collection(COLLECTIONS.CLIENT_PORTAL_VIEWS)
      .orderBy('viewedAt', 'desc')
      .limit(limit)
      .get();

    const views = snap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          viewedAt: String(data.viewedAt || ''),
          country: data.country as string | undefined,
          city: data.city as string | undefined,
          userAgent: data.userAgent as string | undefined,
          referrer: data.referrer as string | undefined,
        };
      })
      .sort((a, b) => (a.viewedAt < b.viewedAt ? 1 : -1));

    return NextResponse.json({ views });
  } catch (error) {
    console.error('[client-portal/views] failed to list views:', error);
    return NextResponse.json({ error: 'Failed to list views' }, { status: 500 });
  }
}
