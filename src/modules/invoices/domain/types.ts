/**
 * Local mirror of a Refrens invoice, scoped to a project.
 *
 * Thin by design: status + amount + share/PDF links + the project link. For
 * full line items, taxes, and edits the user deep-links to Refrens via
 * `shareLink` / `pdfLink`. Refrens is the source of truth.
 */

export type InvoiceStatus = 'UNPAID' | 'PAID' | 'OVERDUE' | 'CANCELED' | 'UNKNOWN';

export interface ProjectInvoice {
  id: string;                    // Firestore doc id
  projectId: string;
  refrensInvoiceId: string;      // Refrens `_id`
  refrensUrlKey: string;         // captured at create time so future API calls work
  invoiceNumber: string | null;  // human-friendly invoice number from Refrens
  status: InvoiceStatus;
  lastKnownStatus: InvoiceStatus; // used in Phase 3 to detect status flips for emails
  amount: number | null;
  currency: string | null;
  invoiceDate: string | null;    // ISO date
  dueDate: string | null;        // ISO date
  shareLink: string | null;
  pdfLink: string | null;
  billedToName: string | null;
  billedToEmail: string | null;
  emailNotifyEnabled: boolean;   // Phase 3 toggle, default false
  lastSyncedAt: string;          // ISO
  createdAt: string;             // ISO
  updatedAt: string;             // ISO
}

export interface CreateInvoiceFormItem {
  name: string;
  rate: number;
  quantity: number;
}

export interface CreateInvoiceFormValues {
  billedToName: string;
  billedToEmail?: string;
  invoiceDate: string;     // YYYY-MM-DD
  dueDate: string;         // YYYY-MM-DD
  currency: string;        // ISO 4217, e.g. INR, USD
  items: CreateInvoiceFormItem[];
}
