import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import {
  RefrensApiError,
  RefrensNotConfiguredError,
  getInvoice,
  listInvoicePayments,
  recordInvoicePayment,
  type RefrensInvoicePayment,
} from '@/services/RefrensService';
import {
  getInvoiceById,
  upsertInvoiceFromRefrens,
} from '@/modules/invoices/infrastructure/invoices.repository';
import type { ProjectInvoice } from '@/modules/invoices/domain/types';
import {
  REFRENS_PAYMENT_METHODS,
  draftRefrensPayment,
  outstandingOn,
  type RefrensPaymentMethod,
} from '@/modules/payments/domain/payments.refrens';
import {
  claimRefrensRecording,
  finishRefrensRecording,
  getPayment,
  releaseRefrensRecording,
} from '@/modules/payments/infrastructure/payments.repository';
import { paymentsErrorResponse } from '@/modules/payments/infrastructure/route-errors';
import type { IncomingPayment } from '@/modules/payments/domain/payments.types';
import { VIA_LABELS } from '@/modules/payments/domain/payments.matching';

/** The payment as the draft wants it: the payout service by its display name. */
const forDraft = (p: IncomingPayment) => ({ ...p, via: p.via ? VIA_LABELS[p.via] : null });

export const runtime = 'nodejs';

/**
 * Record a bank credit as a payment on its Refrens invoice ("Mark paid").
 *
 * GET  ?invoiceId=  → what is due on the invoice in Refrens and a prefilled draft.
 * POST { invoiceId, amount, tds, transactionCharge, paymentMethod, paymentDate?, notes?, refId? }
 *      → posts the payment to Refrens, re-syncs the invoice mirror, ties the
 *        credit to that project and invoice. Refuses a second recording.
 */

function refrensError(err: unknown): NextResponse | null {
  if (err instanceof RefrensNotConfiguredError) {
    return NextResponse.json({ error: 'Refrens is not connected' }, { status: 409 });
  }
  if (err instanceof RefrensApiError) {
    return NextResponse.json({ error: `Refrens: ${err.message}` }, { status: 502 });
  }
  return null;
}

async function loadContext(paymentId: string, invoiceId: string | null) {
  const payment = await getPayment(paymentId);
  if (!payment) return { error: NextResponse.json({ error: 'Payment not found' }, { status: 404 }) } as const;
  if (!invoiceId) return { error: NextResponse.json({ error: 'invoiceId is required' }, { status: 400 }) } as const;
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) return { error: NextResponse.json({ error: 'Invoice not found' }, { status: 404 }) } as const;
  if (!invoice.refrensInvoiceId || !invoice.refrensUrlKey) {
    return { error: NextResponse.json({ error: 'This invoice slot has no Refrens invoice mapped yet' }, { status: 400 }) } as const;
  }
  if (payment.projectId && payment.projectId !== invoice.projectId) {
    return { error: NextResponse.json({ error: 'That invoice belongs to a different project' }, { status: 400 }) } as const;
  }
  return { payment, invoice } as const;
}

/** True when an existing Refrens payment is this same bank credit. */
function isSameCredit(p: RefrensInvoicePayment, payment: IncomingPayment, refId: string): boolean {
  return p.refId === refId || p.refId === payment.id || Boolean(p.notes?.includes(payment.id));
}

async function dueOn(invoice: ProjectInvoice) {
  const [fresh, existing] = await Promise.all([
    getInvoice(invoice.refrensInvoiceId as string),
    listInvoicePayments(invoice.refrensInvoiceId as string),
  ]);
  const total = fresh.finalTotal?.total ?? fresh.finalTotal?.amount ?? invoice.amount ?? 0;
  return {
    fresh,
    existing,
    total,
    currency: fresh.currency ?? invoice.currency ?? 'INR',
    status: (fresh.status ?? invoice.status ?? '').toUpperCase(),
    outstanding: outstandingOn(total, existing),
  };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(req);
    const { id } = await ctx.params;
    const loaded = await loadContext(id, req.nextUrl.searchParams.get('invoiceId'));
    if ('error' in loaded) return loaded.error;
    const { payment, invoice } = loaded;
    const due = await dueOn(invoice);
    const draft = draftRefrensPayment({
      payment: forDraft(payment),
      invoice: { currency: due.currency, outstanding: due.outstanding, invoiceNumber: invoice.invoiceNumber },
    });
    return NextResponse.json({
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        label: invoice.label,
        currency: due.currency,
        total: due.total,
        status: due.status,
      },
      outstanding: due.outstanding,
      paymentsOnInvoice: due.existing.length,
      alreadyRecorded: Boolean(payment.refrensPaymentId) || due.existing.some((p) => isSameCredit(p, payment, draft.refId)),
      draft: { ...draft, paymentDate: payment.date },
    });
  } catch (err) {
    return refrensError(err) ?? paymentsErrorResponse(err, 'api/payments/[id]/refrens GET');
  }
}

