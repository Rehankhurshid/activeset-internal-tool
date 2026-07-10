import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse } from '@/lib/api-auth';
import { requireRaycastProjectAccess } from '@/lib/raycast-auth';
import { addRaycastProjectLink, loadRaycastProject, serializeRaycastProject } from '@/lib/raycast-projects';
import type { CreateProjectLinkInput } from '@/types';

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
    return NextResponse.json({ ok: true, links: serializeRaycastProject(project).links });
  } catch (error) {
    if (error instanceof ApiAuthError) return apiAuthErrorResponse(error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    await requireRaycastProjectAccess(request, projectId);
    const body = (await request.json().catch(() => ({}))) as Partial<CreateProjectLinkInput>;
    const link = await addRaycastProjectLink(projectId, {
      title: body.title ?? '',
      url: body.url ?? '',
      order: body.order,
      isDefault: body.isDefault ?? false,
      source: body.source ?? 'manual',
    });
    return NextResponse.json({ ok: true, link });
  } catch (error) {
    if (error instanceof ApiAuthError) return apiAuthErrorResponse(error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
