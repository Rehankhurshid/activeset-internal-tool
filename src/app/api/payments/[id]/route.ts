import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import {
  assignPayment,
  getPayment,
  listProjectRefs,
  listRecentPayments,
  rememberPayer,
  setPaymentStatus,
} from '@/modules/payments/infrastructure/payments.repository';
import { paymentsErrorResponse } from '@/modules/payments/infrastructure/route-errors';

export const runtime = 'nodejs';

interface PatchBody {
  action?: 'assign' | 'ignore' | 'unassign';
  projectId?: string;
  invoiceId?: string | null;
  rememberPayer?: boolean;
}

/**
 * PATCH /api/payments/[id]
 *  { action: 'assign', projectId, invoiceId?, rememberPayer? }
 *  { action: 'ignore' }   not a client payment
 *  { action: 'unassign' } back to the review list
 *
 * Remembering a payer also assigns that payer's other unassigned payments,
 * and never applies to Skydo, Payoneer and the like.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireAdmin(req);
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as PatchBody;
    const payment = await getPayment(id);
    if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });

    if (body.action === 'ignore' || body.action === 'unassign') {
      await setPaymentStatus(id, body.action === 'ignore' ? 'ignored' : 'unassigned', caller.email);
      return NextResponse.json({ ok: true, alsoAssigned: 0 });
    }

    if (body.action !== 'assign' || !body.projectId) {
      return NextResponse.json({ error: 'action must be assign (with projectId), ignore or unassign' }, { status: 400 });
    }
    const projects = await listProjectRefs();
    if (!projects.some((p) => p.id === body.projectId)) {
      return NextResponse.json({ error: 'Unknown project' }, { status: 400 });
    }

    await assignPayment(id, { projectId: body.projectId, invoiceId: body.invoiceId ?? null, by: caller.email });

    let alsoAssigned = 0;
    if (body.rememberPayer && payment.payerKey && !payment.via) {
      await rememberPayer({
        payerKey: payment.payerKey,
        payerName: payment.payerName,
        projectId: body.projectId,
        createdBy: caller.email,
        createdAt: new Date().toISOString(),
      });
      const others = (await listRecentPayments()).filter(
        (p) => p.id !== id && p.status === 'unassigned' && p.payerKey === payment.payerKey
      );
      for (const p of others) {
        await assignPayment(p.id, { projectId: body.projectId, invoiceId: null, by: caller.email });
      }
      alsoAssigned = others.length;
    }
    return NextResponse.json({ ok: true, alsoAssigned });
  } catch (err) {
    return paymentsErrorResponse(err, 'api/payments/[id] PATCH');
  }
}
