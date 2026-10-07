/**
 * Incoming payments: credits on the business bank account, read from Fold
 * (fold.money) twice a day and tied to a client project.
 *
 * A row in `incoming_payments` is keyed by the Fold transaction id, so a
 * re-sync never duplicates it. It is in one of three states:
 *
 *  - **unassigned**: nobody has said which project it belongs to yet. It may
 *    carry a `suggestion` (from the payer's name or the amount).
 *  - **assigned**: tied to a project, and optionally to one invoice slot.
 *    `autoAssigned` is true when a remembered payer did it, not a person.
 *  - **ignored**: not a client payment (refund, interest, own transfer).
 *
 * Admin-only. The collection is absent from firestore.rules (default deny).
 */

export type PaymentStatus = 'unassigned' | 'assigned' | 'ignored';

export const PAYMENT_STATUSES: readonly PaymentStatus[] = ['unassigned', 'assigned', 'ignored'];

/**
 * Payment services that pay out on behalf of many clients. Their bank line
 * names the service, not the client, so a payer rule would send every payout
 * to one project. They are never remembered.
 */
export type PaymentVia = 'skydo' | 'payoneer' | 'paypal' | 'wise' | 'stripe' | 'razorpay';

export type SuggestionConfidence = 'high' | 'medium' | 'low';

export interface PaymentSuggestion {
  projectId: string;
  invoiceId: string | null;
  /** Plain words shown to the person confirming, e.g. "Payer matches client name". */
  reason: string;
  confidence: SuggestionConfidence;
}

export interface IncomingPayment {
  /** Fold transaction id. */
  id: string;
  accountId: string;
  /** "Axis Bank ··3728", so the list reads without a lookup. */
  accountLabel: string;
  /** Bank-reported time, ISO. */
  date: string;
  amount: number;
  currency: string;
  narration: string;
  merchantName: string | null;
  /** Normalised payer, e.g. "orchid-pharma". Null when the line names no one. */
  payerKey: string | null;
  /** Payer as the bank wrote it, for display. */
  payerName: string;
  via: PaymentVia | null;
  /** NEFT, RTGS, IMPS, UPI, or null. */
  channel: string | null;
  foldCategory: string | null;

  status: PaymentStatus;
  projectId: string | null;
  invoiceId: string | null;
  autoAssigned: boolean;
  suggestion: PaymentSuggestion | null;
  assignedBy: string | null;
  assignedAt: string | null;

  /** Set once this credit has been recorded as a payment on the Refrens invoice. */
  refrensPaymentId: string | null;
  refrensRecordedAt: string | null;
  refrensRecordedBy: string | null;

  firstSeenAt: string;
  updatedAt: string;
}

/** `payment_payers/{payerKey}`: "money from this payer belongs to this project". */
export interface PayerRule {
  payerKey: string;
  payerName: string;
  projectId: string;
  createdBy: string;
  createdAt: string;
}

/** What the app keeps about a Fold bank account. No balances. */
export interface FoldAccountSummary {
  id: string;
  bankName: string;
  maskedNumber: string;
  holderName: string | null;
  accountType: string | null;
}

export interface FoldSyncSummary {
  at: string;
  ok: boolean;
  fetched: number;
  created: number;
  autoAssigned: number;
  suggested: number;
  emailed: number;
  error: string | null;
}

/** What `GET /api/payments/fold` returns. Never tokens. */
export interface FoldConnectionStatus {
  connected: boolean;
  needsReconnect: boolean;
  connectedBy: string | null;
  connectedAt: string | null;
  accounts: FoldAccountSummary[];
  selectedAccountIds: string[];
  minAmount: number;
  notifyEmails: string[];
  lastSync: FoldSyncSummary | null;
  lastError: string | null;
}

/** Lean project shape used for matching and the project picker. */
export interface PaymentProjectRef {
  id: string;
  name: string;
  client: string | null;
}

/** Lean open-invoice shape used for matching and the invoice picker. */
export interface PaymentInvoiceRef {
  id: string;
  projectId: string;
  label: string | null;
  invoiceNumber: string | null;
  amount: number | null;
  currency: string | null;
  status: string;
  billedToName: string | null;
  /** A Refrens invoice is attached, so a payment can be recorded on it. */
  refrensMapped: boolean;
}

export const DEFAULT_MIN_AMOUNT = 1000;
