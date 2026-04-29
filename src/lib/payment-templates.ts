import type { CreateSlotInput } from '@/modules/invoices/domain/types';

/**
 * Payment template — a deterministic recipe for splitting a total invoice
 * amount across one or more invoice slots. Used in two places:
 *
 *  1. The Invoices tab → "Apply template" turns a template into slots on the
 *     current project.
 *  2. The Proposal editor → "Payment terms" stores a template + total so the
 *     project can later import the same plan as slots.
 *
 * Both call into {@link expandToSlots}, so a 50/50 in a proposal produces
 * exactly the same slots as a 50/50 applied directly. Predictable.
 */
export type PaymentTemplate =
  | { kind: 'one-time' }
  | { kind: 'split'; percentages: number[] }
  | { kind: 'monthly'; months: number }
  | { kind: 'quarterly'; quarters: number }
  | { kind: 'custom'; items: PaymentTemplateCustomItem[] };

export interface PaymentTemplateCustomItem {
  label: string;
  /** One of `percentage` or `amount` must be set. */
  percentage?: number;
  amount?: number;
  /** Days after `startDate` the slot is due. Omit for no due date. */
  dueOffsetDays?: number;
}

export interface ExpandParams {
  totalAmount: number;
  currency: string;
  /** ISO date `YYYY-MM-DD`. Anchors the first slot's due date. */
  startDate: string;
}

