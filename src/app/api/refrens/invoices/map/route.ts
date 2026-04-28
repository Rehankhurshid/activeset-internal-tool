import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse, requireAdmin } from '@/lib/api-auth';
import {
  RefrensApiError,
  RefrensNotConfiguredError,
  getInvoice,
} from '@/services/RefrensService';
import { getRefrensCredentials } from '@/services/appSecrets';
import {
  findInvoiceByRefrensId,
  upsertInvoiceFromRefrens,
} from '@/modules/invoices/infrastructure/invoices.repository';

export const runtime = 'nodejs';

interface MapBody {
  projectId?: string;
  refrensInvoiceId?: string;
}

/**
 * POST /api/refrens/invoices/map
 *
 * Admin-only. Maps an existing Refrens invoice to a project by fetching it
 * from Refrens and upserting the mirror. Refuses if the invoice is already
 * mapped to a different project (one Refrens invoice → one project).
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = (await req.json()) as MapBody;
    const projectId = body.projectId?.trim();
    const refrensInvoiceId = body.refrensInvoiceId?.trim();

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    if (!refrensInvoiceId) {
      return NextResponse.json({ error: 'refrensInvoiceId is required' }, { status: 400 });
    }

    const existing = await findInvoiceByRefrensId(refrensInvoiceId);
    if (existing && existing.projectId !== projectId) {
      return NextResponse.json(
        {
          error: 'This invoice is already mapped to another project.',
          mappedToProjectId: existing.projectId,
        },
        { status: 409 }
      );
    }

    const creds = await getRefrensCredentials();
    if (!creds) {
      return NextResponse.json({ error: 'Refrens is not configured.' }, { status: 400 });
    }

    const fresh = await getInvoice(refrensInvoiceId);
    const result = await upsertInvoiceFromRefrens(projectId, {
      ...fresh,
      urlKey: creds.urlKey,
    });

    return NextResponse.json({ invoice: result.invoice, alreadyMapped: Boolean(existing) });
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
