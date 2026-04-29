import 'server-only';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import type {
  CreateSlotInput,
  InvoiceStatus,
  ProjectInvoice,
  UpdateSlotInput,
} from '@/modules/invoices/domain/types';
import type { RefrensInvoiceSummary } from '@/services/RefrensService';

function invoicesCollection() {
  if (!hasFirebaseAdminCredentials) {
    throw new Error(
      '[invoicesRepository] firebase-admin credentials are not configured; cannot access project_invoices'
    );
  }
  return adminDb.collection(COLLECTIONS.PROJECT_INVOICES);
}

function isOverdueDate(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < Date.now();
}

/**
 * Refrens reports UNPAID/PAID/CANCELED. We compute OVERDUE locally based on
 * dueDate. PENDING is reserved for empty slots (no Refrens invoice mapped).
 */
function normalizeStatus(
  raw: string | undefined | null,
  dueDate: string | null | undefined
): InvoiceStatus {
  if (!raw) return 'UNKNOWN';
  const upper = raw.toUpperCase();
  if (upper === 'PAID') return 'PAID';
  if (upper === 'CANCELED' || upper === 'CANCELLED') return 'CANCELED';
  if (upper === 'UNPAID') return isOverdueDate(dueDate) ? 'OVERDUE' : 'UNPAID';
  return 'UNKNOWN';
}

function pickAmount(raw: RefrensInvoiceSummary): number | null {
  const total = raw.finalTotal;
  if (!total) return null;
  return total.total ?? total.amount ?? total.subTotal ?? null;
}

/**
 * Hydrates a stored doc into a `ProjectInvoice`, supplying defaults for
 * fields older rows may not carry (label, order, slot metadata, etc.).
 */
function hydrate(id: string, data: Record<string, unknown>): ProjectInvoice {
  return {
    id,
    projectId: String(data.projectId ?? ''),
    label: (data.label as string | null) ?? null,
    expectedAmount: (data.expectedAmount as number | null) ?? null,
    expectedCurrency: (data.expectedCurrency as string | null) ?? null,
    expectedDueDate: (data.expectedDueDate as string | null) ?? null,
    notes: (data.notes as string | null) ?? null,
    order: typeof data.order === 'number' ? data.order : 0,
    refrensInvoiceId: (data.refrensInvoiceId as string | null) ?? null,
    refrensUrlKey: (data.refrensUrlKey as string | null) ?? null,
    invoiceNumber: (data.invoiceNumber as string | null) ?? null,
    status: ((data.status as InvoiceStatus | undefined) ?? 'PENDING'),
    lastKnownStatus: ((data.lastKnownStatus as InvoiceStatus | undefined) ?? 'PENDING'),
    amount: (data.amount as number | null) ?? null,
    currency: (data.currency as string | null) ?? null,
    invoiceDate: (data.invoiceDate as string | null) ?? null,
    dueDate: (data.dueDate as string | null) ?? null,
    shareLink: (data.shareLink as string | null) ?? null,
    pdfLink: (data.pdfLink as string | null) ?? null,
    billedToName: (data.billedToName as string | null) ?? null,
    billedToEmail: (data.billedToEmail as string | null) ?? null,
    emailNotifyEnabled: Boolean(data.emailNotifyEnabled),
    lastSyncedAt: (data.lastSyncedAt as string | null) ?? null,
    createdAt: (data.createdAt as string) || new Date().toISOString(),
    updatedAt: (data.updatedAt as string) || new Date().toISOString(),
  };
}

function refrensFields(
  raw: RefrensInvoiceSummary & { urlKey: string }
): Pick<
  ProjectInvoice,
  | 'refrensInvoiceId'
  | 'refrensUrlKey'
  | 'invoiceNumber'
  | 'status'
  | 'amount'
  | 'currency'
  | 'invoiceDate'
  | 'dueDate'
  | 'shareLink'
  | 'pdfLink'
  | 'billedToName'
  | 'billedToEmail'
