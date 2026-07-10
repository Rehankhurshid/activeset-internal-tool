import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse } from '@/lib/api-auth';
import { requireRaycastProjectAccess } from '@/lib/raycast-auth';
import {
  deleteRaycastProject,
  loadRaycastProject,
  serializeRaycastProject,
  updateRaycastProject,
} from '@/lib/raycast-projects';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    await requireRaycastProjectAccess(request, projectId);
    const project = await loadRaycastProject(projectId);
    if (!project) return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    return NextResponse.json({ ok: true, project: serializeRaycastProject(project) });
  } catch (error) {
    if (error instanceof ApiAuthError) return apiAuthErrorResponse(error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    await requireRaycastProjectAccess(request, projectId);
    const body = (await request.json().catch(() => ({}))) as Parameters<typeof updateRaycastProject>[1];
    await updateRaycastProject(projectId, body);
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    await requireRaycastProjectAccess(request, projectId);
    await deleteRaycastProject(projectId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ApiAuthError) return apiAuthErrorResponse(error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
