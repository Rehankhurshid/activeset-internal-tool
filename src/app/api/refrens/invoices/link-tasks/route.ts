import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse, requireAdmin } from '@/lib/api-auth';
import { getInvoiceById } from '@/modules/invoices/infrastructure/invoices.repository';
import {
  getTasksByIds,
  markTasksInvoiced,
} from '@/modules/invoices/infrastructure/adhoc-invoicing.repository';

export const runtime = 'nodejs';

interface LinkTasksBody {
  projectId?: string;
  taskIds?: string[];
  /** `project_invoices` row id to link the tasks to. */
  invoiceId?: string;
}

/**
 * POST /api/refrens/invoices/link-tasks
 *
 * Admin-only. Links billable tasks to an invoice that already exists on the
 * project — no Refrens write. This is the recovery path for the case where an
 * invoice was created (or attached) but its tasks were never stamped, and the
 * general "these line items belong to that invoice" action.
 *
 * All-or-nothing: refuses if any task is missing, belongs to another project,
 * isn't billable, or is already invoiced.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = (await req.json()) as LinkTasksBody;
    const projectId = body.projectId?.trim();
    const invoiceId = body.invoiceId?.trim();
    const taskIds = Array.isArray(body.taskIds)
      ? Array.from(new Set(body.taskIds.map((id) => String(id).trim()).filter(Boolean)))
      : [];

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });
    }
    if (taskIds.length === 0) {
      return NextResponse.json({ error: 'At least one task is required' }, { status: 400 });
    }

    const invoice = await getInvoiceById(invoiceId);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    if (invoice.projectId !== projectId) {
      return NextResponse.json(
        { error: 'That invoice belongs to a different project' },
        { status: 400 },
      );
    }

    const tasks = await getTasksByIds(taskIds);
    const byId = new Map(tasks.map((t) => [t.id, t]));

    const missing = taskIds.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Task(s) not found: ${missing.join(', ')}` },
        { status: 400 },
      );
    }

    for (const t of tasks) {
      if (t.projectId !== projectId) {
        return NextResponse.json(
          { error: `Task "${t.title || t.id}" does not belong to this project` },
          { status: 400 },
        );
      }
      if (!t.billable) {
        return NextResponse.json(
          { error: `Task "${t.title || t.id}" is not marked billable` },
          { status: 400 },
        );
      }
      if (t.invoiceId) {
        return NextResponse.json(
          { error: `Task "${t.title || t.id}" has already been invoiced` },
          { status: 409 },
        );
      }
    }

    await markTasksInvoiced(taskIds, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
    });

    return NextResponse.json({ invoice, linkedTaskIds: taskIds });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[api/refrens/invoices/link-tasks POST] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