interface PostBody {
  invoiceId?: string;
  amount?: unknown;
  tds?: unknown;
  transactionCharge?: unknown;
  paymentMethod?: unknown;
  paymentDate?: unknown;
  notes?: unknown;
  refId?: unknown;
}

const num = (v: unknown, fallback = 0) => (v === undefined || v === null || v === '' ? fallback : Number(v));

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let claimedId: string | null = null;
  try {
    const caller = await requireAdmin(req);
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as PostBody;

    const amount = num(body.amount, NaN);
    const tds = num(body.tds);
    const transactionCharge = num(body.transactionCharge);
    const paymentMethod = String(body.paymentMethod ?? '') as RefrensPaymentMethod;
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'amount must be more than 0' }, { status: 400 });
    if (!Number.isFinite(tds) || tds < 0 || !Number.isFinite(transactionCharge) || transactionCharge < 0) {
      return NextResponse.json({ error: 'TDS and charges must be 0 or more' }, { status: 400 });
    }
    if (!REFRENS_PAYMENT_METHODS.includes(paymentMethod)) {
      return NextResponse.json({ error: 'Unknown payment method' }, { status: 400 });
    }

    const loaded = await loadContext(id, body.invoiceId ?? null);
    if ('error' in loaded) return loaded.error;
    const { payment, invoice } = loaded;

    const claim = await claimRefrensRecording(id);
    if (claim === 'recorded') return NextResponse.json({ error: 'Already recorded in Refrens' }, { status: 409 });
    if (claim === 'busy') return NextResponse.json({ error: 'Someone is recording this right now' }, { status: 409 });
    if (claim === 'missing') return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    claimedId = id;

    const due = await dueOn(invoice);
    if (due.status === 'PAID' || due.status === 'CANCELED' || due.status === 'CANCELLED') {
      await releaseRefrensRecording(id);
      claimedId = null;
      return NextResponse.json({ error: `The invoice is already ${due.status.toLowerCase()} in Refrens` }, { status: 409 });
    }

    const draft = draftRefrensPayment({
      payment: forDraft(payment),
      invoice: { currency: due.currency, outstanding: due.outstanding, invoiceNumber: invoice.invoiceNumber },
    });
    const refId = typeof body.refId === 'string' && body.refId.trim() ? body.refId.trim().slice(0, 100) : draft.refId;
    const duplicate = due.existing.find((p) => isSameCredit(p, payment, refId));
    if (duplicate) {
      // Recorded earlier (e.g. by hand in Refrens): remember it, post nothing.
      await finishRefrensRecording(id, {
        refrensPaymentId: duplicate._id ?? 'existing',
        by: caller.email,
        projectId: invoice.projectId,
        invoiceId: invoice.id,
      });
      claimedId = null;
      return NextResponse.json({ ok: true, duplicate: true, invoiceStatus: due.status });
    }

    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 500) : draft.notes;
    const paymentDate =
      typeof body.paymentDate === 'string' && !Number.isNaN(new Date(body.paymentDate).getTime())
        ? new Date(body.paymentDate).toISOString()
        : new Date(payment.date).toISOString();

    const created = await recordInvoicePayment(invoice.refrensInvoiceId as string, {
      amount,
      tds,
      transactionCharge,
      paymentMethod,
      paymentDate,
      notes: notes.includes(payment.id) ? notes : `${notes} (Fold ${payment.id})`,
      refId,
    });

    await finishRefrensRecording(id, {
      refrensPaymentId: created._id ?? 'recorded',
      by: caller.email,
      projectId: invoice.projectId,
      invoiceId: invoice.id,
    });
    claimedId = null;

    // Pull the invoice back so its status (PAID once covered) shows everywhere.
    let invoiceStatus = due.status;
    try {
      const fresh = await getInvoice(invoice.refrensInvoiceId as string);
      const synced = await upsertInvoiceFromRefrens(invoice.projectId, { ...fresh, urlKey: invoice.refrensUrlKey as string });
      invoiceStatus = synced.invoice.status;
    } catch (err) {
      console.error('[api/payments/[id]/refrens] recorded, but re-sync failed:', err);
    }

    return NextResponse.json({ ok: true, invoiceStatus, refrensPaymentId: created._id ?? null });
  } catch (err) {
    if (claimedId) await releaseRefrensRecording(claimedId).catch(() => undefined);
    return refrensError(err) ?? paymentsErrorResponse(err, 'api/payments/[id]/refrens POST');
  }
}
