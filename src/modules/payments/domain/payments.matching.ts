import type {
  PayerRule,
  PaymentInvoiceRef,
  PaymentProjectRef,
  PaymentSuggestion,
  PaymentVia,
} from './payments.types';

/**
 * Pure matching for incoming payments: who paid, and which project it is.
 *
 * Indian bank lines look like:
 *   NEFT/<ref>/ORCHID PHARMA LIMITED/HDFC BANK/...
 *   RTGS/<ref>/CACHE FINANCIALS INC/HDFC BANK//NRE/...
 *   IMPS/P2A/<ref>/SKYDOTEC/Remitter/...
 *   UPI/P2A/<ref>/AIRTEL PA/HDFC/Refund/
 * and banks cut names short ("SPACEKAYAK TECHNOLOGIES PRIV"), so name
 * comparison is token-based and tolerates truncation.
 */

const VIA_PATTERNS: ReadonlyArray<[PaymentVia, RegExp]> = [
  ['skydo', /skydo/i],
  ['payoneer', /payoneer/i],
  ['paypal', /paypal/i],
  ['wise', /\b(wise|transferwise)\b/i],
  ['stripe', /\bstripe\b/i],
  ['razorpay', /razorpay/i],
];

export const VIA_LABELS: Record<PaymentVia, string> = {
  skydo: 'Skydo',
  payoneer: 'Payoneer',
  paypal: 'PayPal',
  wise: 'Wise',
  stripe: 'Stripe',
  razorpay: 'Razorpay',
};

/** Company-form words, dropped before comparing. Banks truncate them, so prefixes count too. */
const LEGAL_WORDS = ['private', 'limited', 'company', 'corporation', 'incorporated'];
const LEGAL_EXACT = new Set(['pvt', 'ltd', 'llp', 'inc', 'llc', 'co', 'corp', 'plc', 'gmbh', 'pte', 'bv', 'sa', 'ag']);

/** Words too common to identify a company on their own. */
const GENERIC_WORDS = new Set([
  'technologies', 'technology', 'tech', 'solutions', 'services', 'india', 'global', 'the', 'and',
  'of', 'digital', 'labs', 'group', 'software', 'systems', 'ventures', 'enterprises', 'international',
]);

export function viaFromText(...texts: Array<string | null | undefined>): PaymentVia | null {
  const joined = texts.filter(Boolean).join(' ');
  for (const [via, re] of VIA_PATTERNS) if (re.test(joined)) return via;
  return null;
}

export function channelFromNarration(narration: string): string | null {
  const head = narration.trim().split('/')[0]?.toUpperCase() ?? '';
  return ['NEFT', 'RTGS', 'IMPS', 'UPI'].includes(head) ? head : null;
}

/** The payer segment of a bank line, or null when the format is unknown. */
export function payerFromNarration(narration: string): string | null {
  const parts = narration.split('/').map((p) => p.trim());
  const head = parts[0]?.toUpperCase();
  const raw = head === 'NEFT' || head === 'RTGS' ? parts[2] : head === 'IMPS' || head === 'UPI' ? parts[3] : null;
  return raw ? raw : null;
}

function isLegalWord(token: string): boolean {
  if (LEGAL_EXACT.has(token)) return true;
  return token.length >= 4 && LEGAL_WORDS.some((w) => w.startsWith(token));
}

/** Lowercase words with company-form words removed. */
export function nameTokens(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !isLegalWord(t));
}

/** "ORCHID PHARMA LIMITED" → "orchid-pharma". Null when nothing identifying is left. */
export function payerKeyFromName(name: string | null | undefined): string | null {
  const tokens = nameTokens(name);
  return tokens.length ? tokens.join('-') : null;
}

function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  return Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a));
}

/**
 * True when every identifying word of the shorter name appears in the other,
 * allowing truncation. "JWA TECHNOLOGY PRIVATE LIMIT" matches "JWA Technology".
 */
export function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = nameTokens(a).filter((t) => !GENERIC_WORDS.has(t));
  const tb = nameTokens(b).filter((t) => !GENERIC_WORDS.has(t));
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every((s) => long.some((l) => tokensMatch(s, l)));
}

export interface ParsedPayer {
  payerKey: string | null;
  payerName: string;
  via: PaymentVia | null;
  channel: string | null;
}

export function parsePayer(input: { narration: string; merchantName: string | null }): ParsedPayer {
  const via = viaFromText(input.merchantName, input.narration);
  const channel = channelFromNarration(input.narration);
  if (via) return { payerKey: via, payerName: VIA_LABELS[via], via, channel };
  const name = input.merchantName?.trim() || payerFromNarration(input.narration) || input.narration.slice(0, 60);
  return { payerKey: payerKeyFromName(name), payerName: name, via: null, channel };
}

const OPEN_INVOICE_STATUSES = new Set(['UNPAID', 'OVERDUE']);

