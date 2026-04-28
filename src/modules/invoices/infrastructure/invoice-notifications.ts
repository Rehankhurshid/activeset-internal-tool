import 'server-only';
import { db as adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { sendInvoiceStatusEmail } from '@/services/NotificationService';
import type { SyncResult } from '@/modules/invoices/infrastructure/invoices.repository';

export async function getProjectNameForInvoice(projectId: string): Promise<string> {
  try {
    const snap = await adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId).get();
    if (!snap.exists) return projectId;
    const data = snap.data() as { name?: string } | undefined;
    return data?.name?.trim() || projectId;
  } catch {
    return projectId;
  }
}

/**
 * Fires a status-change email if the user opted in via `emailNotifyEnabled`.
 * Failures are logged but never propagate — a flaky SMTP transient should
 * never roll back the sync that produced the status change.
 */
export async function maybeFireInvoiceStatusEmail(
  result: SyncResult,
  projectName: string,
  baseUrl: string
): Promise<void> {
  const inv = result.invoice;
  if (!result.statusChanged) return;
  if (!inv.emailNotifyEnabled) return;
  try {
    await sendInvoiceStatusEmail({
      projectId: inv.projectId,
      projectName,
      invoiceNumber: inv.invoiceNumber,
      oldStatus: result.oldStatus,
      newStatus: result.newStatus,
      amount: inv.amount,
      currency: inv.currency,
      dueDate: inv.dueDate,
      shareLink: inv.shareLink,
      baseUrl,
    });
  } catch (err) {
    console.error('[refrens/sync] status email failed:', err);
  }
}
