import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse, requireAdmin } from '@/lib/api-auth';
import {
  RefrensApiError,
  RefrensNotConfiguredError,
  getInvoice,
  invalidateInvoiceListCache,
} from '@/services/RefrensService';
import {
  deleteSlot,
  getInvoiceById,
  recomputeOverdueStatus,
  setInvoiceNotifyEnabled,
  unmapSlot,
  updateSlotFields,
  upsertInvoiceFromRefrens,
  type SyncResult,
} from '@/modules/invoices/infrastructure/invoices.repository';
import {
  getProjectNameForInvoice,
  maybeFireInvoiceStatusEmail,
} from '@/modules/invoices/infrastructure/invoice-notifications';
import type { UpdateSlotInput } from '@/modules/invoices/domain/types';

export const runtime = 'nodejs';

interface PatchBody extends UpdateSlotInput {
  emailNotifyEnabled?: boolean;
}

function getBaseUrl(req: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return new URL(req.url).origin;
}

/**
 * PATCH /api/refrens/invoices/:id
 * Admin-only. Updates user-owned fields on the row — slot planning fields
 * (label, expectedAmount, expectedCurrency, expectedDueDate, notes) and the
 * email notify toggle. Refrens itself is never touched here.
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
    const existing = await getInvoiceById(id);
    if (!existing) {
      return NextResponse.json({ error: 'invoice not found' }, { status: 404 });
    }

    const slotPatch: UpdateSlotInput = {};
    if ('label' in body && typeof body.label === 'string') {
      const label = body.label.trim();
      if (!label) {
        return NextResponse.json({ error: 'label cannot be empty' }, { status: 400 });
      }
      slotPatch.label = label;
    }
    if ('expectedAmount' in body) {
      if (body.expectedAmount == null) {
        slotPatch.expectedAmount = null;
      } else {
        const n = Number(body.expectedAmount);
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json(
            { error: 'expectedAmount must be non-negative' },
            { status: 400 }
          );
        }
        slotPatch.expectedAmount = n;
      }
    }
    if ('expectedCurrency' in body) slotPatch.expectedCurrency = body.expectedCurrency ?? null;
    if ('expectedDueDate' in body) slotPatch.expectedDueDate = body.expectedDueDate ?? null;
    if ('notes' in body) slotPatch.notes = body.notes ?? null;

    if (Object.keys(slotPatch).length > 0) {
      await updateSlotFields(id, slotPatch);
    }

    if (typeof body.emailNotifyEnabled === 'boolean') {
      await setInvoiceNotifyEnabled(id, body.emailNotifyEnabled);
    }

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
 * DELETE /api/refrens/invoices/:id
 * Admin-only. Deletes the slot row entirely. The Refrens invoice (if mapped)
 * is left untouched on Refrens — only our local mirror is removed.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    const existing = await getInvoiceById(id);
    if (!existing) {
      return NextResponse.json({ error: 'invoice not found' }, { status: 404 });
    }
    await deleteSlot(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[api/refrens/invoices DELETE] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/refrens/invoices/:id?action=sync (default)
 *   - Pulls fresh data from Refrens and updates the mirror.
 *   - Fires opt-in status-change email if status flipped.
 *
 * POST /api/refrens/invoices/:id?action=recompute
 *   - Re-evaluates UNPAID → OVERDUE locally based on dueDate. No Refrens
 *     call. Used by cron.
 *
 * POST /api/refrens/invoices/:id?action=unmap
 *   - Clears Refrens fields on the row, returning it to PENDING. Slot
 *     planning fields are preserved.
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

    if (action === 'unmap') {
      const updated = await unmapSlot(id);
      invalidateInvoiceListCache();
      return NextResponse.json({ invoice: updated });
    }

    if (!existing.refrensInvoiceId || !existing.refrensUrlKey) {
      return NextResponse.json(
        { error: 'This row has no Refrens invoice attached. Map one first.' },
        { status: 400 }
      );
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
      return NextResponse.json({ error: 'Refrens is not configured.' }, { status: 400 });
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
