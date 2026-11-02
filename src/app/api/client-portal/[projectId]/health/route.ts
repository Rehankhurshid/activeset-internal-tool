import { NextRequest, NextResponse } from 'next/server';
import { hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { ApiAuthError, apiAuthErrorResponse, requireProjectAccess } from '@/lib/api-auth';
import { loadClientPortalForTeam } from '@/lib/client-portal';
import { portalContact } from '@/modules/client-portal/domain/portal-contact';
import { portalWarnings, type PortalWarning } from '@/modules/client-portal/domain/portal-health';

export const runtime = 'nodejs';

/**
 * GET /api/client-portal/[projectId]/health → team-only warnings about the
 * client's page (ACT-92): stale, no target launch, a launch date gone by, who
 * the client is told to contact. Built from the same view the portal page
 * renders, so it warns about what the client actually sees. The view itself is
 * not returned; only the warnings and the date the page counts as its update.
 */
interface PortalHealthResponse {
  enabled: boolean;
  lastUpdateAt: string | null;
  warnings: PortalWarning[];
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  try {
    await requireProjectAccess(req, projectId);
    if (!hasFirebaseAdminCredentials) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
    }
    const loaded = await loadClientPortalForTeam(projectId);
    if (!loaded) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const { view, project, readsSheet } = loaded;
    const enabled = project.clientPortal?.enabled === true;
    const body: PortalHealthResponse = {
      enabled,
      lastUpdateAt: view.lastUpdateAt ?? null,
      warnings: portalWarnings({ view, enabled, readsSheet, contact: portalContact(project) }),
    };
    return NextResponse.json(body);
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[client-portal/health] GET failed:', err);
    return NextResponse.json({ error: 'Failed to check the client page' }, { status: 500 });
  }
}
