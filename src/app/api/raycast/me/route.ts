import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse } from '@/lib/api-auth';
import { requireRaycastCaller } from '@/lib/raycast-auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const caller = await requireRaycastCaller(request);
    return NextResponse.json({ ok: true, caller });
  } catch (error) {
    if (error instanceof ApiAuthError) return apiAuthErrorResponse(error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
