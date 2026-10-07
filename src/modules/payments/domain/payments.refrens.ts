/**
 * What to record in Refrens when a bank credit pays an invoice.
 *
 * Refrens settles an invoice with `amount + tds + transactionCharge`, all in
 * the invoice's currency (POST /businesses/:urlKey/invoices/:id/payments).
 * So for an INR invoice paid after TDS, `amount` is what reached the bank and
 * `tds` is the gap. A foreign-currency invoice paid out in INR by Skydo
 * cannot be converted here, so the amount is prefilled with what is still due
 * in the invoice's currency and the person checks it.
 */

export type RefrensPaymentMethod =
  | 'ACCOUNT_TRANSFER'
  | 'CASH'
  | 'CHEQUE'
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'DD'
  | 'UPI';

export const REFRENS_PAYMENT_METHODS: readonly RefrensPaymentMethod[] = [
  'ACCOUNT_TRANSFER',
  'UPI',
  'CHEQUE',
  'CASH',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'DD',
];

export interface RefrensPaymentDraft {
  amount: number;
  tds: number;
  transactionCharge: number;
  paymentMethod: RefrensPaymentMethod;
  /** Bank reference (UTR) when the narration carries one, else the Fold id. */
  refId: string;
  notes: string;
  /** Shown above the form when the person should check the numbers. */
  warning: string | null;
}

export interface RefrensPaymentAmounts {
  amount: number;
  tds?: number;
  transactionCharge?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** What Refrens counts as settled by one payment. */
export function settledBy(p: RefrensPaymentAmounts): number {
  return round2(p.amount + (p.tds ?? 0) + (p.transactionCharge ?? 0));
}

/** Invoice total minus every payment already on it, never below 0. */
export function outstandingOn(total: number, payments: readonly RefrensPaymentAmounts[]): number {
  return Math.max(0, round2(total - payments.reduce((s, p) => s + settledBy(p), 0)));
}

/** The UTR in an Indian bank line: NEFT/RTGS second field, IMPS/UPI third. */
export function bankReference(narration: string): string | null {
  const parts = narration.split('/').map((p) => p.trim());
  const head = parts[0]?.toUpperCase();
  const ref = head === 'NEFT' || head === 'RTGS' ? parts[1] : head === 'IMPS' || head === 'UPI' ? parts[2] : null;
  return ref && /^[A-Z0-9]{6,}$/i.test(ref) ? ref : null;
}

export function draftRefrensPayment(input: {
  payment: { id: string; amount: number; currency: string; narration: string; channel: string | null; payerName: string; via: string | null };
  invoice: { currency: string | null; outstanding: number; invoiceNumber: string | null };
}): RefrensPaymentDraft {
  const { payment, invoice } = input;
  const invoiceCurrency = (invoice.currency ?? 'INR').toUpperCase();
  const paymentMethod: RefrensPaymentMethod = payment.channel === 'UPI' ? 'UPI' : 'ACCOUNT_TRANSFER';
  const refId = bankReference(payment.narration) ?? payment.id;
  const notes = `Bank credit from ${payment.payerName} (Fold ${payment.id})`;

  if (invoiceCurrency !== payment.currency.toUpperCase()) {
    return {
      amount: invoice.outstanding,
      tds: 0,
      transactionCharge: 0,
      paymentMethod,
      refId,
      notes,
      warning: `The invoice is in ${invoiceCurrency} but ${payment.currency} ${payment.amount.toLocaleString('en-IN')} reached the bank${
        payment.via ? ` through ${payment.via}` : ''
      }. Enter the amount in ${invoiceCurrency}.`,
    };
  }

  const received = round2(payment.amount);
  const gap = round2(invoice.outstanding - received);
  // A short payment of up to ~11% is read as TDS (10% on the pre-GST amount
  // is 8.5% of the total); anything bigger is a part payment.
  if (gap > 0 && gap <= invoice.outstanding * 0.11) {
    return { amount: received, tds: gap, transactionCharge: 0, paymentMethod, refId, notes, warning: null };
  }
  return {
    amount: received,
    tds: 0,
    transactionCharge: 0,
    paymentMethod,
    refId,
    notes,
    warning:
      gap > 0
        ? `This covers part of the ${invoice.outstanding.toLocaleString('en-IN')} still due, so the invoice stays unpaid.`
        : gap < 0
          ? `This is more than the ${invoice.outstanding.toLocaleString('en-IN')} still due on the invoice.`
          : null,
  };
}
