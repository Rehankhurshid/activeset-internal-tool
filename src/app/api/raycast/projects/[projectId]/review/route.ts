import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse } from '@/lib/api-auth';
import { requireRaycastProjectAccess } from '@/lib/raycast-auth';
import {
  loadRaycastProject,
  serializeRaycastProject,
  setRaycastProjectReviewed,
} from '@/lib/raycast-projects';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const caller = await requireRaycastProjectAccess(request, projectId);
    const body = (await request.json().catch(() => ({}))) as { reviewed?: boolean };
    await setRaycastProjectReviewed(projectId, caller.email, body.reviewed !== false);
    const project = await loadRaycastProject(projectId);
    return NextResponse.json({ ok: true, project: project ? serializeRaycastProject(project) : null });
  } catch (error) {
    if (error instanceof ApiAuthError) return apiAuthErrorResponse(error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
