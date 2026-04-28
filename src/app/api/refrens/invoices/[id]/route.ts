import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse, requireAdmin } from '@/lib/api-auth';
import {
  RefrensApiError,
  RefrensNotConfiguredError,
  getInvoice,
} from '@/services/RefrensService';
import {
  getInvoiceById,
  setInvoiceNotifyEnabled,
  upsertInvoiceFromRefrens,
  recomputeOverdueStatus,
  type SyncResult,
} from '@/modules/invoices/infrastructure/invoices.repository';
import {
  getProjectNameForInvoice,
  maybeFireInvoiceStatusEmail,
} from '@/modules/invoices/infrastructure/invoice-notifications';

export const runtime = 'nodejs';

interface PatchBody {
  emailNotifyEnabled?: boolean;
}

function getBaseUrl(req: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return new URL(req.url).origin;
}

/**
 * PATCH /api/refrens/invoices/:id
 * Admin-only. Updates user-owned fields on the local mirror — currently only
 * `emailNotifyEnabled`. Refrens itself is never touched here.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'invoice id required' }, { status: 400 });
    }
    const body = (await req.json()) as PatchBody;
    if (typeof body.emailNotifyEnabled !== 'boolean') {
      return NextResponse.json(
        { error: 'emailNotifyEnabled (boolean) is required' },
        { status: 400 }
      );
    }
    const existing = await getInvoiceById(id);
    if (!existing) {
      return NextResponse.json({ error: 'invoice not found' }, { status: 404 });
    }
    await setInvoiceNotifyEnabled(id, body.emailNotifyEnabled);
    const updated = await getInvoiceById(id);
    return NextResponse.json({ invoice: updated });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[api/refrens/invoices PATCH] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/refrens/invoices/:id?action=sync (default)
 *   - Pulls fresh data from Refrens and updates the mirror.
 *   - If status flipped and `emailNotifyEnabled`, fires a status-change email.
 *
 * POST /api/refrens/invoices/:id?action=recompute
 *   - Re-evaluates UNPAID → OVERDUE locally based on the stored due date,
 *     without calling Refrens. Cheap; used by the daily cron.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    const url = new URL(req.url);
    const action = url.searchParams.get('action') ?? 'sync';

    const existing = await getInvoiceById(id);
    if (!existing) {
      return NextResponse.json({ error: 'invoice not found' }, { status: 404 });
    }

    let result: SyncResult;
    if (action === 'sync') {
      const fresh = await getInvoice(existing.refrensInvoiceId);
      result = await upsertInvoiceFromRefrens(existing.projectId, {
        ...fresh,
        urlKey: existing.refrensUrlKey,
      });
    } else if (action === 'recompute') {
      result = await recomputeOverdueStatus(existing);
    } else {
      return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
    }

    if (result.statusChanged) {
      const projectName = await getProjectNameForInvoice(existing.projectId);
      await maybeFireInvoiceStatusEmail(result, projectName, getBaseUrl(req));
    }

    return NextResponse.json({
      invoice: result.invoice,
      statusChanged: result.statusChanged,
      oldStatus: result.oldStatus,
      newStatus: result.newStatus,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    if (err instanceof RefrensNotConfiguredError) {
      return NextResponse.json(
        { error: 'Refrens is not configured.' },
        { status: 400 }
      );
    }
    if (err instanceof RefrensApiError) {
      return NextResponse.json(
        { error: err.message, status: err.status, body: err.body },
        { status: 502 }
      );
    }
    console.error('[api/refrens/invoices POST] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
