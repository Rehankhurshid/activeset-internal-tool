import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse, requireAdmin } from '@/lib/api-auth';
import { listInvoicesForProject } from '@/modules/invoices/infrastructure/invoices.repository';

export const runtime = 'nodejs';

/**
 * GET /api/refrens/invoices?projectId=<id>
 * Admin-only. Lists the local mirror records for a project. The mirror
 * holds both empty slots (status `PENDING`) and slots filled with Refrens
 * invoices, sorted by slot order then invoice date.
 *
 * Note: invoice creation is not supported in this app — use Refrens directly,
 * then map the new invoice to a slot via /api/refrens/invoices/map.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId')?.trim();
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    const items = await listInvoicesForProject(projectId);
    return NextResponse.json({ items });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[api/refrens/invoices GET] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
