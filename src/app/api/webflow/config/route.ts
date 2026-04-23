import { NextRequest, NextResponse } from 'next/server';
import { db as adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/lib/constants';
import { ApiAuthError, apiAuthErrorResponse, requireProjectAccess } from '@/lib/api-auth';
import { setWebflowToken, deleteWebflowToken, hasWebflowToken } from '@/services/projectSecrets';

export const runtime = 'nodejs';

interface SaveBody {
  projectId?: string;
  siteId?: string;
  apiToken?: string;
  siteName?: string;
  customDomain?: string;
}

/**
 * POST /api/webflow/config
 * Save/update the Webflow config for a project. The apiToken is stored in the
 * server-only `project_secrets/{projectId}` collection; the project document
 * only receives non-secret metadata (siteId, siteName, customDomain).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SaveBody;
    const projectId = body.projectId?.trim();
    const siteId = body.siteId?.trim();
    const apiToken = body.apiToken?.trim();

    if (!projectId || !siteId || !apiToken) {
      return NextResponse.json(
        { error: 'projectId, siteId and apiToken are required' },
        { status: 400 }
      );
    }

    await requireProjectAccess(req, projectId);

    await setWebflowToken(projectId, apiToken);

    const metadata: Record<string, unknown> = {
      siteId,
      siteName: body.siteName || null,
      customDomain: body.customDomain || null,
      lastSyncedAt: new Date().toISOString(),
      hasApiToken: true,
    };

    await adminDb
      .collection(COLLECTIONS.PROJECTS)
      .doc(projectId)
      .set(
        {
          webflowConfig: metadata,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[api/webflow/config POST] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/webflow/config?projectId=<id>
 * Removes both the metadata on the project doc and the stored secret.
 */
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId')?.trim();
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    await requireProjectAccess(req, projectId);

    await deleteWebflowToken(projectId);

    await adminDb
      .collection(COLLECTIONS.PROJECTS)
      .doc(projectId)
      .set(
        {
          webflowConfig: null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[api/webflow/config DELETE] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webflow/config?projectId=<id>
 * Returns whether a Webflow token is configured for a project. Never returns
 * the token itself.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId')?.trim();
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    await requireProjectAccess(req, projectId);

    const configured = await hasWebflowToken(projectId);
    return NextResponse.json({ configured });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[api/webflow/config GET] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
