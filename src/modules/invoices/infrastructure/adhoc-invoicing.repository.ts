import 'server-only';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { normalizeBillingType, type BillingType } from '@/types';

/**
 * Server-only reads/writes backing the "generate an invoice from tasks" flow
 * for ad-hoc projects. Uses firebase-admin (same as invoices.repository) so a
 * single admin API route can read the project + tasks and stamp them invoiced
 * without a client round-trip.
 */

function assertAdmin(): void {
  if (!hasFirebaseAdminCredentials) {
    throw new Error(
      '[adhocInvoicing] firebase-admin credentials are not configured; cannot access projects/tasks',
    );
  }
}

/** Slim projection of a project's billing configuration. */
export interface BillingProject {
  id: string;
  name: string;
  client: string | null;
  billingType: BillingType;
  hourlyRate: number | null;
  billingCurrency: string | null;
  billingContactEmail: string | null;
}

/** Slim projection of the task fields the invoicing flow needs. */
export interface BillableTask {
  id: string;
  projectId: string;
  title: string;
  billable: boolean;
  billedHours: number | null;
  billedRate: number | null;
  invoiceId: string | null;
}

export async function getBillingProject(projectId: string): Promise<BillingProject | null> {
  assertAdmin();
  const snap = await adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId).get();
  if (!snap.exists) return null;
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    name: String(d.name ?? ''),
    client: (d.client as string | undefined) ?? null,
    billingType: normalizeBillingType(d.billingType),
    hourlyRate: typeof d.hourlyRate === 'number' ? d.hourlyRate : null,
    billingCurrency: (d.billingCurrency as string | undefined) ?? null,
    billingContactEmail: (d.billingContactEmail as string | undefined) ?? null,
  };
}

/**
 * Loads the given tasks by id. Returns only the ones that exist — the caller
 * is responsible for detecting missing ids and validating ownership/state.
 */
export async function getTasksByIds(taskIds: string[]): Promise<BillableTask[]> {
  assertAdmin();
  if (taskIds.length === 0) return [];
  const refs = taskIds.map((id) => adminDb.collection(COLLECTIONS.TASKS).doc(id));
  const snaps = await adminDb.getAll(...refs);
  const tasks: BillableTask[] = [];
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const d = snap.data() ?? {};
    tasks.push({
      id: snap.id,
      projectId: String(d.projectId ?? ''),
      title: String(d.title ?? ''),
      billable: Boolean(d.billable),
      billedHours: typeof d.billedHours === 'number' ? d.billedHours : null,
      billedRate: typeof d.billedRate === 'number' ? d.billedRate : null,
      invoiceId: (d.invoiceId as string | undefined) ?? null,
    });
  }
  return tasks;
}

/**
 * Stamps tasks as invoiced, linking them to the mirrored `project_invoices`
 * row. Merge-writes so nothing else on the task doc is disturbed.
 */
export async function markTasksInvoiced(
  taskIds: string[],
  meta: { invoiceId: string; invoiceNumber: string | null },
): Promise<void> {
  assertAdmin();
  if (taskIds.length === 0) return;
  const now = new Date().toISOString();
  const batch = adminDb.batch();
  for (const id of taskIds) {
    const ref = adminDb.collection(COLLECTIONS.TASKS).doc(id);
    batch.set(
      ref,
      {
        invoiceId: meta.invoiceId,
        invoiceNumber: meta.invoiceNumber ?? null,
        invoicedAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
  }
  await batch.commit();
}
