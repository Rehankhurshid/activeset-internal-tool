import 'server-only';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import type { InvoiceStatus, ProjectInvoice } from '@/modules/invoices/domain/types';
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
 * dueDate so it can drive notifications without waiting on Refrens. Anything
 * else falls back to UNKNOWN.
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

function refrensToMirror(
  projectId: string,
  raw: RefrensInvoiceSummary & { urlKey: string }
): Omit<ProjectInvoice, 'id'> {
  const now = new Date().toISOString();
  const dueDate = raw.dueDate ?? null;
  const status = normalizeStatus(raw.status, dueDate);
  return {
    projectId,
    refrensInvoiceId: raw._id,
    refrensUrlKey: raw.urlKey,
    invoiceNumber: raw.invoiceNumber != null ? String(raw.invoiceNumber) : null,
    status,
    lastKnownStatus: status,
    amount: pickAmount(raw),
    currency: raw.currency ?? null,
    invoiceDate: raw.invoiceDate ?? null,
    dueDate,
    shareLink: raw.share?.link ?? null,
    pdfLink: raw.share?.pdf ?? null,
    billedToName: raw.billedTo?.name ?? null,
    billedToEmail: raw.billedTo?.email ?? null,
    emailNotifyEnabled: false,
    lastSyncedAt: now,
    createdAt: raw.createdAt ?? now,
    updatedAt: now,
  };
}

export interface SyncResult {
  invoice: ProjectInvoice;
  statusChanged: boolean;
  oldStatus: InvoiceStatus;
  newStatus: InvoiceStatus;
}

/**
 * Inserts or updates the local mirror from a Refrens response. Idempotent on
 * (projectId, refrensInvoiceId). Preserves user-owned fields (notify toggle,
 * createdAt) and reports whether the status flipped vs. the previous mirror.
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

  const mirror = refrensToMirror(projectId, raw);

  if (!existing.empty) {
    const docRef = existing.docs[0].ref;
    const prev = existing.docs[0].data() as ProjectInvoice;
    const merged: Omit<ProjectInvoice, 'id'> = {
      ...mirror,
      emailNotifyEnabled: prev.emailNotifyEnabled,
      lastKnownStatus: prev.status,
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

  const docRef = await col.add(mirror);
  return {
    invoice: { id: docRef.id, ...mirror },
    statusChanged: false,
    oldStatus: mirror.status,
    newStatus: mirror.status,
  };
}

export async function listInvoicesForProject(projectId: string): Promise<ProjectInvoice[]> {
  const snap = await invoicesCollection()
    .where('projectId', '==', projectId)
    .get();
  const items = snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<ProjectInvoice, 'id'>),
  }));
  return items.sort((a, b) => {
    const aKey = a.invoiceDate ?? a.createdAt;
    const bKey = b.invoiceDate ?? b.createdAt;
    return bKey.localeCompare(aKey);
  });
}

export async function listAllInvoices(): Promise<ProjectInvoice[]> {
  const snap = await invoicesCollection().get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<ProjectInvoice, 'id'>),
  }));
}

export async function getInvoiceById(id: string): Promise<ProjectInvoice | null> {
  const snap = await invoicesCollection().doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<ProjectInvoice, 'id'>) };
}

export async function setInvoiceNotifyEnabled(
  id: string,
  enabled: boolean
): Promise<void> {
  await invoicesCollection().doc(id).set(
    { emailNotifyEnabled: enabled, updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

/**
 * Recomputes status purely from the existing dueDate (no Refrens call). Used
 * by cron to flip UNPAID → OVERDUE when a due date passes without any other
 * change. Returns a SyncResult so callers can fire status-change notifications
 * with the same shape as a full refresh.
 */
export async function recomputeOverdueStatus(invoice: ProjectInvoice): Promise<SyncResult> {
  // Treat the current Refrens-side status as the inverse of any locally-derived
  // OVERDUE — if we previously bumped it to OVERDUE, the underlying Refrens
  // status was UNPAID. PAID and CANCELED are terminal; we never demote them.
  const baseRaw =
    invoice.status === 'OVERDUE' || invoice.status === 'UNPAID' ? 'UNPAID' : invoice.status;
  const newStatus = normalizeStatus(baseRaw, invoice.dueDate);
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
