'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { fetchAuthed } from '@/lib/api-client';
import { defaultHourlyRate } from '@/lib/payment-templates';
import type { ProjectInvoice } from '@/modules/invoices/domain/types';

interface SlotDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the dialog is in "edit" mode and updates this slot. */
  editing?: ProjectInvoice | null;
  onSaved: (invoice: ProjectInvoice) => void;
}

interface FormState {
  label: string;
  expectedAmount: string;
  expectedCurrency: string;
  expectedDueDate: string;
  notes: string;
  hourly: boolean;
  hours: string;
  hourlyRate: string;
}

const EMPTY: FormState = {
  label: '',
  expectedAmount: '',
  expectedCurrency: 'INR',
  expectedDueDate: '',
  notes: '',
  hourly: false,
  hours: '',
  hourlyRate: '',
};

function fromInvoice(invoice: ProjectInvoice): FormState {
  return {
    label: invoice.label ?? '',
    expectedAmount:
      invoice.expectedAmount != null ? String(invoice.expectedAmount) : '',
    expectedCurrency: invoice.expectedCurrency ?? 'INR',
    expectedDueDate: invoice.expectedDueDate ?? '',
    notes: invoice.notes ?? '',
    hourly: false,
    hours: '',
    hourlyRate: '',
  };
}

export function SlotDialog({ projectId, open, onOpenChange, editing, onSaved }: SlotDialogProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const isEdit = Boolean(editing);

  useEffect(() => {
    if (!open) return;
    setForm(editing ? fromInvoice(editing) : EMPTY);
  }, [open, editing]);

  const update = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  // When the user toggles hourly on, seed the rate from the currency default
  // (only if rate is blank, so we don't overwrite a value they typed).
  useEffect(() => {
    if (!form.hourly) return;
    if (form.hourlyRate.trim()) return;
    const def = defaultHourlyRate(form.expectedCurrency);
    if (def != null) setForm((prev) => ({ ...prev, hourlyRate: String(def) }));
  }, [form.hourly, form.expectedCurrency, form.hourlyRate]);

  const computedHourlyAmount = useMemo(() => {
    if (!form.hourly) return null;
    const h = Number(form.hours);
    const r = Number(form.hourlyRate);
    if (!Number.isFinite(h) || !Number.isFinite(r) || h <= 0 || r <= 0) return null;
    return Math.round(h * r * 100) / 100;
  }, [form.hourly, form.hours, form.hourlyRate]);

  const handleSubmit = async () => {
    const label = form.label.trim();
    if (!label) {
      toast.error('Label is required');
      return;
    }

    let expectedAmount: number | null = null;
    let notes = form.notes.trim() || null;

    if (form.hourly) {
      if (computedHourlyAmount == null) {
        toast.error('Enter positive hours and hourly rate');
        return;
      }
      expectedAmount = computedHourlyAmount;
      const breakdown = `${form.hours} hours × ${form.expectedCurrency.trim().toUpperCase() || 'INR'} ${form.hourlyRate}/hour`;
      notes = notes ? `${notes}\n${breakdown}` : breakdown;
    } else if (form.expectedAmount.trim()) {
      const n = Number(form.expectedAmount);
      if (!Number.isFinite(n) || n < 0) {
        toast.error('Expected amount must be non-negative');
        return;
      }
      expectedAmount = n;
    }

    const payload = {
      label,
      expectedAmount,
      expectedCurrency: form.expectedCurrency.trim().toUpperCase() || null,
      expectedDueDate: form.expectedDueDate.trim() || null,
      notes,
    };

    setSubmitting(true);
    try {
      const res = await fetchAuthed(
        isEdit
          ? `/api/refrens/invoices/${editing!.id}`
          : `/api/refrens/invoices/slot`,
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(isEdit ? payload : { projectId, ...payload }),
        }
      );
      const data = (await res.json()) as { invoice?: ProjectInvoice; error?: string };
      if (!res.ok || !data.invoice) {
        throw new Error(data.error || `Failed (${res.status})`);
      }
      toast.success(isEdit ? 'Slot updated' : 'Slot added');
      onSaved(data.invoice);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit slot' : 'Add invoice slot'}</DialogTitle>
          <DialogDescription>
            Plan an upcoming invoice for this project. Fill it later by mapping a Refrens invoice.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="slot-label">Label</Label>
            <Input
              id="slot-label"
              value={form.label}
              onChange={(e) => update({ label: e.target.value })}
              placeholder="Q1 retainer · April"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>Bill hourly</span>
            </div>
            <Switch
              checked={form.hourly}
              onCheckedChange={(v) => update({ hourly: Boolean(v) })}
            />
          </div>

          {form.hourly ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="slot-hours">Hours</Label>
                  <Input
                    id="slot-hours"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.25"
                    value={form.hours}
                    onChange={(e) => update({ hours: e.target.value })}
                    placeholder="20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slot-rate">Hourly rate</Label>
                  <Input
                    id="slot-rate"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={form.hourlyRate}
                    onChange={(e) => update({ hourlyRate: e.target.value })}
                    placeholder="50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slot-currency">Currency</Label>
                  <Input
                    id="slot-currency"
                    value={form.expectedCurrency}
                    onChange={(e) => update({ expectedCurrency: e.target.value })}
                    className="uppercase"
                    maxLength={3}
                    placeholder="INR"
                  />
                </div>
              </div>
              {computedHourlyAmount != null && (
                <div className="text-xs text-muted-foreground">
                  Total:{' '}
                  <span className="font-medium tabular-nums">
                    {form.expectedCurrency.trim().toUpperCase() || 'INR'}{' '}
                    {computedHourlyAmount.toLocaleString()}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="slot-amount">Expected amount</Label>
                <Input
                  id="slot-amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={form.expectedAmount}
                  onChange={(e) => update({ expectedAmount: e.target.value })}
                  placeholder="50000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slot-currency">Currency</Label>
                <Input
                  id="slot-currency"
                  value={form.expectedCurrency}
                  onChange={(e) => update({ expectedCurrency: e.target.value })}
                  className="uppercase"
                  maxLength={3}
                  placeholder="INR"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="slot-due">Expected due date</Label>
            <Input
              id="slot-due"
              type="date"
              value={form.expectedDueDate}
              onChange={(e) => update({ expectedDueDate: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slot-notes">Notes (optional)</Label>
            <Textarea
              id="slot-notes"
              value={form.notes}
              onChange={(e) => update({ notes: e.target.value })}
              placeholder="Internal note — not sent to Refrens"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isEdit ? 'Save changes' : 'Add slot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
