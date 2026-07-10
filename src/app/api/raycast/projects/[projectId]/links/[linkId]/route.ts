import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse } from '@/lib/api-auth';
import { requireRaycastProjectAccess } from '@/lib/raycast-auth';
import { deleteRaycastProjectLink, updateRaycastProjectLink } from '@/lib/raycast-projects';
import type { UpdateProjectLinkInput } from '@/types';

export const runtime = 'nodejs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; linkId: string }> },
) {
  try {
    const { projectId, linkId } = await params;
    await requireRaycastProjectAccess(request, projectId);
    const body = (await request.json().catch(() => ({}))) as UpdateProjectLinkInput;
    const link = await updateRaycastProjectLink(projectId, linkId, body);
    return NextResponse.json({ ok: true, link });
  } catch (error) {
    if (error instanceof ApiAuthError) return apiAuthErrorResponse(error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; linkId: string }> },
) {
  try {
    const { projectId, linkId } = await params;
    await requireRaycastProjectAccess(request, projectId);
    await deleteRaycastProjectLink(projectId, linkId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ApiAuthError) return apiAuthErrorResponse(error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
