'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchAuthed } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { VIA_LABELS } from '../../domain/payments.matching';
import type { IncomingPayment, PaymentInvoiceRef, PaymentProjectRef } from '../../domain/payments.types';
import { formatDay, formatMoney } from '../lib/format';

const NO_INVOICE = '__none__';

interface AssignPaymentDialogProps {
  payment: IncomingPayment | null;
  projects: PaymentProjectRef[];
  invoices: PaymentInvoiceRef[];
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

export function invoiceLabel(inv: PaymentInvoiceRef): string {
  const name = inv.invoiceNumber ? `#${inv.invoiceNumber}` : inv.label ?? 'Invoice';
  const amount = inv.amount != null ? ` · ${formatMoney(inv.amount, inv.currency ?? 'INR')}` : '';
  return `${name}${amount} · ${inv.status.toLowerCase()}`;
}

export function AssignPaymentDialog({ payment, projects, invoices, onOpenChange, onDone }: AssignPaymentDialogProps) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string>(NO_INVOICE);
  const [remember, setRemember] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!payment) return;
    const start = payment.projectId ?? payment.suggestion?.projectId ?? null;
    setProjectId(start);
    setInvoiceId(payment.invoiceId ?? (start === payment.suggestion?.projectId ? payment.suggestion?.invoiceId : null) ?? NO_INVOICE);
    setRemember(true);
  }, [payment]);

  const projectInvoices = useMemo(
    () => invoices.filter((inv) => inv.projectId === projectId && inv.status !== 'CANCELED'),
    [invoices, projectId]
  );
  const project = projects.find((p) => p.id === projectId);
  const canRemember = Boolean(payment?.payerKey && !payment?.via);

  const submit = async () => {
    if (!payment || !projectId) return;
    setSaving(true);
    try {
      const res = await fetchAuthed(`/api/payments/${encodeURIComponent(payment.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign',
          projectId,
          invoiceId: invoiceId === NO_INVOICE ? null : invoiceId,
          rememberPayer: canRemember && remember,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      toast.success(
        data.alsoAssigned
          ? `Assigned, plus ${data.alsoAssigned} more from ${payment.payerName}`
          : `Assigned to ${project?.name ?? 'project'}`
      );
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not assign');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(payment)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {payment ? `${formatMoney(payment.amount, payment.currency)} from ${payment.payerName}` : 'Assign payment'}
          </DialogTitle>
          <DialogDescription className="break-all">
            {payment && `${formatDay(payment.date)} · ${payment.narration}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Project</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  <span className="truncate">
                    {project ? `${project.name}${project.client ? ` · ${project.client}` : ''}` : 'Pick a project'}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search projects or clients" />
                  <CommandList>
                    <CommandEmpty>No project found.</CommandEmpty>
                    <CommandGroup>
                      {projects.map((p) => (
                        <CommandItem
                          key={p.id}
                          value={`${p.name} ${p.client ?? ''} ${p.id}`}
                          onSelect={() => {
                            setProjectId(p.id);
                            setInvoiceId(NO_INVOICE);
                            setPickerOpen(false);
                          }}
                        >
                          <Check className={cn('mr-2 h-4 w-4', p.id === projectId ? 'opacity-100' : 'opacity-0')} />
                          <span className="truncate">{p.name}</span>
                          {p.client && <span className="ml-2 truncate text-muted-foreground">{p.client}</span>}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Invoice (optional)</Label>
            <Select value={invoiceId} onValueChange={setInvoiceId} disabled={!projectId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No specific invoice" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_INVOICE}>No specific invoice</SelectItem>
                {projectInvoices.map((inv) => (
                  <SelectItem key={inv.id} value={inv.id}>
                    {invoiceLabel(inv)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Linking only records which invoice this paid. Refrens still decides an invoice&apos;s status.
            </p>
          </div>

          {canRemember ? (
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <Checkbox checked={remember} onCheckedChange={(v) => setRemember(Boolean(v))} className="mt-0.5" />
              <span>
                Remember {payment?.payerName}: future payments from them go to this project automatically.
              </span>
            </label>
          ) : (
            payment?.via && (
              <p className="text-xs text-muted-foreground">
                Paid out by {VIA_LABELS[payment.via]}, which pays for many clients, so this payer is not remembered.
              </p>
            )
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!projectId || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
