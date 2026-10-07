import 'server-only';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { listAllInvoices } from '@/modules/invoices/infrastructure/invoices.repository';
import type {
  IncomingPayment,
  PayerRule,
  PaymentInvoiceRef,
  PaymentProjectRef,
  PaymentStatus,
} from '@/modules/payments/domain/payments.types';

/**
 * `incoming_payments/{foldTransactionId}` and `payment_payers/{payerKey}`.
 * Both are server-only (absent from firestore.rules, so default deny).
 *
 * Queries avoid composite indexes on purpose: the collection grows by a few
 * dozen rows a month, so filtering and sorting happen in memory.
 */

function ensureAdmin() {
  if (!hasFirebaseAdminCredentials) {
    throw new Error('[payments] firebase-admin credentials are not configured');
  }
}

const paymentsCol = () => {
  ensureAdmin();
  return adminDb.collection(COLLECTIONS.INCOMING_PAYMENTS);
};
const payersCol = () => {
  ensureAdmin();
  return adminDb.collection(COLLECTIONS.PAYMENT_PAYERS);
};

function hydrate(id: string, d: Record<string, unknown>): IncomingPayment {
  return {
    id,
    accountId: String(d.accountId ?? ''),
    accountLabel: String(d.accountLabel ?? ''),
    date: String(d.date ?? ''),
    amount: Number(d.amount ?? 0),
    currency: String(d.currency ?? 'INR'),
    narration: String(d.narration ?? ''),
    merchantName: (d.merchantName as string | null) ?? null,
    payerKey: (d.payerKey as string | null) ?? null,
    payerName: String(d.payerName ?? ''),
    via: (d.via as IncomingPayment['via']) ?? null,
    channel: (d.channel as string | null) ?? null,
    foldCategory: (d.foldCategory as string | null) ?? null,
    status: ((d.status as PaymentStatus | undefined) ?? 'unassigned'),
    projectId: (d.projectId as string | null) ?? null,
    invoiceId: (d.invoiceId as string | null) ?? null,
    autoAssigned: Boolean(d.autoAssigned),
    suggestion: (d.suggestion as IncomingPayment['suggestion']) ?? null,
    assignedBy: (d.assignedBy as string | null) ?? null,
    assignedAt: (d.assignedAt as string | null) ?? null,
    firstSeenAt: String(d.firstSeenAt ?? ''),
    updatedAt: String(d.updatedAt ?? ''),
  };
}

const byDateDesc = (a: IncomingPayment, b: IncomingPayment) => b.date.localeCompare(a.date);

export async function listRecentPayments(limit = 500): Promise<IncomingPayment[]> {
  const snap = await paymentsCol().orderBy('date', 'desc').limit(limit).get();
  return snap.docs.map((d) => hydrate(d.id, d.data()));
}

export async function listPaymentsForProject(projectId: string): Promise<IncomingPayment[]> {
  const snap = await paymentsCol().where('projectId', '==', projectId).get();
  return snap.docs
    .map((d) => hydrate(d.id, d.data()))
    .filter((p) => p.status === 'assigned')
    .sort(byDateDesc);
}

export async function getPayment(id: string): Promise<IncomingPayment | null> {
  const snap = await paymentsCol().doc(id).get();
  return snap.exists ? hydrate(snap.id, snap.data() ?? {}) : null;
}

/** Ids of these Fold transactions already stored. */
export async function existingPaymentIds(ids: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const refs = ids.slice(i, i + 100).map((id) => paymentsCol().doc(id));
    if (!refs.length) continue;
    const snaps = await adminDb.getAll(...refs);
    for (const s of snaps) if (s.exists) found.add(s.id);
  }
  return found;
}

export async function hasAnyPayment(): Promise<boolean> {
  const snap = await paymentsCol().limit(1).get();
  return !snap.empty;
}

export async function createPayments(payments: IncomingPayment[]): Promise<void> {
  for (let i = 0; i < payments.length; i += 400) {
    const batch = adminDb.batch();
    for (const p of payments.slice(i, i + 400)) {
      const { id, ...rest } = p;
      batch.create(paymentsCol().doc(id), rest);
    }
    await batch.commit();
  }
}

export async function assignPayment(
  id: string,
  input: { projectId: string; invoiceId: string | null; by: string }
): Promise<void> {
  const now = new Date().toISOString();
  await paymentsCol().doc(id).update({
    status: 'assigned',
    projectId: input.projectId,
    invoiceId: input.invoiceId,
    autoAssigned: false,
    assignedBy: input.by,
    assignedAt: now,
    updatedAt: now,
  });
}

export async function setPaymentStatus(id: string, status: 'ignored' | 'unassigned', by: string): Promise<void> {
  const now = new Date().toISOString();
  await paymentsCol().doc(id).update({
    status,
    projectId: null,
    invoiceId: null,
    autoAssigned: false,
    assignedBy: status === 'ignored' ? by : null,
    assignedAt: status === 'ignored' ? now : null,
    updatedAt: now,
  });
}

export async function listPayerRules(): Promise<Map<string, PayerRule>> {
  const snap = await payersCol().get();
  return new Map(snap.docs.map((d) => [d.id, { payerKey: d.id, ...(d.data() as Omit<PayerRule, 'payerKey'>) }]));
}

export async function rememberPayer(rule: PayerRule): Promise<void> {
  const { payerKey, ...rest } = rule;
  await payersCol().doc(payerKey).set(rest);
}

export async function forgetPayer(payerKey: string): Promise<void> {
  await payersCol().doc(payerKey).delete();
}

/** id, name and client of every project. Lean read for matching and pickers. */
export async function listProjectRefs(): Promise<PaymentProjectRef[]> {
  ensureAdmin();
  const snap = await adminDb.collection(COLLECTIONS.PROJECTS).select('name', 'client').get();
  return snap.docs
    .map((d) => {
      const data = d.data() as { name?: string; client?: string };
      return { id: d.id, name: data.name ?? 'Untitled project', client: data.client?.trim() || null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listInvoiceRefs(): Promise<PaymentInvoiceRef[]> {
  const invoices = await listAllInvoices();
  return invoices.map((inv) => ({
    id: inv.id,
    projectId: inv.projectId,
    label: inv.label,
    invoiceNumber: inv.invoiceNumber,
    amount: inv.amount ?? inv.expectedAmount,
    currency: inv.currency ?? inv.expectedCurrency,
    status: inv.status,
    billedToName: inv.billedToName,
  }));
}