> {
  const dueDate = raw.dueDate ?? null;
  return {
    refrensInvoiceId: raw._id,
    refrensUrlKey: raw.urlKey,
    invoiceNumber: raw.invoiceNumber != null ? String(raw.invoiceNumber) : null,
    status: normalizeStatus(raw.status, dueDate),
    amount: pickAmount(raw),
    currency: raw.currency ?? null,
    invoiceDate: raw.invoiceDate ?? null,
    dueDate,
    shareLink: raw.share?.link ?? null,
    pdfLink: raw.share?.pdf ?? null,
    billedToName: raw.billedTo?.name ?? null,
    billedToEmail: raw.billedTo?.email ?? null,
  };
}

export interface SyncResult {
  invoice: ProjectInvoice;
  statusChanged: boolean;
  oldStatus: InvoiceStatus;
  newStatus: InvoiceStatus;
}

/**
 * Creates an empty slot — planning-only, no Refrens invoice attached yet.
 * The new row appears in the project's invoice list with status `PENDING`.
 */
export async function createSlot(
  projectId: string,
  input: CreateSlotInput
): Promise<ProjectInvoice> {
  const now = new Date().toISOString();
  const col = invoicesCollection();

  // Order = max(existing) + 1 so new slots append by default
  const existing = await col.where('projectId', '==', projectId).get();
  const maxOrder = existing.docs.reduce((m, d) => {
    const v = (d.data() as { order?: number }).order;
    return typeof v === 'number' && v > m ? v : m;
  }, -1);

  const doc = {
    projectId,
    label: input.label,
    expectedAmount: input.expectedAmount ?? null,
    expectedCurrency: input.expectedCurrency ?? null,
    expectedDueDate: input.expectedDueDate ?? null,
    notes: input.notes ?? null,
    order: maxOrder + 1,
    refrensInvoiceId: null,
    refrensUrlKey: null,
    invoiceNumber: null,
    status: 'PENDING' as InvoiceStatus,
    lastKnownStatus: 'PENDING' as InvoiceStatus,
    amount: null,
    currency: null,
    invoiceDate: null,
    dueDate: null,
    shareLink: null,
    pdfLink: null,
    billedToName: null,
    billedToEmail: null,
    emailNotifyEnabled: false,
    lastSyncedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await col.add(doc);
  return hydrate(ref.id, doc);
}

/**
 * Creates many slots at once on a project. Computes the next `order` value
 * once (cheaper than re-querying for each slot) and assigns sequential
 * orders to the new rows. Returns the created `ProjectInvoice`s in input
 * order.
 */
export async function createSlotsBatch(
  projectId: string,
  inputs: CreateSlotInput[]
): Promise<ProjectInvoice[]> {
  if (inputs.length === 0) return [];
  const col = invoicesCollection();
  const existing = await col.where('projectId', '==', projectId).get();
  const baseOrder = existing.docs.reduce((m, d) => {
    const v = (d.data() as { order?: number }).order;
    return typeof v === 'number' && v > m ? v : m;
  }, -1);

  const now = new Date().toISOString();
  const docs = inputs.map((input, i) => ({
    projectId,
    label: input.label,
    expectedAmount: input.expectedAmount ?? null,
    expectedCurrency: input.expectedCurrency ?? null,
    expectedDueDate: input.expectedDueDate ?? null,
    notes: input.notes ?? null,
    order: baseOrder + 1 + i,
    refrensInvoiceId: null,
    refrensUrlKey: null,
    invoiceNumber: null,
    status: 'PENDING' as InvoiceStatus,
    lastKnownStatus: 'PENDING' as InvoiceStatus,
    amount: null,
    currency: null,
    invoiceDate: null,
    dueDate: null,
    shareLink: null,
    pdfLink: null,
    billedToName: null,
    billedToEmail: null,
    emailNotifyEnabled: false,
    lastSyncedAt: null,
    createdAt: now,
    updatedAt: now,
  }));

  // Fire all adds in parallel — Firestore handles the writes.
  const refs = await Promise.all(docs.map((doc) => col.add(doc)));
  return refs.map((ref, i) => hydrate(ref.id, docs[i]));
}

export async function updateSlotFields(id: string, patch: UpdateSlotInput): Promise<void> {
  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if ('label' in patch && typeof patch.label === 'string') update.label = patch.label;
  if ('expectedAmount' in patch) update.expectedAmount = patch.expectedAmount ?? null;
  if ('expectedCurrency' in patch) update.expectedCurrency = patch.expectedCurrency ?? null;
  if ('expectedDueDate' in patch) update.expectedDueDate = patch.expectedDueDate ?? null;
  if ('notes' in patch) update.notes = patch.notes ?? null;
  await invoicesCollection().doc(id).set(update, { merge: true });
}

export async function deleteSlot(id: string): Promise<void> {
  await invoicesCollection().doc(id).delete();
}

/** Clears Refrens fields on a slot, returning it to `PENDING`. */
export async function unmapSlot(id: string): Promise<ProjectInvoice | null> {
  const ref = invoicesCollection().doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const now = new Date().toISOString();
  await ref.set(
    {
      refrensInvoiceId: null,
      refrensUrlKey: null,
      invoiceNumber: null,
      status: 'PENDING' as InvoiceStatus,
      lastKnownStatus: 'PENDING' as InvoiceStatus,
      amount: null,
      currency: null,
      invoiceDate: null,
      dueDate: null,
      shareLink: null,
      pdfLink: null,
      billedToName: null,
      billedToEmail: null,
      lastSyncedAt: now,
      updatedAt: now,
    },
    { merge: true }
  );
  const after = await ref.get();
  return hydrate(after.id, after.data() ?? {});
}

/**
 * Maps a Refrens invoice into an existing slot. The slot's planning fields
 * (label / expected amounts / due / notes / order) are preserved.
 */
export async function fillSlotWithRefrens(
  slotId: string,
  raw: RefrensInvoiceSummary & { urlKey: string }
): Promise<SyncResult> {
  const ref = invoicesCollection().doc(slotId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error(`Slot ${slotId} not found`);
  }
  const prev = hydrate(snap.id, snap.data() ?? {});
  const refrens = refrensFields(raw);
  const now = new Date().toISOString();
  const merged: Omit<ProjectInvoice, 'id'> = {
    ...prev,
    ...refrens,
    lastKnownStatus: prev.status,
    lastSyncedAt: now,
    updatedAt: now,
  };
  // Don't write `id` back into the doc body
  const { ...body } = merged;
  await ref.set(body, { merge: true });
  return {
    invoice: { id: slotId, ...merged },
    statusChanged: prev.status !== merged.status,
    oldStatus: prev.status,
    newStatus: merged.status,
  };
}

/**
 * Map without a target slot — creates an ad-hoc row backed by the Refrens
 * invoice. Idempotent on `(projectId, refrensInvoiceId)` so calling map on
 * the same invoice twice doesn't duplicate.
 */
export async function upsertInvoiceFromRefrens(
  projectId: string,
  raw: RefrensInvoiceSummary & { urlKey: string }
): Promise<SyncResult> {
  const col = invoicesCollection();
  const existing = await col
    .where('projectId', '==', projectId)
    .where('refrensInvoiceId', '==', raw._id)
    .limit(1)
    .get();

  const refrens = refrensFields(raw);
  const now = new Date().toISOString();

  if (!existing.empty) {
    const docRef = existing.docs[0].ref;
    const prev = hydrate(existing.docs[0].id, existing.docs[0].data());
    const merged: Omit<ProjectInvoice, 'id'> = {
      ...prev,
      ...refrens,
      // preserve user-owned fields
      emailNotifyEnabled: prev.emailNotifyEnabled,
      label: prev.label,
      expectedAmount: prev.expectedAmount,
      expectedCurrency: prev.expectedCurrency,
      expectedDueDate: prev.expectedDueDate,
      notes: prev.notes,
      order: prev.order,
      lastKnownStatus: prev.status,
      lastSyncedAt: now,
      updatedAt: now,
      createdAt: prev.createdAt,
    };
    await docRef.set(merged, { merge: true });
    return {
      invoice: { id: docRef.id, ...merged },
      statusChanged: prev.status !== merged.status,
      oldStatus: prev.status,
      newStatus: merged.status,
    };
  }

  // New ad-hoc row
  const doc = {
    projectId,
    label: null,
    expectedAmount: null,
    expectedCurrency: null,
    expectedDueDate: null,
    notes: null,
    order: 0,
    ...refrens,
    lastKnownStatus: refrens.status,
    emailNotifyEnabled: false,
    lastSyncedAt: now,
    createdAt: raw.createdAt ?? now,
    updatedAt: now,
  };
  const ref = await col.add(doc);
  const invoice = hydrate(ref.id, doc);
  return {
    invoice,
    statusChanged: false,
    oldStatus: invoice.status,
    newStatus: invoice.status,
  };
}

export async function listInvoicesForProject(projectId: string): Promise<ProjectInvoice[]> {
  const snap = await invoicesCollection().where('projectId', '==', projectId).get();
  const items = snap.docs.map((doc) => hydrate(doc.id, doc.data()));
  // Sort: by order asc, then invoiceDate desc, then createdAt desc
  return items.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    const aKey = a.invoiceDate ?? a.createdAt;
    const bKey = b.invoiceDate ?? b.createdAt;
    return bKey.localeCompare(aKey);
  });
}

