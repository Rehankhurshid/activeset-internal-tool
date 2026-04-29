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
import { Loader2, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { fetchAuthed } from '@/lib/api-client';
import {
  PRESET_TEMPLATE_OPTIONS,
  expandToSlots,
  type PaymentTemplate,
} from '@/lib/payment-templates';
import type { ProjectInvoice } from '@/modules/invoices/domain/types';

export interface ApplyTemplateInitialValues {
  presetId?: string;
  months?: number;
  quarters?: number;
  totalAmount?: string;
  currency?: string;
  startDate?: string;
}

interface ApplyTemplateDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: (invoices: ProjectInvoice[]) => void;
  /** Optional initial values applied each time the dialog opens. Used by the
   *  subscription renewal nudge to prefill cadence + amount. */
  initialValues?: ApplyTemplateInitialValues;
}

const DEFAULT_PRESET_ID = 'one-time';
const DEFAULT_MONTHS = 6;
const DEFAULT_QUARTERS = 4;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function ApplyTemplateDialog({
  projectId,
  open,
  onOpenChange,
  onApplied,
  initialValues,
}: ApplyTemplateDialogProps) {
  const [presetId, setPresetId] = useState(DEFAULT_PRESET_ID);
  const [months, setMonths] = useState(DEFAULT_MONTHS);
  const [quarters, setQuarters] = useState(DEFAULT_QUARTERS);
  const [totalAmount, setTotalAmount] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [startDate, setStartDate] = useState(todayIso());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setPresetId(initialValues?.presetId ?? DEFAULT_PRESET_ID);
      setMonths(initialValues?.months ?? DEFAULT_MONTHS);
      setQuarters(initialValues?.quarters ?? DEFAULT_QUARTERS);
      setTotalAmount(initialValues?.totalAmount ?? '');
      setCurrency(initialValues?.currency ?? 'INR');
      setStartDate(initialValues?.startDate ?? todayIso());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const buildTemplate = (): PaymentTemplate | null => {
    const preset = PRESET_TEMPLATE_OPTIONS.find((p) => p.id === presetId);
    if (!preset) return null;
    if (preset.template) return preset.template;
    if (preset.id === 'monthly') return { kind: 'monthly', months };
    if (preset.id === 'quarterly') return { kind: 'quarterly', quarters };
    return null;
  };

  const totalNum = Number(totalAmount);
  const validParams =
    Number.isFinite(totalNum) && totalNum > 0 && currency.trim() && startDate.trim();

  const preview = useMemo(() => {
    const template = buildTemplate();
    if (!template || !validParams) return null;
    try {
      return expandToSlots(template, {
        totalAmount: totalNum,
        currency: currency.trim().toUpperCase(),
        startDate,
      });
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId, months, quarters, totalAmount, currency, startDate]);

  const handleApply = async () => {
    const template = buildTemplate();
    if (!template) {
      toast.error('Pick a template');
      return;
    }
    if (!validParams) {
      toast.error('Fill total amount, currency and start date');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchAuthed('/api/refrens/invoices/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          template,
          totalAmount: totalNum,
          currency: currency.trim().toUpperCase(),
          startDate,
        }),
      });
      const data = (await res.json()) as { invoices?: ProjectInvoice[]; error?: string };
      if (!res.ok || !Array.isArray(data.invoices)) {
        throw new Error(data.error || `Failed (${res.status})`);
      }
      toast.success(
        `Added ${data.invoices.length} slot${data.invoices.length === 1 ? '' : 's'}`
      );
      onApplied(data.invoices);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply template');
    } finally {
      setSubmitting(false);
    }
  };

  const isMonthlyOrQuarterly = presetId === 'monthly' || presetId === 'quarterly';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Apply payment template
          </DialogTitle>
          <DialogDescription>
            Generates a set of empty slots from a preset. New slots are appended — your existing
            slots stay as they are.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Template</Label>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_TEMPLATE_OPTIONS.map((opt) => {
                const selected = presetId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPresetId(opt.id)}
                    className={`text-left p-3 rounded-md border transition-colors ${
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/40'
                    }`}
                  >
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{opt.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {isMonthlyOrQuarterly && (
            <div className="space-y-2">
              <Label htmlFor="periods">
                {presetId === 'monthly' ? 'Number of months' : 'Number of quarters'}
              </Label>
              <Input
                id="periods"
                type="number"
                min={1}
                max={presetId === 'monthly' ? 36 : 12}
                value={presetId === 'monthly' ? months : quarters}
                onChange={(e) => {
                  const v = Math.max(1, Number(e.target.value) || 1);
                  if (presetId === 'monthly') setMonths(v);
                  else setQuarters(v);
                }}
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-2 col-span-2">
              <Label htmlFor="total">Total amount</Label>
              <Input
                id="total"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="50000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="uppercase"
                maxLength={3}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="start">Start date</Label>
            <Input
              id="start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          {preview && (
            <div className="rounded-md border bg-muted/20 p-3 space-y-1">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Preview · {preview.length} slot{preview.length === 1 ? '' : 's'}
              </div>
              <div className="space-y-1 max-h-44 overflow-y-auto">
                {preview.map((slot, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs gap-3 py-0.5"
                  >
                    <span className="truncate flex-1">{slot.label}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatAmount(slot.expectedAmount ?? 0, slot.expectedCurrency ?? currency)}
                    </span>
                    <span className="text-muted-foreground w-24 text-right">
                      {formatDate(slot.expectedDueDate ?? null)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={submitting || !preview}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Apply template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