function isoToParts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Invalid ISO date: ${iso}`);
  return { y, m, d };
}

function partsToIso(y: number, m: number, d: number): string {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toISOString().slice(0, 10);
}

/**
 * Adds N months to an ISO date. Clamps day-of-month if the target month is
 * shorter (e.g. Jan 31 + 1 month → Feb 28/29).
 */
export function addMonthsIso(iso: string, months: number): string {
  const { y, m, d } = isoToParts(iso);
  const targetMonth0 = m - 1 + months; // 0-indexed, can be negative or >11
  const targetYear = y + Math.floor(targetMonth0 / 12);
  const normalizedMonth0 = ((targetMonth0 % 12) + 12) % 12;
  // Days in target month (months are 1-indexed for Date(UTC,year,monthIndex,0))
  const daysInTarget = new Date(Date.UTC(targetYear, normalizedMonth0 + 1, 0)).getUTCDate();
  const day = Math.min(d, daysInTarget);
  return partsToIso(targetYear, normalizedMonth0 + 1, day);
}

export function addDaysIso(iso: string, days: number): string {
  const { y, m, d } = isoToParts(iso);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Splits an amount into N positive parts that sum exactly to `total`. Any
 * sub-cent remainder lands on the last part so the slots add up to the total
 * the user typed.
 */
function distributeAmount(total: number, count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [roundCurrency(total)];
  const each = Math.floor((total * 100) / count) / 100;
  const remainder = roundCurrency(total - each * count);
  return Array.from({ length: count }, (_, i) =>
    i === count - 1 ? roundCurrency(each + remainder) : each
  );
}

export interface PresetTemplateOption {
  id: string;
  label: string;
  description: string;
  /** A factory because some presets need user-supplied parameters
   *  (months, quarters, percentages). UI fills these in. */
  template: PaymentTemplate | null;
}

/** Built-in presets exposed by the UI dropdown. */
export const PRESET_TEMPLATE_OPTIONS: PresetTemplateOption[] = [
  {
    id: 'one-time',
    label: 'One-time (100%)',
    description: 'Single payment due at start',
    template: { kind: 'one-time' },
  },
  {
    id: 'split-50-50',
    label: '50 / 50',
    description: 'Half upfront, half on completion',
    template: { kind: 'split', percentages: [50, 50] },
  },
  {
    id: 'split-30-40-30',
    label: '30 / 40 / 30',
    description: 'Three milestones',
    template: { kind: 'split', percentages: [30, 40, 30] },
  },
  {
    id: 'split-40-60',
    label: '40 / 60',
    description: 'Lighter upfront, balance on completion',
    template: { kind: 'split', percentages: [40, 60] },
  },
  {
    id: 'monthly',
    label: 'Monthly retainer',
    description: 'N equal monthly slots',
    template: null, // requires `months` input
  },
  {
    id: 'quarterly',
    label: 'Quarterly retainer',
    description: 'N equal quarterly slots',
    template: null, // requires `quarters` input
  },
];

export function expandToSlots(
  template: PaymentTemplate,
  params: ExpandParams
): CreateSlotInput[] {
  const { totalAmount, currency, startDate } = params;
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error('totalAmount must be a positive number');
  }
  if (!currency) throw new Error('currency is required');
  if (!startDate) throw new Error('startDate is required');

  switch (template.kind) {
    case 'one-time':
      return [
        {
          label: 'Full payment',
          expectedAmount: roundCurrency(totalAmount),
          expectedCurrency: currency,
          expectedDueDate: startDate,
        },
      ];

    case 'split': {
      const sum = template.percentages.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > 0.01) {
        throw new Error(`Split percentages must sum to 100, got ${sum}`);
      }
      const amounts = template.percentages.map((pct) => roundCurrency((totalAmount * pct) / 100));
      // Push any rounding diff onto the last slot so totals match
      const computedSum = amounts.reduce((a, b) => a + b, 0);
      const diff = roundCurrency(totalAmount - computedSum);
      if (diff !== 0 && amounts.length > 0) {
        amounts[amounts.length - 1] = roundCurrency(amounts[amounts.length - 1] + diff);
      }
      return template.percentages.map((pct, i) => ({
        label: `Payment ${i + 1} of ${template.percentages.length} (${pct}%)`,
        expectedAmount: amounts[i],
        expectedCurrency: currency,
        // First slot due at start; subsequent slots have no due date and can be
        // edited per-slot (they're typically tied to deliverable milestones).
        expectedDueDate: i === 0 ? startDate : null,
      }));
    }

    case 'monthly': {
      const n = template.months;
      if (!Number.isInteger(n) || n < 1) throw new Error('months must be ≥ 1');
      const amounts = distributeAmount(totalAmount, n);
      return amounts.map((amt, i) => ({
        label: `Month ${i + 1} of ${n}`,
        expectedAmount: amt,
        expectedCurrency: currency,
        expectedDueDate: addMonthsIso(startDate, i),
      }));
    }

    case 'quarterly': {
      const n = template.quarters;
      if (!Number.isInteger(n) || n < 1) throw new Error('quarters must be ≥ 1');
      const amounts = distributeAmount(totalAmount, n);
      return amounts.map((amt, i) => ({
        label: `Quarter ${i + 1} of ${n}`,
        expectedAmount: amt,
        expectedCurrency: currency,
        expectedDueDate: addMonthsIso(startDate, i * 3),
      }));
    }

    case 'custom': {
      if (template.items.length === 0) throw new Error('custom template needs at least one item');
      return template.items.map((item, i) => {
        let amount: number;
        if (item.amount != null) {
          amount = item.amount;
        } else if (item.percentage != null) {
          amount = (totalAmount * item.percentage) / 100;
        } else {
          throw new Error(`Custom item ${i + 1}: must specify amount or percentage`);
        }
        return {
          label: item.label,
          expectedAmount: roundCurrency(amount),
          expectedCurrency: currency,
          expectedDueDate:
            item.dueOffsetDays != null ? addDaysIso(startDate, item.dueOffsetDays) : null,
        };
      });
    }
  }
}

/** Render a short human label for a template, used in proposal previews etc. */
export function describeTemplate(template: PaymentTemplate): string {
  switch (template.kind) {
    case 'one-time':
      return 'One-time payment';
    case 'split':
      return `${template.percentages.join(' / ')}`;
    case 'monthly':
      return `Monthly × ${template.months}`;
    case 'quarterly':
      return `Quarterly × ${template.quarters}`;
    case 'custom':
      return `Custom (${template.items.length} item${template.items.length === 1 ? '' : 's'})`;
  }
}
