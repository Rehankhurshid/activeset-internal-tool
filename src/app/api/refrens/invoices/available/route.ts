import { NextRequest, NextResponse } from 'next/server';
import { db as adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { ApiAuthError, apiAuthErrorResponse, requireAdmin } from '@/lib/api-auth';
import {
  RefrensApiError,
  RefrensNotConfiguredError,
  listInvoices,
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
 * GET /api/refrens/invoices/available?projectId=<id>&limit=<n>&skip=<n>
 *
 * Admin-only. Lists invoices from Refrens, paginated, and annotates each one
 * with its mapping state relative to the current project. Used by the
 * "Map existing invoice" dialog so the user can see what's already mapped
 * (here vs. elsewhere) and what's free to attach.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId')?.trim();
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 200);
    const skip = Math.max(parseInt(url.searchParams.get('skip') || '0', 10), 0);

    const [refrens, mirrors] = await Promise.all([
      listInvoices({ limit, skip }),
      listAllInvoices(),
    ]);

    // Build refrensInvoiceId -> mirror lookup
    const mirrorByRefrensId = new Map(mirrors.map((m) => [m.refrensInvoiceId, m]));

    // Resolve project names for any "mapped to other project" entries
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
      limit,
      skip,
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
