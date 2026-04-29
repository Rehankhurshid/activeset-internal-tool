import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse, requireAdmin } from '@/lib/api-auth';
import { createSlot } from '@/modules/invoices/infrastructure/invoices.repository';

export const runtime = 'nodejs';

interface CreateSlotBody {
  projectId?: string;
  label?: string;
  expectedAmount?: number | null;
  expectedCurrency?: string | null;
  expectedDueDate?: string | null;
  notes?: string | null;
}

/**
 * POST /api/refrens/invoices/slot
 * Admin-only. Creates an empty invoice slot on a project. The slot starts
 * with status `PENDING` and gets filled later by mapping a Refrens invoice
 * into it.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = (await req.json()) as CreateSlotBody;
    const projectId = body.projectId?.trim();
    const label = body.label?.trim();

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    if (!label) {
      return NextResponse.json({ error: 'label is required' }, { status: 400 });
    }

    let expectedAmount: number | null = null;
    if (body.expectedAmount != null) {
      const n = Number(body.expectedAmount);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: 'expectedAmount must be non-negative' }, { status: 400 });
      }
      expectedAmount = n;
    }

    const invoice = await createSlot(projectId, {
      label,
      expectedAmount,
      expectedCurrency: body.expectedCurrency?.trim() || null,
      expectedDueDate: body.expectedDueDate?.trim() || null,
      notes: body.notes?.trim() || null,
    });
    return NextResponse.json({ invoice });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[api/refrens/invoices/slot POST] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
