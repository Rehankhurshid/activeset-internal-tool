import 'server-only';
import { getBaseUrl } from '@/lib/base-url';
import { sendIncomingPaymentsEmail } from '@/services/NotificationService';
import { matchPayment, parsePayer } from '@/modules/payments/domain/payments.matching';
import type { FoldSyncSummary, IncomingPayment } from '@/modules/payments/domain/payments.types';
import {
  FoldSession,
  fetchFoldAccounts,
  fetchFoldCredits,
  getFoldSettings,
  recordFoldSync,
  updateFoldSettings,
  type FoldTransactionRaw,
} from './fold.client';
import {
  createPayments,
  existingPaymentIds,
  listInvoiceRefs,
  listPayerRules,
  listProjectRefs,
} from './payments.repository';

/** First sync looks back this far; later syncs re-read a week to catch late bank postings. */
const BACKFILL_DAYS = 60;
const OVERLAP_DAYS = 7;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number, from = new Date()): Date {
  return new Date(from.getTime() - n * 24 * 60 * 60 * 1000);
}

/**
 * Pull new credits from Fold for the picked accounts, store the ones not seen
 * before, assign or suggest a project, and email the people to notify.
 *
 * Only the accounts ticked on the Payments page are read; with none ticked
 * nothing is fetched. The first sync is a backfill and sends no email.
 * Rows already stored are never touched, so a person's assignment stands.
 */
export async function syncIncomingPayments(): Promise<FoldSyncSummary> {
  const at = new Date().toISOString();
  const summary: FoldSyncSummary = { at, ok: false, fetched: 0, created: 0, autoAssigned: 0, suggested: 0, emailed: 0, error: null };

  try {
    const settings = await getFoldSettings();
    const session = new FoldSession();

    // Keep the account list fresh so a newly linked account shows up to tick.
    const accounts = await fetchFoldAccounts(session);
    await updateFoldSettings({ accounts });

    const selected = settings.selectedAccountIds.filter((id) => accounts.some((a) => a.id === id));
    if (!selected.length) {
      summary.ok = true;
      summary.error = 'No account picked yet';
      await recordFoldSync(summary, false);
      return summary;
    }

    const isBackfill = !settings.lastSuccessfulSyncAt;
    const start = isBackfill
      ? daysAgo(BACKFILL_DAYS)
      : daysAgo(OVERLAP_DAYS, new Date(settings.lastSuccessfulSyncAt as string));
    const credits = (await fetchFoldCredits(selected, isoDay(start), session)).filter(
      (t: FoldTransactionRaw) =>
        t.type === 'credit' &&
        t.split_type !== 'CHILD' &&
        selected.includes(t.account_id) &&
        t.amount >= settings.minAmount
    );
    summary.fetched = credits.length;

    const seen = await existingPaymentIds(credits.map((t) => t.id));
    const fresh = credits.filter((t) => !seen.has(t.id));
    if (!fresh.length) {
      summary.ok = true;
      await recordFoldSync(summary);
      return summary;
    }

    const [rules, projects, invoices] = await Promise.all([listPayerRules(), listProjectRefs(), listInvoiceRefs()]);
    const accountLabel = new Map(accounts.map((a) => [a.id, `${a.bankName} ··${a.maskedNumber.slice(-4)}`]));

    const rows: IncomingPayment[] = fresh.map((t) => {
      const payer = parsePayer({ narration: t.narration, merchantName: t.merchant_name });
      const match = matchPayment({ amount: t.amount, ...payer }, { rules, projects, invoices });
      const base: IncomingPayment = {
        id: t.id,
        accountId: t.account_id,
        accountLabel: accountLabel.get(t.account_id) ?? t.account_id,
        date: t.date,
        amount: t.amount,
        currency: t.currency || 'INR',
        narration: t.narration,
        merchantName: t.merchant_name,
        ...payer,
        foldCategory: t.category?.name ?? null,
        status: 'unassigned',
        projectId: null,
        invoiceId: null,
        autoAssigned: false,
        suggestion: null,
        assignedBy: null,
        assignedAt: null,
        firstSeenAt: at,
        updatedAt: at,
      };
      if (match.kind === 'auto') {
        summary.autoAssigned++;
        return { ...base, status: 'assigned', projectId: match.projectId, invoiceId: match.invoiceId, autoAssigned: true, assignedBy: 'payer rule', assignedAt: at };
      }
      if (match.kind === 'suggest') {
        summary.suggested++;
        return { ...base, suggestion: match.suggestion };
      }
      return base;
    });

    await createPayments(rows);
    summary.created = rows.length;

    if (!isBackfill) {
      const projectName = new Map(projects.map((p) => [p.id, p.name]));
      const result = await sendIncomingPaymentsEmail({
        to: settings.notifyEmails,
        baseUrl: getBaseUrl(),
        rows: rows
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((r) => ({
            date: r.date,
            amount: r.amount,
            currency: r.currency,
            payerName: r.payerName,
            projectName: r.projectId ? projectName.get(r.projectId) ?? null : null,
            note: r.autoAssigned
              ? 'Remembered payer'
              : r.suggestion
                ? `Suggested: ${projectName.get(r.suggestion.projectId) ?? 'a project'}`
                : null,
          })),
      }).catch((err: unknown) => {
        console.error('[payments/sync] email failed:', err);
        return 'skipped' as const;
      });
      if (result === 'sent') summary.emailed = rows.length;
    }

    summary.ok = true;
  } catch (err) {
    summary.error = err instanceof Error ? err.message : String(err);
    console.error('[payments/sync] failed:', err);
  }

  await recordFoldSync(summary).catch((err) => console.error('[payments/sync] could not record sync:', err));
  return summary;
}
