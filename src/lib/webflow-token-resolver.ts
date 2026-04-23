import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import {
  ApiAuthError,
  apiAuthErrorResponse,
  getProjectIdFromRequest,
  requireProjectAccess,
} from '@/lib/api-auth';
import { getWebflowToken } from '@/services/projectSecrets';

export interface ResolvedToken {
  projectId: string;
  apiToken: string;
}

/**
 * Resolves a Webflow API token for a server API route:
 *   1. Reads projectId from the `x-project-id` header or `?projectId=` param.
 *   2. Verifies the caller's Firebase ID token and that they own the project.
 *   3. Loads the Webflow token from the server-only `project_secrets` collection.
 *
 * On success returns { projectId, apiToken }. On any failure returns a
 * NextResponse (401/403/404) that the caller should short-circuit with.
 */
export async function resolveWebflowToken(
  req: NextRequest
): Promise<ResolvedToken | NextResponse> {
  try {
    const projectId = getProjectIdFromRequest(req);
    if (!projectId) {
      return NextResponse.json(
        { error: 'Missing x-project-id header or projectId query param' },
        { status: 400 }
      );
    }
    await requireProjectAccess(req, projectId);
    const apiToken = await getWebflowToken(projectId);
    if (!apiToken) {
      return NextResponse.json(
        { error: 'No Webflow API token is configured for this project' },
        { status: 400 }
      );
    }
    return { projectId, apiToken };
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[resolveWebflowToken] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
