import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse, requireAdmin } from '@/lib/api-auth';
import {
  RefrensApiError,
  RefrensNotConfiguredError,
  createInvoice,
  type CreateInvoiceItem,
} from '@/services/RefrensService';
import {
  listInvoicesForProject,
  upsertInvoiceFromRefrens,
} from '@/modules/invoices/infrastructure/invoices.repository';

export const runtime = 'nodejs';

interface CreateBody {
  projectId?: string;
  billedTo?: { name?: string; email?: string };
  items?: Array<{ name?: string; rate?: number; quantity?: number }>;
  invoiceDate?: string;
  dueDate?: string;
  currency?: string;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * POST /api/refrens/invoices
 * Admin-only. Creates an invoice on Refrens, then mirrors a thin record into
 * `project_invoices` and returns the mirror.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = (await req.json()) as CreateBody;

    const projectId = body.projectId?.trim();
    const billedToName = body.billedTo?.name?.trim();
    const billedToEmail = body.billedTo?.email?.trim();
    const invoiceDate = body.invoiceDate?.trim();
    const dueDate = body.dueDate?.trim();
    const currency = body.currency?.trim();

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    if (!billedToName) {
      return NextResponse.json({ error: 'billedTo.name is required' }, { status: 400 });
    }
    if (!invoiceDate) {
      return NextResponse.json({ error: 'invoiceDate is required' }, { status: 400 });
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 });
    }

    const items: CreateInvoiceItem[] = [];
    for (const [index, item] of body.items.entries()) {
      const name = item?.name?.trim();
      const rate = item?.rate;
      const quantity = item?.quantity;
      if (!name) {
        return NextResponse.json({ error: `Item ${index + 1}: description is required` }, { status: 400 });
      }
      if (!isPositiveNumber(rate)) {
        return NextResponse.json({ error: `Item ${index + 1}: rate must be a positive number` }, { status: 400 });
      }
      if (!isPositiveNumber(quantity)) {
        return NextResponse.json({ error: `Item ${index + 1}: quantity must be a positive number` }, { status: 400 });
      }
      items.push({ name, rate, quantity });
    }

    const created = await createInvoice({
      billedTo: { name: billedToName, ...(billedToEmail ? { email: billedToEmail } : {}) },
      items,
      invoiceDate,
      ...(dueDate ? { dueDate } : {}),
      ...(currency ? { currency } : {}),
    });

    const result = await upsertInvoiceFromRefrens(projectId, created);
    return NextResponse.json({ invoice: result.invoice });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    if (err instanceof RefrensNotConfiguredError) {
      return NextResponse.json(
        { error: 'Refrens is not configured. Add credentials in Refrens Settings.' },
        { status: 400 }
      );
    }
    if (err instanceof RefrensApiError) {
      return NextResponse.json(
        { error: err.message, status: err.status, body: err.body },
        { status: 502 }
      );
    }
    console.error('[api/refrens/invoices POST] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/refrens/invoices?projectId=<id>
 * Admin-only. Lists the local mirror records for a project.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId')?.trim();
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    const items = await listInvoicesForProject(projectId);
    return NextResponse.json({ items });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[api/refrens/invoices GET] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
