'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Receipt, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { fetchAuthed } from '@/lib/api-client';
import { useProjectTasks } from '@/hooks/useProjectTasks';
import { formatMoney } from '@/lib/format-money';
import { taskBillAmount, resolveTaskBillingMode } from '@/lib/task-billing';
import type { ProjectInvoice } from '@/modules/invoices/domain/types';

interface GenerateFromTasksCardProps {
  projectId: string;
  /** Project default hourly rate; per-task `billedRate` overrides it. */
  hourlyRate: number | null;
  currency: string;
  /** Prefills the Refrens bill-to name. */
  clientName?: string;
  /** Prefills the Refrens bill-to email. */
  billingEmail?: string;
  /** Called with the mirrored invoice row so the parent can add it to the list. */
  onGenerated: (invoice: ProjectInvoice) => void;
}

interface PastOption {
  id: string;
  label: string;
  name: string;
  email: string;
  currency: string;
}

/** Subset of the /available response we use to copy bill-to details. */
interface AvailableInvoiceItem {
  refrensInvoiceId: string;
  invoiceNumber: string | null;
  billedToName: string | null;
  billedToEmail: string | null;
  currency: string | null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Lists the project's billable, not-yet-invoiced tasks and rolls the selected
 * ones into a single Refrens invoice (one line item per task — hourly or
 * fixed). Rendered on the Invoices tab for ad-hoc projects only.
 */
export function GenerateFromTasksCard({
  projectId,
  hourlyRate,
  currency: currencyProp,
  clientName,
  billingEmail,
  onGenerated,
}: GenerateFromTasksCardProps) {
  const { tasks, loading } = useProjectTasks(projectId);

  const billable = useMemo(
    () => tasks.filter((t) => t.billable && !t.invoiceId),
    [tasks],
  );

  // Past invoices (account-wide) we can copy bill-to details from. Loaded
  // lazily the first time the generate dialog opens.
  const [pastOptions, setPastOptions] = useState<PastOption[]>([]);
  const [pastLoaded, setPastLoaded] = useState(false);
  const [pastLoading, setPastLoading] = useState(false);

  const loadPastInvoices = async () => {
    if (pastLoaded || pastLoading) return;
    setPastLoading(true);
    try {
      const res = await fetchAuthed(
        `/api/refrens/invoices/available?projectId=${encodeURIComponent(projectId)}`,
      );
      const data = (await res.json()) as { items?: AvailableInvoiceItem[] };
      if (res.ok && Array.isArray(data.items)) {
        const opts = data.items
          .filter((i) => i.billedToName || i.billedToEmail)
          .slice(0, 50)
          .map((i) => ({
            id: i.refrensInvoiceId,
            label: `#${i.invoiceNumber ?? '—'}${i.billedToName ? ` · ${i.billedToName}` : ''}`,
            name: i.billedToName ?? '',
            email: i.billedToEmail ?? '',
            currency: i.currency ?? '',
          }));
        setPastOptions(opts);
      }
      setPastLoaded(true);
    } catch {
      // Non-fatal — the picker just stays empty and the user types manually.
    } finally {
      setPastLoading(false);
    }
  };

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Bill-to / date / currency fields (initialized when the dialog opens).
  const [billName, setBillName] = useState('');
  const [billEmail, setBillEmail] = useState('');
  const [currency, setCurrency] = useState((currencyProp || 'USD').toUpperCase());
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState('');
  const [copyFromId, setCopyFromId] = useState<string>('');

  // Drop stale ids (e.g. a task that just got invoiced elsewhere) from the set.
  const validSelectedIds = useMemo(() => {
    const billableIds = new Set(billable.map((t) => t.id));
    return [...selected].filter((id) => billableIds.has(id));
  }, [selected, billable]);

  const selectedTasks = billable.filter((t) => validSelectedIds.includes(t.id));
  const total = selectedTasks.reduce((sum, t) => sum + (taskBillAmount(t, hourlyRate) ?? 0), 0);
  const unpricedCount = selectedTasks.filter((t) => taskBillAmount(t, hourlyRate) == null).length;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = billable.length > 0 && validSelectedIds.length === billable.length;
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(billable.map((t) => t.id)));
  };

  const openDialog = () => {
    setBillName(clientName ?? '');
    setBillEmail(billingEmail ?? '');
    setCurrency((currencyProp || 'USD').toUpperCase());
    setInvoiceDate(todayIso());
    setDueDate('');
    setCopyFromId('');
    setDialogOpen(true);
    void loadPastInvoices();
  };

  const handleCopyFrom = (id: string) => {
    setCopyFromId(id);
    const opt = pastOptions.find((o) => o.id === id);
    if (!opt) return;
    if (opt.name) setBillName(opt.name);
    setBillEmail(opt.email);
    if (opt.currency) setCurrency(opt.currency.toUpperCase());
  };

  const handleGenerate = async () => {
    if (validSelectedIds.length === 0) return;
    if (unpricedCount > 0) {
      toast.error('Some selected tasks have no price. Set a rate or fixed amount first.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchAuthed('/api/refrens/invoices/from-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          taskIds: validSelectedIds,
          invoiceDate: invoiceDate || undefined,
          dueDate: dueDate || undefined,
          currency: currency || undefined,
          billedTo: {
            name: billName.trim() || undefined,
            email: billEmail.trim() || undefined,
          },
        }),
      });
      const data = (await res.json()) as { invoice?: ProjectInvoice; error?: string };
      if (!res.ok || !data.invoice) {
        throw new Error(data.error || `Failed (${res.status})`);
      }
      onGenerated(data.invoice);
      setSelected(new Set());
      setDialogOpen(false);
      toast.success(
        `Invoice created from ${validSelectedIds.length} task${
          validSelectedIds.length === 1 ? '' : 's'
        }`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate invoice');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (billable.length === 0) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="p-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Receipt className="h-4 w-4" />
          No billable tasks waiting. Mark tasks as billable on the Tasks tab to invoice them here.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Receipt className="h-4 w-4" />
          Billable tasks ready to invoice
        </CardTitle>
        <CardDescription>
          Select tasks to roll into a single invoice — one line item per task.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border divide-y">
          <label className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground cursor-pointer">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
            <span>Select all ({billable.length})</span>
          </label>
          {billable.map((task) => {
            const mode = resolveTaskBillingMode(task);
            const amount = taskBillAmount(task, hourlyRate);
            const checked = validSelectedIds.includes(task.id);
            return (
              <label
                key={task.id}
                className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent/50"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(task.id)}
                  aria-label={`Select ${task.title}`}
                />
                <span className="flex-1 min-w-0 truncate">{task.title}</span>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {mode === 'fixed'
                    ? 'fixed'
                    : `${task.billedHours != null && task.billedHours > 0 ? task.billedHours : 1}h`}
                </span>
                <span className="w-24 text-right text-xs font-medium tabular-nums shrink-0">
                  {amount == null ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      {mode === 'fixed' ? 'Set price' : 'Set rate'}
                    </span>
                  ) : (
                    formatMoney(amount, currency)
                  )}
                </span>
              </label>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-muted-foreground">
            {validSelectedIds.length} selected ·{' '}
            <span className="font-medium text-foreground tabular-nums">
              {formatMoney(total, currency)}
            </span>
          </div>
          <Button size="sm" onClick={openDialog} disabled={validSelectedIds.length === 0}>
            <Receipt className="mr-1.5 h-3.5 w-3.5" />
            Generate invoice
          </Button>
        </div>

        {unpricedCount > 0 && validSelectedIds.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            {unpricedCount} selected task{unpricedCount === 1 ? '' : 's'} need a price — set an
            hourly rate or a fixed amount.
          </p>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={(o) => !submitting && setDialogOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate invoice</DialogTitle>
            <DialogDescription>
              Creating a {currency} invoice on Refrens from {validSelectedIds.length} task
              {validSelectedIds.length === 1 ? '' : 's'} · total{' '}
              {formatMoney(total, currency)}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Copy details from a past invoice</Label>
              <Select
                value={copyFromId}
                onValueChange={handleCopyFrom}
                disabled={pastLoading || pastOptions.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      pastLoading
                        ? 'Loading past invoices…'
                        : pastOptions.length === 0
                          ? 'No past invoices to copy from'
                          : 'Select a past invoice…'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {pastOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Fills the bill-to name, email, and currency below.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Bill to (name)</Label>
              <Input
                value={billName}
                onChange={(e) => setBillName(e.target.value)}
                placeholder="Client name"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bill to (email)</Label>
              <Input
                type="email"
                value={billEmail}
                onChange={(e) => setBillEmail(e.target.value)}
                placeholder="accounts@client.com"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Invoice date</Label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Due date</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Currency</Label>
                <Input
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  maxLength={3}
                  className="uppercase"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={submitting || unpricedCount > 0}>
              {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Create invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
