'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Receipt } from 'lucide-react';
import {
  PRESET_TEMPLATE_OPTIONS,
  defaultHourlyRate,
  expandToSlots,
  type PaymentTemplate,
} from '@/lib/payment-templates';
import type { Proposal } from '@/app/modules/proposal/types/Proposal';

interface PaymentTermsCardProps {
  data: Proposal['data'];
  onUpdate: (next: Partial<Proposal['data']>) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const DEFAULT_PRESET_ID = 'one-time';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function presetIdFromTemplate(template: PaymentTemplate | undefined): string {
  if (!template) return DEFAULT_PRESET_ID;
  if (template.kind === 'one-time') return 'one-time';
  if (template.kind === 'monthly') return 'monthly';
  if (template.kind === 'quarterly') return 'quarterly';
  if (template.kind === 'hourly') return 'hourly';
  if (template.kind === 'split') {
    const key = template.percentages.join('-');
    if (key === '50-50') return 'split-50-50';
    if (key === '30-40-30') return 'split-30-40-30';
    if (key === '40-60') return 'split-40-60';
  }
  return DEFAULT_PRESET_ID;
}

function buildTemplate(
  presetId: string,
  months: number,
  quarters: number,
  hours: number,
  rate: number
): PaymentTemplate | null {
  const preset = PRESET_TEMPLATE_OPTIONS.find((p) => p.id === presetId);
  if (!preset) return null;
  if (preset.template) return preset.template;
  if (preset.id === 'monthly') return { kind: 'monthly', months };
  if (preset.id === 'quarterly') return { kind: 'quarterly', quarters };
  if (preset.id === 'hourly') {
    if (!Number.isFinite(hours) || hours <= 0) return null;
    if (!Number.isFinite(rate) || rate <= 0) return null;
    return { kind: 'hourly', hours, rate };
  }
  return null;
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

export function PaymentTermsCard({
  data,
  onUpdate,
  collapsed,
  onToggleCollapse,
}: PaymentTermsCardProps) {
  const existing = data.paymentTerms;
  const presetId = presetIdFromTemplate(existing?.template);
  const months =
    existing?.template.kind === 'monthly' ? existing.template.months : 6;
  const quarters =
    existing?.template.kind === 'quarterly' ? existing.template.quarters : 4;
  const hoursStored =
    existing?.template.kind === 'hourly' ? existing.template.hours : null;
  const rateStored =
    existing?.template.kind === 'hourly' ? existing.template.rate : null;
  const currency = existing?.currency ?? data.pricing.currency ?? 'INR';
  const fallbackRate = defaultHourlyRate(currency);
  const hours = hoursStored != null ? hoursStored : 0;
  const rate = rateStored != null ? rateStored : (fallbackRate ?? 0);
  const isHourly = presetId === 'hourly';

  const totalAmount = isHourly
    ? (hoursStored != null && rateStored != null ? String(hoursStored * rateStored) : '')
    : (existing?.totalAmount?.toString() ?? '');
  const startDate = existing?.startDate ?? todayIso();

  const totalNum = Number(totalAmount);
  const hasValidTotal = Number.isFinite(totalNum) && totalNum > 0;

  const preview = useMemo(() => {
    if (!existing) return null;
    const template = buildTemplate(presetId, months, quarters, hours, rate);
    if (!template || !hasValidTotal || !currency || !startDate) return null;
    try {
      return expandToSlots(template, { totalAmount: totalNum, currency, startDate });
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, presetId, months, quarters, hours, rate, totalNum, currency, startDate]);

  const writeTerms = (patch: Partial<{
    presetId: string;
    months: number;
    quarters: number;
    hours: number;
    rate: number;
    totalAmount: string;
    currency: string;
    startDate: string;
  }>) => {
    const nextPreset = patch.presetId ?? presetId;
    const nextMonths = patch.months ?? months;
    const nextQuarters = patch.quarters ?? quarters;
    const nextHours = patch.hours ?? hours;
    let nextRate = patch.rate ?? rate;
    const nextCurrency = patch.currency ?? currency;
    const nextStartDate = patch.startDate ?? startDate;

    // When switching to hourly with no rate yet, seed from currency default.
    if (nextPreset === 'hourly' && (!Number.isFinite(nextRate) || nextRate <= 0)) {
      const def = defaultHourlyRate(nextCurrency);
      if (def != null) nextRate = def;
    }

    const template = buildTemplate(nextPreset, nextMonths, nextQuarters, nextHours, nextRate);
    const nextTotalRaw =
      template?.kind === 'hourly'
        ? String(template.hours * template.rate)
        : (patch.totalAmount ?? totalAmount);
    const total = Number(nextTotalRaw);
    if (!template || !Number.isFinite(total) || total <= 0 || !nextCurrency || !nextStartDate) {
      // Not enough info yet — don't commit partial state
      return;
    }
    onUpdate({
      paymentTerms: {
        template,
        totalAmount: total,
        currency: nextCurrency.toUpperCase(),
        startDate: nextStartDate,
      },
    });
  };

  const clearTerms = () => {
    const next: Partial<Proposal['data']> = { paymentTerms: undefined };
    onUpdate(next);
  };

  const isMonthlyOrQuarterly = presetId === 'monthly' || presetId === 'quarterly';

  return (
    <Card id="section-paymentTerms" className="border-border/50">
      <CardHeader className="hover:bg-muted/50 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 cursor-pointer select-none" onClick={onToggleCollapse}>
            <Receipt className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Payment Terms</CardTitle>
            {collapsed ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
          {!collapsed && existing && (
            <Button variant="ghost" size="sm" onClick={clearTerms} className="text-xs">
              Clear
            </Button>
          )}
        </div>
      </CardHeader>
      {!collapsed && (
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Pick how this engagement is billed. The selected template generates the matching
            invoice slots when this proposal is linked to a project.
          </p>

          <div className="space-y-2">
            <Label>Template</Label>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_TEMPLATE_OPTIONS.map((opt) => {
                const selected = presetId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => writeTerms({ presetId: opt.id })}
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
              <Label>{presetId === 'monthly' ? 'Number of months' : 'Number of quarters'}</Label>
              <Input
                type="number"
                min={1}
                max={presetId === 'monthly' ? 36 : 12}
                value={presetId === 'monthly' ? months : quarters}
                onChange={(e) => {
                  const v = Math.max(1, Number(e.target.value) || 1);
                  if (presetId === 'monthly') writeTerms({ months: v });
                  else writeTerms({ quarters: v });
                }}
              />
            </div>
          )}

          {isHourly ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label>Hours</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.25"
                  value={hoursStored ?? ''}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    writeTerms({ hours: Number.isFinite(v) ? v : 0 });
                  }}
                  placeholder="20"
                />
              </div>
              <div className="space-y-2">
                <Label>Hourly rate</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={rateStored ?? ''}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    writeTerms({ rate: Number.isFinite(v) ? v : 0 });
                  }}
                  placeholder={fallbackRate != null ? String(fallbackRate) : '50'}
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Input
                  value={currency}
                  onChange={(e) => writeTerms({ currency: e.target.value })}
                  className="uppercase"
                  maxLength={3}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2 col-span-2">
                <Label>Total amount</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={totalAmount}
                  onChange={(e) => writeTerms({ totalAmount: e.target.value })}
                  placeholder="50000"
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Input
                  value={currency}
                  onChange={(e) => writeTerms({ currency: e.target.value })}
                  className="uppercase"
                  maxLength={3}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Start date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => writeTerms({ startDate: e.target.value })}
            />
          </div>

          {preview && preview.length > 0 && (
            <div className="rounded-md border bg-muted/20 p-3 space-y-1">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Will create {preview.length} slot{preview.length === 1 ? '' : 's'} when linked
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
                      {slot.expectedDueDate ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
