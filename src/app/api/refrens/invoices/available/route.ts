import { NextRequest, NextResponse } from 'next/server';
import { db as adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { ApiAuthError, apiAuthErrorResponse, requireAdmin } from '@/lib/api-auth';
import {
  RefrensApiError,
  RefrensNotConfiguredError,
  listAllInvoicesCached,
} from '@/services/RefrensService';
import { listAllInvoices } from '@/modules/invoices/infrastructure/invoices.repository';

export const runtime = 'nodejs';

export interface AvailableInvoiceItem {
  refrensInvoiceId: string;
  invoiceNumber: string | null;
  status: string | null;
  amount: number | null;
  currency: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  billedToName: string | null;
  shareLink: string | null;
  pdfLink: string | null;
  mapping:
    | { state: 'unmapped' }
    | { state: 'mapped-current' }
    | { state: 'mapped-other'; projectId: string; projectName: string };
}

interface RefrensListItem {
  _id: string;
  invoiceNumber?: string | number;
  status?: string;
  finalTotal?: { total?: number; amount?: number; subTotal?: number };
  currency?: string;
  invoiceDate?: string;
  dueDate?: string;
  billedTo?: { name?: string };
  share?: { link?: string; pdf?: string };
}

function pickAmount(raw: RefrensListItem): number | null {
  const total = raw.finalTotal;
  if (!total) return null;
  return total.total ?? total.amount ?? total.subTotal ?? null;
}

/**
 * GET /api/refrens/invoices/available?projectId=<id>&refresh=1
 *
 * Admin-only. Returns the full Refrens invoice list (capped at 500, server-
 * cached for 10 min) annotated with per-invoice mapping state relative to
 * the current project. Mapping state is computed fresh from Firestore each
 * call — only the Refrens-side payload is cached.
 *
 * Pass `refresh=1` to force a fresh Refrens fetch (e.g. user clicked the
 * refresh button in the dialog).
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId')?.trim();
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    const forceRefresh = url.searchParams.get('refresh') === '1';

    const [refrens, mirrors] = await Promise.all([
      listAllInvoicesCached({ forceRefresh }),
      listAllInvoices(),
    ]);

    const mirrorByRefrensId = new Map(mirrors.map((m) => [m.refrensInvoiceId, m]));

    const otherProjectIds = new Set<string>();
    for (const m of mirrors) {
      if (m.refrensInvoiceId && m.projectId !== projectId) otherProjectIds.add(m.projectId);
    }
    const projectNameById = new Map<string, string>();
    if (otherProjectIds.size > 0) {
      const docs = await Promise.all(
        Array.from(otherProjectIds).map((id) =>
          adminDb.collection(COLLECTIONS.PROJECTS).doc(id).get()
        )
      );
      for (const doc of docs) {
        if (!doc.exists) continue;
        const data = doc.data() as { name?: string } | undefined;
        projectNameById.set(doc.id, data?.name?.trim() || doc.id);
      }
    }

    const items: AvailableInvoiceItem[] = (refrens.items as RefrensListItem[]).map((raw) => {
      const mirror = mirrorByRefrensId.get(raw._id);
      let mapping: AvailableInvoiceItem['mapping'] = { state: 'unmapped' };
      if (mirror) {
        if (mirror.projectId === projectId) {
          mapping = { state: 'mapped-current' };
        } else {
          mapping = {
            state: 'mapped-other',
            projectId: mirror.projectId,
            projectName: projectNameById.get(mirror.projectId) ?? mirror.projectId,
          };
        }
      }
      return {
        refrensInvoiceId: raw._id,
        invoiceNumber: raw.invoiceNumber != null ? String(raw.invoiceNumber) : null,
        status: raw.status ?? null,
        amount: pickAmount(raw),
        currency: raw.currency ?? null,
        invoiceDate: raw.invoiceDate ?? null,
        dueDate: raw.dueDate ?? null,
        billedToName: raw.billedTo?.name ?? null,
        shareLink: raw.share?.link ?? null,
        pdfLink: raw.share?.pdf ?? null,
        mapping,
      };
    });

    return NextResponse.json({
      items,
      total: refrens.total,
      cachedAt: new Date(refrens.cachedAt).toISOString(),
      fromCache: refrens.fromCache,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    if (err instanceof RefrensNotConfiguredError) {
      return NextResponse.json({ error: 'Refrens is not configured.' }, { status: 400 });
    }
    if (err instanceof RefrensApiError) {
      return NextResponse.json(
        { error: err.message, status: err.status, body: err.body },
        { status: 502 }
      );
    }
    console.error('[api/refrens/invoices/available GET] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
