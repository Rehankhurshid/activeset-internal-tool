import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse } from '@/lib/api-auth';
import { requireRaycastCaller } from '@/lib/raycast-auth';
import {
  createRaycastProject,
  loadRaycastProject,
  loadRaycastProjects,
  serializeRaycastProject,
} from '@/lib/raycast-projects';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await requireRaycastCaller(request);
    const includeLinks = request.nextUrl.searchParams.get('includeLinks') === 'true';
    const projects = await loadRaycastProjects({ includeAuditResults: false });
    return NextResponse.json({
      ok: true,
      projects: projects.map((project) => serializeRaycastProject(project, { includeLinks })),
    });
  } catch (error) {
    if (error instanceof ApiAuthError) return apiAuthErrorResponse(error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const caller = await requireRaycastCaller(request);
    const body = (await request.json().catch(() => null)) as { name?: string } | null;
    const id = await createRaycastProject(caller.uid, body?.name ?? '');
    const project = await loadRaycastProject(id);
    return NextResponse.json({
      ok: true,
      project: project ? serializeRaycastProject(project) : { id },
    });
  } catch (error) {
    if (error instanceof ApiAuthError) return apiAuthErrorResponse(error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
