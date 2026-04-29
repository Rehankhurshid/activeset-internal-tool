import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse, requireAdmin } from '@/lib/api-auth';
import {
  RefrensApiError,
  RefrensNotConfiguredError,
  getInvoice,
} from '@/services/RefrensService';
import { getRefrensCredentials } from '@/services/appSecrets';
import {
  fillSlotWithRefrens,
  findInvoiceByRefrensId,
  getInvoiceById,
  upsertInvoiceFromRefrens,
} from '@/modules/invoices/infrastructure/invoices.repository';

export const runtime = 'nodejs';

interface MapBody {
  projectId?: string;
  refrensInvoiceId?: string;
  slotId?: string;
}

/**
 * POST /api/refrens/invoices/map
 *
 * Admin-only. Maps an existing Refrens invoice to a project. Two modes:
 *
 *  - With `slotId`: fills that empty slot with the Refrens invoice. The
 *    slot's planning fields (label, expected amounts, etc.) are preserved.
 *  - Without `slotId`: creates an ad-hoc row backed by the Refrens invoice.
 *    Idempotent — re-mapping the same invoice updates the existing row.
 *
 * Refuses with 409 if the Refrens invoice is already mapped to a different
 * project (or to a different slot in this project when `slotId` is given).
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = (await req.json()) as MapBody;
    const projectId = body.projectId?.trim();
    const refrensInvoiceId = body.refrensInvoiceId?.trim();
    const slotId = body.slotId?.trim();

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    if (!refrensInvoiceId) {
      return NextResponse.json({ error: 'refrensInvoiceId is required' }, { status: 400 });
    }

    const collision = await findInvoiceByRefrensId(refrensInvoiceId);
    if (collision) {
      const sameProject = collision.projectId === projectId;
      const sameSlot = slotId ? collision.id === slotId : false;
      if (!sameProject) {
        return NextResponse.json(
          {
            error: 'This invoice is already mapped to another project.',
            mappedToProjectId: collision.projectId,
          },
          { status: 409 }
        );
      }
      if (slotId && !sameSlot) {
        return NextResponse.json(
          {
            error: 'This invoice is already mapped to another slot in this project.',
            mappedToSlotId: collision.id,
          },
          { status: 409 }
        );
      }
    }

    const creds = await getRefrensCredentials();
    if (!creds) {
      return NextResponse.json({ error: 'Refrens is not configured.' }, { status: 400 });
    }
    const fresh = await getInvoice(refrensInvoiceId);
    const enriched = { ...fresh, urlKey: creds.urlKey };

    let invoice;
    if (slotId) {
      // Verify the slot belongs to this project before filling it
      const slot = await getInvoiceById(slotId);
      if (!slot) {
        return NextResponse.json({ error: 'slot not found' }, { status: 404 });
      }
      if (slot.projectId !== projectId) {
        return NextResponse.json(
          { error: 'slot does not belong to this project' },
          { status: 400 }
        );
      }
      const result = await fillSlotWithRefrens(slotId, enriched);
      invoice = result.invoice;
    } else {
      const result = await upsertInvoiceFromRefrens(projectId, enriched);
      invoice = result.invoice;
    }

    return NextResponse.json({ invoice });
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
    console.error('[api/refrens/invoices/map POST] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
