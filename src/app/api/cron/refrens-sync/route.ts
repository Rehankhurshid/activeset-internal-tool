import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import {
  RefrensApiError,
  RefrensNotConfiguredError,
  getInvoice,
} from '@/services/RefrensService';
import {
  listAllInvoices,
  recomputeOverdueStatus,
  upsertInvoiceFromRefrens,
  type SyncResult,
} from '@/modules/invoices/infrastructure/invoices.repository';
import {
  getProjectNameForInvoice,
  maybeFireInvoiceStatusEmail,
} from '@/modules/invoices/infrastructure/invoice-notifications';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface SyncSummary {
  total: number;
  refreshed: number;
  recomputed: number;
  skipped: number;
  failed: number;
  emails: number;
  errors: { invoiceId: string; message: string }[];
}

function getBaseUrl(req: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return new URL(req.url).origin;
}

/**
 * GET /api/cron/refrens-sync
 *
 * Daily sync of every project_invoices mirror that's still actionable
 * (not PAID and not CANCELED). For each: pull fresh data from Refrens,
 * upsert the mirror, and fire a status-change email if the invoice opted in.
 *
 * Auth: requires CRON_SECRET via `Authorization: Bearer <secret>` or
 * `x-cron-secret`. When CRON_SECRET is unset (local dev), all callers pass.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const baseUrl = getBaseUrl(req);
  const summary: SyncSummary = {
    total: 0,
    refreshed: 0,
    recomputed: 0,
    skipped: 0,
    failed: 0,
    emails: 0,
    errors: [],
  };

  let invoices;
  try {
    invoices = await listAllInvoices();
  } catch (err) {
    console.error('[cron/refrens-sync] failed to list invoices:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list invoices' },
      { status: 500 }
    );
  }
  summary.total = invoices.length;

  // Cache project names so we don't refetch the same project doc N times.
  const projectNameCache = new Map<string, string>();
  const lookupProjectName = async (projectId: string): Promise<string> => {
    const cached = projectNameCache.get(projectId);
    if (cached) return cached;
    const name = await getProjectNameForInvoice(projectId);
    projectNameCache.set(projectId, name);
    return name;
  };

  for (const inv of invoices) {
    // Skip terminal statuses and empty slots (PENDING means no Refrens
    // invoice attached yet — nothing to sync).
    if (inv.status === 'PAID' || inv.status === 'CANCELED' || inv.status === 'PENDING') {
      summary.skipped++;
      continue;
    }
    if (!inv.refrensInvoiceId || !inv.refrensUrlKey) {
      summary.skipped++;
      continue;
    }

    try {
      let result: SyncResult;
      try {
        const fresh = await getInvoice(inv.refrensInvoiceId);
        result = await upsertInvoiceFromRefrens(inv.projectId, {
          ...fresh,
          urlKey: inv.refrensUrlKey,
        });
        summary.refreshed++;
      } catch (refrensErr) {
        // If Refrens is unreachable for this invoice, fall back to the local
        // overdue recompute so dueDate-driven flips still happen.
        if (
          refrensErr instanceof RefrensNotConfiguredError ||
          refrensErr instanceof RefrensApiError
        ) {
          result = await recomputeOverdueStatus(inv);
          summary.recomputed++;
        } else {
          throw refrensErr;
        }
      }

      if (result.statusChanged && result.invoice.emailNotifyEnabled) {
        const projectName = await lookupProjectName(inv.projectId);
        await maybeFireInvoiceStatusEmail(result, projectName, baseUrl);
        summary.emails++;
      }
    } catch (err) {
      summary.failed++;
      const message = err instanceof Error ? err.message : String(err);
      summary.errors.push({ invoiceId: inv.id, message });
      console.error(`[cron/refrens-sync] invoice ${inv.id} failed:`, err);
    }
  }

  console.log(`[cron/refrens-sync] done`, { startedAt, ...summary });

  return NextResponse.json({
    success: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    ...summary,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
