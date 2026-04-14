import { NextRequest, NextResponse } from 'next/server';
import { start } from 'workflow/api';
import { imageScanWorkflow, type ImageScanPageRef } from '@/workflows/image-scan';
import { projectsService } from '@/services/database';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * Launch a durable bulk image-ALT scan. Workflow survives tab close/refresh.
 * Body: { projectId: string, pages: { linkId: string; url: string }[] }
 */
export async function POST(request: NextRequest) {
  try {
    const { projectId, pages } = (await request.json()) as {
      projectId?: string;
      pages?: ImageScanPageRef[];
    };

    if (!projectId || !Array.isArray(pages) || pages.length === 0) {
      return NextResponse.json(
        { error: 'Missing projectId or pages' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Reject if a running job already exists to prevent accidental duplicates.
    const project = await projectsService.getProject(projectId);
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const existing = project.imageScanJob;
    if (existing?.status === 'running') {
      const lastBeat = new Date(existing.lastUpdatedAt).getTime();
      const isStale =
        !Number.isFinite(lastBeat) || Date.now() - lastBeat > 2 * 60 * 1000;
      if (!isStale) {
        return NextResponse.json(
          { error: 'A scan is already running for this project', alreadyRunning: true },
          { status: 409, headers: corsHeaders }
        );
      }
    }

    // Defensive payload shape so the workflow receives exactly what it expects.
    const payload: ImageScanPageRef[] = pages
      .filter((p) => p && typeof p.linkId === 'string' && typeof p.url === 'string' && p.url)
      .map((p) => ({ linkId: p.linkId, url: p.url }));

    if (payload.length === 0) {
      return NextResponse.json(
        { error: 'No scannable pages in payload' },
        { status: 400, headers: corsHeaders }
      );
    }

    const run = await start(imageScanWorkflow, [projectId, payload]);

    return NextResponse.json(
      { success: true, runId: run.runId, total: payload.length },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('[image-scan/start] Failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
