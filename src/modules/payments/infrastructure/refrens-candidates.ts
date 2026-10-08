import 'server-only';
import { listAllInvoicesCached, listOpenInvoices, type RefrensInvoiceSummary } from '@/services/RefrensService';
import { listAllInvoices } from '@/modules/invoices/infrastructure/invoices.repository';
import { VIA_LABELS } from '@/modules/payments/domain/payments.matching';
import {
  outstandingOn,
  rankRefrensInvoices,
  type RankedRefrensInvoice,
  type RefrensOpenInvoice,
} from '@/modules/payments/domain/payments.refrens';
import type { IncomingPayment } from '@/modules/payments/domain/payments.types';
import { listProjectRefs } from './payments.repository';

/**
 * Refrens invoices a bank credit could belong to, for the Mark paid dialog.
 *
 * Unpaid invoices come straight from Refrens, so a project with nothing linked
 * on its Invoices tab still works. Invoices linked to another project are left
 * out. Invoices already PAID in Refrens (usually entered by hand) are added
 * only when they match on both name and amount, flagged `alreadyPaid`, so the
 * credit can be linked to them without a second payment being posted.
 */

type RefrensPaymentRow = { amount: number; tds?: number; transactionCharge?: number; isRemoved?: boolean; paymentDate?: string };

export type RefrensCandidate = RankedRefrensInvoice & { linkedInvoiceId: string | null };

const PAID_LOOKBACK_DAYS = 365;
/** A paid invoice only counts if Refrens shows it paid within this many days of the bank credit. */
const PAID_NEAR_DAYS = 21;
/** A paid invoice (already near the bank date) is shown when it has at least a name or amount signal. */
const PAID_MIN_SCORE = 2;

export async function findRefrensCandidates(payment: IncomingPayment & { projectId: string }): Promise<RefrensCandidate[]> {
    const [open, all, mirrors, projects] = await Promise.all([
      listOpenInvoices(),
      listAllInvoicesCached(),
      listAllInvoices(),
      listProjectRefs(),
    ]);
    const project = projects.find((p) => p.id === payment.projectId) ?? { name: '', client: null };
    const mirrorByRefrensId = new Map(mirrors.filter((m) => m.refrensInvoiceId).map((m) => [m.refrensInvoiceId as string, m]));

    const toCandidate = (raw: RefrensInvoiceSummary, alreadyPaid: boolean) => {
      const mirror = mirrorByRefrensId.get(raw._id);
      if (mirror && mirror.projectId !== payment.projectId) return null;
      const payments = ((raw as { payments?: RefrensPaymentRow[] }).payments ?? []).filter((p) => !p.isRemoved);
      const settled = payments.reduce((s, p) => s + p.amount + (p.tds ?? 0) + (p.transactionCharge ?? 0), 0);
      const total = raw.finalTotal?.total || raw.finalTotal?.amount || settled;
      const paidOn = payments.map((p) => p.paymentDate ?? '').sort().pop() || null;
      return {
        refrensInvoiceId: raw._id,
        invoiceNumber: raw.invoiceNumber != null ? String(raw.invoiceNumber) : null,
        invoiceDate: raw.invoiceDate ?? null,
        currency: (raw.currency ?? 'INR').toUpperCase(),
        total,
        due: alreadyPaid ? settled || total : outstandingOn(total, payments),
        dueInr: alreadyPaid ? (raw.BusinessCurrency?.total ?? null) : (raw.BusinessCurrency?.due ?? null),
        billedToName: raw.billedTo?.name ?? null,
        linkedInvoiceId: mirror?.id ?? null,
        alreadyPaid,
        paidOn,
      };
    };

    const invoices: Array<RefrensOpenInvoice & { linkedInvoiceId: string | null }> = [];
    for (const raw of open) {
      const c = toCandidate(raw, false);
      if (c) invoices.push(c);
    }
    const since = new Date(Date.now() - PAID_LOOKBACK_DAYS * 864e5).toISOString();
    const paid: Array<RefrensOpenInvoice & { linkedInvoiceId: string | null }> = [];
    for (const raw of all.items) {
      if ((raw.status ?? '').toUpperCase() !== 'PAID' || (raw.invoiceDate ?? '') < since) continue;
      const c = toCandidate(raw, true);
      if (!c?.paidOn) continue;
      const gapDays = Math.abs(new Date(c.paidOn).getTime() - new Date(payment.date).getTime()) / 864e5;
      if (gapDays <= PAID_NEAR_DAYS) paid.push(c);
    }

    const credit = { amount: payment.amount, currency: payment.currency, payerName: payment.payerName, via: payment.via ? VIA_LABELS[payment.via] : null };
    const strongPaid = rankRefrensInvoices(credit, project, paid).filter((r) => r.score >= PAID_MIN_SCORE);
    const ranked = rankRefrensInvoices(credit, project, [...strongPaid, ...invoices]);
    const linked = new Map([...invoices, ...paid].map((i) => [i.refrensInvoiceId, i.linkedInvoiceId]));
    return ranked.map((r) => ({ ...r, linkedInvoiceId: linked.get(r.refrensInvoiceId) ?? null }));
}
