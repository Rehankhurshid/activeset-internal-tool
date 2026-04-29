'use client';

import { useEffect, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchAuthed } from '@/lib/api-client';
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
}

const EMPTY: FormState = {
  label: '',
  expectedAmount: '',
  expectedCurrency: 'INR',
  expectedDueDate: '',
  notes: '',
};

function fromInvoice(invoice: ProjectInvoice): FormState {
  return {
    label: invoice.label ?? '',
    expectedAmount:
      invoice.expectedAmount != null ? String(invoice.expectedAmount) : '',
    expectedCurrency: invoice.expectedCurrency ?? 'INR',
    expectedDueDate: invoice.expectedDueDate ?? '',
    notes: invoice.notes ?? '',
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

  const handleSubmit = async () => {
    const label = form.label.trim();
    if (!label) {
      toast.error('Label is required');
      return;
    }

    let expectedAmount: number | null = null;
    if (form.expectedAmount.trim()) {
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
      notes: form.notes.trim() || null,
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
