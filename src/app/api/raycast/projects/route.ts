import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse } from '@/lib/api-auth';
import { requireRaycastCaller } from '@/lib/raycast-auth';
import {
  createRaycastProject,
  loadRaycastProject,
  loadRaycastProjects,
  serializeRaycastProject,
} from '@/lib/raycast-projects';
import { loadRaycastProjectSummaries, type RaycastProjectSummary } from '@/lib/raycast-summary';

export const runtime = 'nodejs';
// ?summary=true reads checklists, timelines, sheets and tasks for every project.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    await requireRaycastCaller(request);
    const includeLinks = request.nextUrl.searchParams.get('includeLinks') === 'true';
    const includeSummary = request.nextUrl.searchParams.get('summary') === 'true';
    const projects = await loadRaycastProjects({ includeAuditResults: false });
    // A summary failure (a missing index, a bad doc) must not cost the list itself.
    let summaries = new Map<string, RaycastProjectSummary>();
    if (includeSummary) {
      summaries = await loadRaycastProjectSummaries(projects).catch((error) => {
        console.error('[raycast/projects] summary failed', error);
        return summaries;
      });
    }
    return NextResponse.json({
      ok: true,
      projects: projects.map((project) => ({
        ...serializeRaycastProject(project, {
          includeLinks,
          openTasks: summaries.has(project.id) ? (summaries.get(project.id)?.tasks?.open ?? 0) : undefined,
        }),
        ...(summaries.has(project.id) ? { summary: summaries.get(project.id) } : {}),
      })),
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