/**
 * How well a received amount fits an invoice. Indian clients often deduct TDS
 * (2% or 10% of the pre-GST amount), so 89-100% of the invoice still counts.
 */
export function amountFit(received: number, invoice: PaymentInvoiceRef): 'exact' | 'after-tds' | null {
  if (!invoice.amount || invoice.amount <= 0) return null;
  if ((invoice.currency ?? 'INR').toUpperCase() !== 'INR') return null;
  if (Math.abs(received - invoice.amount) <= 1) return 'exact';
  const ratio = received / invoice.amount;
  return ratio >= 0.89 && ratio < 1 ? 'after-tds' : null;
}

function invoiceName(inv: PaymentInvoiceRef): string {
  return inv.invoiceNumber ? `invoice ${inv.invoiceNumber}` : inv.label ? `"${inv.label}"` : 'an invoice';
}

/** Best open invoice on one project for this amount, exact fits first. */
export function bestInvoiceFor(
  received: number,
  projectId: string,
  invoices: readonly PaymentInvoiceRef[]
): { invoice: PaymentInvoiceRef; fit: 'exact' | 'after-tds' } | null {
  let best: { invoice: PaymentInvoiceRef; fit: 'exact' | 'after-tds' } | null = null;
  for (const inv of invoices) {
    if (inv.projectId !== projectId || !OPEN_INVOICE_STATUSES.has(inv.status)) continue;
    const fit = amountFit(received, inv);
    if (!fit) continue;
    if (!best || (fit === 'exact' && best.fit !== 'exact')) best = { invoice: inv, fit };
  }
  return best;
}

export interface MatchContext {
  rules: ReadonlyMap<string, PayerRule>;
  projects: readonly PaymentProjectRef[];
  invoices: readonly PaymentInvoiceRef[];
}

export type MatchResult =
  | { kind: 'auto'; projectId: string; invoiceId: string | null; reason: string }
  | { kind: 'suggest'; suggestion: PaymentSuggestion }
  | { kind: 'none' };

/**
 * Decide what to do with a new credit:
 *  1. A remembered payer assigns it outright (never for Skydo and the like).
 *  2. A payer whose name matches exactly one project's client, name or invoice
 *     bill-to is suggested.
 *  3. Otherwise an amount that fits exactly one open INR invoice is suggested.
 */
export function matchPayment(
  payment: { amount: number; payerKey: string | null; payerName: string; via: PaymentVia | null },
  ctx: MatchContext
): MatchResult {
  const { amount, payerKey, payerName, via } = payment;
  const projectIds = new Set(ctx.projects.map((p) => p.id));

  if (!via && payerKey) {
    const rule = ctx.rules.get(payerKey);
    if (rule && projectIds.has(rule.projectId)) {
      const inv = bestInvoiceFor(amount, rule.projectId, ctx.invoices);
      return { kind: 'auto', projectId: rule.projectId, invoiceId: inv?.invoice.id ?? null, reason: 'Remembered payer' };
    }
  }

  if (!via) {
    const byName = new Set<string>();
    for (const p of ctx.projects) {
      if (namesMatch(payerName, p.client) || namesMatch(payerName, p.name)) byName.add(p.id);
    }
    for (const inv of ctx.invoices) {
      if (projectIds.has(inv.projectId) && namesMatch(payerName, inv.billedToName)) byName.add(inv.projectId);
    }
    if (byName.size === 1) {
      const [projectId] = [...byName];
      const inv = bestInvoiceFor(amount, projectId, ctx.invoices);
      return {
        kind: 'suggest',
        suggestion: {
          projectId,
          invoiceId: inv?.invoice.id ?? null,
          reason: inv
            ? `Payer matches the client, and the amount fits ${invoiceName(inv.invoice)}${inv.fit === 'after-tds' ? ' after TDS' : ''}`
            : 'Payer matches the client name',
          confidence: inv ? 'high' : 'medium',
        },
      };
    }
  }

  const fits = ctx.invoices
    .filter((inv) => projectIds.has(inv.projectId) && OPEN_INVOICE_STATUSES.has(inv.status))
    .map((inv) => ({ inv, fit: amountFit(amount, inv) }))
    .filter((x): x is { inv: PaymentInvoiceRef; fit: 'exact' | 'after-tds' } => x.fit !== null);
  const exact = fits.filter((f) => f.fit === 'exact');
  const pick = exact.length === 1 ? exact[0] : exact.length === 0 && fits.length === 1 ? fits[0] : null;
  if (pick) {
    return {
      kind: 'suggest',
      suggestion: {
        projectId: pick.inv.projectId,
        invoiceId: pick.inv.id,
        reason: `Amount fits ${invoiceName(pick.inv)}${pick.fit === 'after-tds' ? ' after TDS' : ''}`,
        confidence: pick.fit === 'exact' ? 'medium' : 'low',
      },
    };
  }

  return { kind: 'none' };
}
