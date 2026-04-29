/**
 * A `ProjectInvoice` is a slot-based row in `project_invoices`. A row is in
 * one of three observable states:
 *
 *  - **Empty slot**: planning fields set (`label`, `expectedAmount`, …) but
 *    no Refrens invoice attached yet. `status === 'PENDING'`.
 *  - **Filled slot**: planning fields *and* Refrens fields set. Status
 *    reflects the real invoice (UNPAID / PAID / OVERDUE / CANCELED).
 *  - **Ad-hoc**: only Refrens fields, no `label`. Renders using the
 *    invoice number as fallback label. Allowed for legacy / one-off rows.
 *
 * Refrens stays the source of truth for invoice content; we only mirror the
 * slim fields needed to render the list and deep-link out.
 */

export type InvoiceStatus =
  | 'PENDING'
  | 'UNPAID'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELED'
  | 'UNKNOWN';

export interface ProjectInvoice {
  id: string;
  projectId: string;

  // --- Slot fields ---
  label: string | null;
  expectedAmount: number | null;
  expectedCurrency: string | null;
  expectedDueDate: string | null;
  notes: string | null;
  order: number;

  // --- Refrens fields (null on empty slots) ---
  refrensInvoiceId: string | null;
  refrensUrlKey: string | null;
  invoiceNumber: string | null;
  status: InvoiceStatus;
  lastKnownStatus: InvoiceStatus;
  amount: number | null;
  currency: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  shareLink: string | null;
  pdfLink: string | null;
  billedToName: string | null;
  billedToEmail: string | null;

  // --- User-controlled ---
  emailNotifyEnabled: boolean;

  // --- Bookkeeping ---
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSlotInput {
  label: string;
  expectedAmount?: number | null;
  expectedCurrency?: string | null;
  expectedDueDate?: string | null;
  notes?: string | null;
}

export interface UpdateSlotInput {
  label?: string;
  expectedAmount?: number | null;
  expectedCurrency?: string | null;
  expectedDueDate?: string | null;
  notes?: string | null;
}
