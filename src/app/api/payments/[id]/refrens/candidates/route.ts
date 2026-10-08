import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { RefrensApiError, RefrensNotConfiguredError } from '@/services/RefrensService';
import { getPayment } from '@/modules/payments/infrastructure/payments.repository';
import { findRefrensCandidates } from '@/modules/payments/infrastructure/refrens-candidates';
import { paymentsErrorResponse } from '@/modules/payments/infrastructure/route-errors';

export const runtime = 'nodejs';

/**
 * GET /api/payments/[id]/refrens/candidates → { candidates }
 * Refrens invoices this credit could belong to (see findRefrensCandidates).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(req);
    const { id } = await ctx.params;
    const payment = await getPayment(id);
    if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    if (!payment.projectId) return NextResponse.json({ error: 'Assign the payment to a project first' }, { status: 400 });
    const candidates = await findRefrensCandidates({ ...payment, projectId: payment.projectId });
    return NextResponse.json({ candidates });
  } catch (err) {
    if (err instanceof RefrensNotConfiguredError) return NextResponse.json({ error: 'Refrens is not connected' }, { status: 409 });
    if (err instanceof RefrensApiError) return NextResponse.json({ error: `Refrens: ${err.message}` }, { status: 502 });
    return paymentsErrorResponse(err, 'api/payments/[id]/refrens/candidates GET');
  }
}
