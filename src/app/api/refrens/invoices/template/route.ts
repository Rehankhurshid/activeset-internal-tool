import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse, requireAdmin } from '@/lib/api-auth';
import { createSlotsBatch } from '@/modules/invoices/infrastructure/invoices.repository';
import { expandToSlots, type PaymentTemplate } from '@/lib/payment-templates';

export const runtime = 'nodejs';

interface ApplyBody {
  projectId?: string;
  template?: PaymentTemplate;
  totalAmount?: number;
  currency?: string;
  startDate?: string;
}

/**
 * POST /api/refrens/invoices/template
 *
 * Admin-only. Expands a {@link PaymentTemplate} into N empty slots on the
 * project. The template + parameters are deterministic — same inputs always
 * produce the same slots — so this endpoint can also be called by the
 * "Import from proposal" flow with a saved proposal template.
 *
 * Existing slots on the project are preserved and untouched; the new slots
 * are appended (assigned next-available `order`).
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = (await req.json()) as ApplyBody;
    const projectId = body.projectId?.trim();
    const totalAmount = Number(body.totalAmount);
    const currency = body.currency?.trim();
    const startDate = body.startDate?.trim();

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    if (!body.template || typeof body.template !== 'object') {
      return NextResponse.json({ error: 'template is required' }, { status: 400 });
    }
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return NextResponse.json({ error: 'totalAmount must be a positive number' }, { status: 400 });
    }
    if (!currency) {
      return NextResponse.json({ error: 'currency is required' }, { status: 400 });
    }
    if (!startDate) {
      return NextResponse.json({ error: 'startDate is required' }, { status: 400 });
    }

    let slots;
    try {
      slots = expandToSlots(body.template, { totalAmount, currency, startDate });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Invalid template' },
        { status: 400 }
      );
    }

    const created = await createSlotsBatch(projectId, slots);
    return NextResponse.json({ invoices: created });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[api/refrens/invoices/template POST] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
