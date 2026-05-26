import { NextRequest, NextResponse } from 'next/server';
import {
  ApiAuthError,
  apiAuthErrorResponse,
  requireProjectAccess,
} from '@/lib/api-auth';
import { runDailyControlForProject } from '@/lib/daily-control';

export const runtime = 'nodejs';
export const maxDuration = 90;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const caller = await requireProjectAccess(request, projectId);
    const body = (await request.json().catch(() => ({}))) as {
      includeSlackImport?: boolean;
      lookbackHours?: number;
    };

    const result = await runDailyControlForProject(projectId, {
      createdBy: caller.email,
      includeSlackImport: body.includeSlackImport,
      lookbackHours: Number.isFinite(body.lookbackHours) ? body.lookbackHours : undefined,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (error) {
    if (error instanceof ApiAuthError) return apiAuthErrorResponse(error);
    console.error('[daily-control/run] failed:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
