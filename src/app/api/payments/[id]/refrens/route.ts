import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import {
  RefrensApiError,
  RefrensNotConfiguredError,
  getInvoice,
  getRefrensUrlKey,
  listInvoicePayments,
  recordInvoicePayment,
  type RefrensInvoicePayment,
} from '@/services/RefrensService';
import {
  findInvoiceByRefrensId,
  getInvoiceById,
  upsertInvoiceFromRefrens,
} from '@/modules/invoices/infrastructure/invoices.repository';
import {
  REFRENS_PAYMENT_METHODS,
  draftRefrensPayment,
  outstandingOn,
  type RefrensPaymentMethod,
} from '@/modules/payments/domain/payments.refrens';
import {
  claimRefrensRecording,
  findPaymentByRefrensPaymentId,
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
 * The invoice is either a linked slot (`invoiceId`, a project_invoices id) or
 * picked straight from Refrens (`refrensInvoiceId`, from /candidates). A
 * Refrens invoice not linked yet is linked to the payment's project on POST.
 *
 * GET  ?invoiceId= | ?refrensInvoiceId=  → what is due in Refrens and a prefilled draft.
 * POST { invoiceId | refrensInvoiceId, amount, tds, transactionCharge, paymentMethod, paymentDate?, notes?, refId? }
 *      → posts the payment to Refrens, re-syncs the invoice mirror, ties the
 *        credit to that project and invoice. Refuses a second recording.
 * POST { invoiceId | refrensInvoiceId, linkOnly: true }
 *      → the invoice is already PAID in Refrens (entered by hand): tie the
 *        credit to it and to the matching Refrens payment. Posts nothing.
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

/** The invoice being paid: a linked slot (`id` set) or a Refrens invoice not linked yet (`id` null). */
interface InvoiceTarget {
  id: string | null;
  projectId: string;
  refrensInvoiceId: string;
  refrensUrlKey: string;
  invoiceNumber: string | null;
  label: string | null;
  currency: string | null;
  amount: number | null;
  status: string;
}

const fail = (error: string, status: number) => ({ error: NextResponse.json({ error }, { status }) }) as const;

async function loadContext(paymentId: string, ids: { invoiceId: string | null; refrensInvoiceId: string | null }) {
  const payment = await getPayment(paymentId);
  if (!payment) return fail('Payment not found', 404);

  if (ids.invoiceId) {
    const invoice = await getInvoiceById(ids.invoiceId);
    if (!invoice) return fail('Invoice not found', 404);
    if (!invoice.refrensInvoiceId || !invoice.refrensUrlKey) return fail('This invoice slot has no Refrens invoice mapped yet', 400);
    if (payment.projectId && payment.projectId !== invoice.projectId) return fail('That invoice belongs to a different project', 400);
    const target: InvoiceTarget = { ...invoice, refrensInvoiceId: invoice.refrensInvoiceId, refrensUrlKey: invoice.refrensUrlKey };
    return { payment, invoice: target } as const;
  }

  if (ids.refrensInvoiceId) {
    if (!payment.projectId) return fail('Assign the payment to a project first', 400);
    if (!/^[a-f0-9]{24}$/i.test(ids.refrensInvoiceId)) return fail('Not a Refrens invoice id', 400);
    const mirror = await findInvoiceByRefrensId(ids.refrensInvoiceId);
    if (mirror && mirror.projectId !== payment.projectId) return fail('That Refrens invoice is linked to a different project', 400);
    if (mirror?.refrensUrlKey) {
      return { payment, invoice: { ...mirror, refrensInvoiceId: ids.refrensInvoiceId, refrensUrlKey: mirror.refrensUrlKey } } as const;
    }
    const urlKey = await getRefrensUrlKey();
    if (!urlKey) return fail('Refrens is not connected', 409);
    const target: InvoiceTarget = {
      id: null,
      projectId: payment.projectId,
      refrensInvoiceId: ids.refrensInvoiceId,
      refrensUrlKey: urlKey,
      invoiceNumber: null,
      label: null,
      currency: null,
      amount: null,
      status: 'UNKNOWN',
    };
    return { payment, invoice: target } as const;
  }

  return fail('invoiceId or refrensInvoiceId is required', 400);
}

/** True when an existing Refrens payment is this same bank credit. */
function isSameCredit(p: RefrensInvoicePayment, payment: IncomingPayment, refId: string): boolean {
  return p.refId === refId || p.refId === payment.id || Boolean(p.notes?.includes(payment.id));
}

async function dueOn(invoice: InvoiceTarget) {
  const [fresh, existing] = await Promise.all([
    getInvoice(invoice.refrensInvoiceId),
    listInvoicePayments(invoice.refrensInvoiceId),
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
    const loaded = await loadContext(id, {
      invoiceId: req.nextUrl.searchParams.get('invoiceId'),
      refrensInvoiceId: req.nextUrl.searchParams.get('refrensInvoiceId'),
    });
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
        invoiceNumber: invoice.invoiceNumber ?? (due.fresh.invoiceNumber != null ? String(due.fresh.invoiceNumber) : null),
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
  refrensInvoiceId?: string;
  linkOnly?: boolean;
  amount?: unknown;
  tds?: unknown;
  transactionCharge?: unknown;
  paymentMethod?: unknown;
  paymentDate?: unknown;
  notes?: unknown;
  refId?: unknown;
}

/**
 * The Refrens payment on a paid invoice that this bank credit is: same amount,
 * or the credit plus TDS, else the latest one.
 */
function matchingRefrensPayment(credit: number, payments: RefrensInvoicePayment[]): RefrensInvoicePayment | null {
  const near = (a: number) => Math.abs(a - credit) <= 1;
  return (
    payments.find((p) => near(p.amount)) ??
    payments.find((p) => near(p.amount - (p.tds ?? 0) - (p.transactionCharge ?? 0))) ??
    payments.find((p) => p.amount > 0 && credit / p.amount >= 0.89 && credit / p.amount <= 1) ??
    [...payments].sort((a, b) => (b.paymentDate ?? '').localeCompare(a.paymentDate ?? ''))[0] ??
    null
  );
}

const num = (v: unknown, fallback = 0) => (v === undefined || v === null || v === '' ? fallback : Number(v));

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let claimedId: string | null = null;
  try {
    const caller = await requireAdmin(req);
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as PostBody;
    if (body.linkOnly === true) return linkToPaidInvoice(id, body, caller.email);

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

    const loaded = await loadContext(id, { invoiceId: body.invoiceId ?? null, refrensInvoiceId: body.refrensInvoiceId ?? null });
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

    // Picked straight from Refrens: link it to the project now, so it shows on
    // the Invoices tab and the credit can point at it.
    let invoiceId = invoice.id;
    if (!invoiceId) {
      const linked = await upsertInvoiceFromRefrens(invoice.projectId, { ...due.fresh, urlKey: invoice.refrensUrlKey });
      invoiceId = linked.invoice.id;
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
        invoiceId,
      });
      claimedId = null;
      return NextResponse.json({ ok: true, duplicate: true, invoiceStatus: due.status });
    }

    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 500) : draft.notes;
    const paymentDate =
      typeof body.paymentDate === 'string' && !Number.isNaN(new Date(body.paymentDate).getTime())
        ? new Date(body.paymentDate).toISOString()
        : new Date(payment.date).toISOString();

    const created = await recordInvoicePayment(invoice.refrensInvoiceId, {
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
      invoiceId,
    });
    claimedId = null;

    // Pull the invoice back so its status (PAID once covered) shows everywhere.
    let invoiceStatus = due.status;
    try {
      const fresh = await getInvoice(invoice.refrensInvoiceId);
      const synced = await upsertInvoiceFromRefrens(invoice.projectId, { ...fresh, urlKey: invoice.refrensUrlKey });
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

/** POST { linkOnly: true }: tie the credit to an invoice already paid in Refrens. Nothing is posted. */
async function linkToPaidInvoice(id: string, body: PostBody, by: string): Promise<NextResponse> {
  let claimed = false;
  try {
    const loaded = await loadContext(id, { invoiceId: body.invoiceId ?? null, refrensInvoiceId: body.refrensInvoiceId ?? null });
    if ('error' in loaded) return loaded.error;
    const { payment, invoice } = loaded;

    const claim = await claimRefrensRecording(id);
    if (claim === 'recorded') return NextResponse.json({ error: 'Already linked to Refrens' }, { status: 409 });
    if (claim === 'busy') return NextResponse.json({ error: 'Someone is recording this right now' }, { status: 409 });
    if (claim === 'missing') return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    claimed = true;

    const due = await dueOn(invoice);
    if (due.status !== 'PAID') {
      await releaseRefrensRecording(id);
      claimed = false;
      return NextResponse.json({ error: 'That invoice is not paid in Refrens yet; record the payment instead' }, { status: 409 });
    }
    const match = matchingRefrensPayment(payment.amount, due.existing);
    const refrensPaymentId = match?._id ?? `invoice:${invoice.refrensInvoiceId}`;
    const other = await findPaymentByRefrensPaymentId(refrensPaymentId);
    if (other && other.id !== id) {
      await releaseRefrensRecording(id);
      claimed = false;
      return NextResponse.json(
        { error: `Another bank credit (${other.payerName}, ${other.date.slice(0, 10)}) is already linked to that Refrens payment` },
        { status: 409 }
      );
    }

    const linked = invoice.id
      ? { id: invoice.id }
      : (await upsertInvoiceFromRefrens(invoice.projectId, { ...due.fresh, urlKey: invoice.refrensUrlKey })).invoice;
    await finishRefrensRecording(id, { refrensPaymentId, by, projectId: invoice.projectId, invoiceId: linked.id });
    claimed = false;
    return NextResponse.json({ ok: true, linked: true, invoiceStatus: 'PAID' });
  } catch (err) {
    if (claimed) await releaseRefrensRecording(id).catch(() => undefined);
    return refrensError(err) ?? paymentsErrorResponse(err, 'api/payments/[id]/refrens POST linkOnly');
  }
}