export async function listAllInvoices(): Promise<ProjectInvoice[]> {
  const snap = await invoicesCollection().get();
  return snap.docs.map((doc) => hydrate(doc.id, doc.data()));
}

export async function getInvoiceById(id: string): Promise<ProjectInvoice | null> {
  const snap = await invoicesCollection().doc(id).get();
  if (!snap.exists) return null;
  return hydrate(snap.id, snap.data() ?? {});
}

export async function findInvoiceByRefrensId(
  refrensInvoiceId: string
): Promise<ProjectInvoice | null> {
  const snap = await invoicesCollection()
    .where('refrensInvoiceId', '==', refrensInvoiceId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return hydrate(doc.id, doc.data());
}

export async function setInvoiceNotifyEnabled(id: string, enabled: boolean): Promise<void> {
  await invoicesCollection().doc(id).set(
    { emailNotifyEnabled: enabled, updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

/**
 * Recomputes status purely from the existing dueDate (no Refrens call). PAID,
 * CANCELED, and PENDING are terminal here — only UNPAID/OVERDUE flip.
 */
export async function recomputeOverdueStatus(invoice: ProjectInvoice): Promise<SyncResult> {
  if (invoice.status !== 'UNPAID' && invoice.status !== 'OVERDUE') {
    return { invoice, statusChanged: false, oldStatus: invoice.status, newStatus: invoice.status };
  }
  const newStatus = normalizeStatus('UNPAID', invoice.dueDate);
  if (newStatus === invoice.status) {
    return { invoice, statusChanged: false, oldStatus: invoice.status, newStatus };
  }
  const updated: ProjectInvoice = {
    ...invoice,
    status: newStatus,
    lastKnownStatus: invoice.status,
    lastSyncedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await invoicesCollection().doc(invoice.id).set(
    {
      status: updated.status,
      lastKnownStatus: updated.lastKnownStatus,
      lastSyncedAt: updated.lastSyncedAt,
      updatedAt: updated.updatedAt,
    },
    { merge: true }
  );
  return {
    invoice: updated,
    statusChanged: true,
    oldStatus: invoice.status,
    newStatus,
  };
}

