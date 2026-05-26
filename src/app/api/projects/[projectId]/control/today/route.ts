import { NextRequest, NextResponse } from 'next/server';
import {
  ApiAuthError,
  apiAuthErrorResponse,
  requireProjectAccess,
} from '@/lib/api-auth';
import { getTodayControlSnapshot } from '@/lib/daily-control';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);
    const snapshot = await getTodayControlSnapshot(projectId);
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    if (error instanceof ApiAuthError) return apiAuthErrorResponse(error);
    console.error('[daily-control/today] failed:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
