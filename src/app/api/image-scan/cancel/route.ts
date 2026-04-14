import { NextRequest, NextResponse } from 'next/server';
import { getRun } from 'workflow/api';
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
 * Cancel a running bulk image-scan workflow and clear the persisted job doc.
 * Body: { runId: string, projectId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { runId, projectId } = (await request.json()) as {
      runId?: string;
      projectId?: string;
    };

    if (!runId || !projectId) {
      return NextResponse.json(
        { error: 'Missing runId or projectId' },
        { status: 400, headers: corsHeaders }
      );
    }

    try {
      await getRun(runId).cancel();
    } catch (error) {
      console.error('[image-scan/cancel] Cancel failed:', error);
    }

    // Always clear the UI job doc — even if the run was already finished.
    await projectsService.setImageScanJob(projectId, null);

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    console.error('[image-scan/cancel] Failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
