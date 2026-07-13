import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse, requireAdmin } from '@/lib/api-auth';
import {
  RefrensApiError,
  RefrensNotConfiguredError,
  createInvoice,
  invalidateInvoiceListCache,
  type CreateInvoiceItem,
} from '@/services/RefrensService';
import {
  updateSlotFields,
  upsertInvoiceFromRefrens,
} from '@/modules/invoices/infrastructure/invoices.repository';
import {
  getBillingProject,
  getTasksByIds,
  markTasksInvoiced,
} from '@/modules/invoices/infrastructure/adhoc-invoicing.repository';
import { taskToLineItem } from '@/lib/task-billing';

export const runtime = 'nodejs';

interface FromTasksBody {
  projectId?: string;
  taskIds?: string[];
  invoiceDate?: string;
  dueDate?: string;
  currency?: string;
  billedTo?: { name?: string; email?: string };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * POST /api/refrens/invoices/from-tasks
 *
 * Admin-only. Turns a set of billable tasks on an ad-hoc project into a single
 * Refrens invoice — one line item per task (title × hours × rate) — then
 * mirrors the invoice into `project_invoices` and stamps each task invoiced.
 *
 * Validation refuses the whole batch (all-or-nothing) if any task is missing,
 * belongs to a different project, isn't marked billable, is already invoiced,
 * or has no resolvable rate.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = (await req.json()) as FromTasksBody;
    const projectId = body.projectId?.trim();
    const taskIds = Array.isArray(body.taskIds)
      ? Array.from(new Set(body.taskIds.map((id) => String(id).trim()).filter(Boolean)))
      : [];

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    if (taskIds.length === 0) {
      return NextResponse.json({ error: 'At least one task is required' }, { status: 400 });
    }

    const project = await getBillingProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
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

    // Validate ownership + billing state before any external write.
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

    const currency =
      body.currency?.trim().toUpperCase() || project.billingCurrency?.toUpperCase() || 'USD';

    // Build one line item per task. Hourly tasks need a resolvable rate
    // (per-task override or the project default); fixed tasks need a price.
    const items: CreateInvoiceItem[] = [];
    for (const t of tasks) {
      const item = taskToLineItem(t, project.hourlyRate);
      if (!item) {
        const message =
          t.billingMode === 'fixed'
            ? `Set a fixed price for task "${t.title || t.id}".`
            : `No rate set for task "${t.title || t.id}". Set an hourly rate on the project or on the task.`;
        return NextResponse.json({ error: message }, { status: 400 });
      }
      items.push({ name: item.name, rate: item.rate, quantity: item.quantity });
    }

    const billedToName = body.billedTo?.name?.trim() || project.client?.trim() || project.name;
    const billedToEmail = body.billedTo?.email?.trim() || project.billingContactEmail?.trim();
    if (!billedToName) {
      return NextResponse.json(
        { error: 'A client name is required to bill the invoice to.' },
        { status: 400 },
      );
    }
    const invoiceDate = body.invoiceDate?.trim() || todayIso();
    const dueDate = body.dueDate?.trim() || undefined;

    // Create the real invoice on Refrens.
    const created = await createInvoice({
      billedTo: { name: billedToName, email: billedToEmail || undefined },
      items,
      invoiceDate,
      dueDate,
      currency,
    });

    // Mirror it into project_invoices, then attach a readable label + a
    // line-item breakdown in notes.
    const { invoice } = await upsertInvoiceFromRefrens(projectId, created);
    const label = `Ad-hoc · ${tasks.length} task${tasks.length === 1 ? '' : 's'}`;
    const notes = items
      .map((it) => `${it.name} — ${it.quantity} × ${currency} ${it.rate}`)
      .join('\n');
    await updateSlotFields(invoice.id, { label, notes });

    // Stamp the tasks as invoiced so they lock and disappear from the
    // "ready to invoice" list.
    await markTasksInvoiced(taskIds, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
    });

    invalidateInvoiceListCache();

    return NextResponse.json({
      invoice: { ...invoice, label, notes },
      invoicedTaskIds: taskIds,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    if (err instanceof RefrensNotConfiguredError) {
      return NextResponse.json({ error: 'Refrens is not configured.' }, { status: 400 });
    }
    if (err instanceof RefrensApiError) {
      return NextResponse.json(
        { error: err.message, status: err.status, body: err.body },
        { status: 502 },
      );
    }
    console.error('[api/refrens/invoices/from-tasks POST] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
