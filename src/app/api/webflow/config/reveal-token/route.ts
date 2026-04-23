import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse, requireProjectAccess } from '@/lib/api-auth';
import { getWebflowToken } from '@/services/projectSecrets';

export const runtime = 'nodejs';

/**
 * POST /api/webflow/config/reveal-token
 * Body: { projectId: string }
 *
 * Returns the raw Webflow API token for the given project. Only used when the
 * user explicitly requests the token (e.g. copying a CLI command that has to
 * carry the token). Requires an authenticated caller who owns the project.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { projectId?: string };
    const projectId = body.projectId?.trim();
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const caller = await requireProjectAccess(req, projectId);
    const apiToken = await getWebflowToken(projectId);
    if (!apiToken) {
      return NextResponse.json(
        { error: 'No Webflow API token is configured for this project' },
        { status: 404 }
      );
    }

    console.info(
      `[webflow/config/reveal-token] token revealed for project=${projectId} by uid=${caller.uid} email=${caller.email}`
    );

    return NextResponse.json({ apiToken });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[api/webflow/config/reveal-token] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
