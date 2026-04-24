import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { requireCaller, ApiAuthError, apiAuthErrorResponse } from '@/lib/api-auth';

export const runtime = 'nodejs';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await requireCaller(req);
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    throw err;
  }

  if (!id) return NextResponse.json({ error: 'Invalid proposal id' }, { status: 400 });

  const url = new URL(req.url);
  const rawLimit = Number.parseInt(url.searchParams.get('limit') || '', 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;

  try {
    // No orderBy here — an orderBy on a different field than the equality
    // filter requires a composite index, which we can't deploy with the
    // current service account's roles. With the per-proposal result size
    // bounded (capped to MAX_LIMIT below), sorting client-side is cheap.
    const snap = await db
      .collection('proposal_views')
      .where('proposalId', '==', id)
      .limit(MAX_LIMIT)
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
      .sort((a, b) => (a.viewedAt < b.viewedAt ? 1 : -1))
      .slice(0, limit);

    return NextResponse.json({ views });
  } catch (error) {
    console.error('[proposal-views] failed to list views:', error);
    return NextResponse.json({ error: 'Failed to list views' }, { status: 500 });
  }
}
