import { NextRequest, NextResponse } from 'next/server';
import {
  ApiAuthError,
  apiAuthErrorResponse,
  requireProjectAccess,
} from '@/lib/api-auth';
import { importSlackRequestsForProjectId } from '@/lib/daily-control';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const caller = await requireProjectAccess(request, projectId);
    const body = (await request.json().catch(() => ({}))) as {
      lookbackHours?: number;
      maxMessagesPerChannel?: number;
    };

    const result = await importSlackRequestsForProjectId(projectId, {
      createdBy: caller.email,
      lookbackHours: Number.isFinite(body.lookbackHours) ? body.lookbackHours : undefined,
      maxMessagesPerChannel: Number.isFinite(body.maxMessagesPerChannel)
        ? body.maxMessagesPerChannel
        : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiAuthError) return apiAuthErrorResponse(error);
    console.error('[daily-control/slack-import] failed:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
