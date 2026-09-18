import type { Tone } from '@/lib/ui-tones';
import { PAGE_WORK_STATUSES, type PageWorkStatus } from '../../domain/delivery.types';

/**
 * Colour and shorthand for a page's work status.
 *
 * The grid is read across a row at a glance — "is this page done?" — so every
 * status has to be distinguishable without reading the word. The short labels
 * are the ones the team already types into the sheets ("WIP", "N/R",
 * "Completed"), which is why they are not the long labels from the domain.
 */
export interface PageStatusTone {
  /** Shared palette tone, for chips and counters outside the grid. */
  tone: Tone;
  /** The grid cell itself: fill + text + hover. */
  cell: string;
  /** Dot used in the status menu and the header strip. */
  dot: string;
  /** Bar fill for the per-discipline mini-counts. */
  bar: string;
}

export const PAGE_STATUS_TONES: Record<PageWorkStatus, PageStatusTone> = {
  not_started: {
    tone: 'muted',
    cell: 'text-muted-foreground/60 hover:bg-muted/60',
    dot: 'bg-muted-foreground/30',
    bar: 'bg-muted-foreground/30',
  },
  in_progress: {
    tone: 'amber',
    cell: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20',
    dot: 'bg-amber-500',
    bar: 'bg-amber-500',
  },
  blocked: {
    tone: 'rose',
    cell: 'bg-rose-500/10 text-rose-600 dark:text-rose-300 hover:bg-rose-500/20',
    dot: 'bg-rose-500',
    bar: 'bg-rose-500',
  },
  in_review: {
    tone: 'violet',
    cell: 'bg-violet-500/10 text-violet-600 dark:text-violet-300 hover:bg-violet-500/20',
    dot: 'bg-violet-500',
    bar: 'bg-violet-500',
  },
  completed: {
    tone: 'emerald',
    cell: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/20',
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-500',
  },
  not_required: {
    // Struck through, not coloured: settled, but not an achievement.
    tone: 'muted',
    cell: 'text-muted-foreground/50 line-through decoration-muted-foreground/50 hover:bg-muted/60',
    dot: 'bg-muted-foreground/25',
    bar: 'bg-muted-foreground/25',
  },
};

/** What the cell shows. Space is scarce; these are the sheet's own words. */
export const PAGE_STATUS_SHORT_LABELS: Record<PageWorkStatus, string> = {
  not_started: '–',
  in_progress: 'WIP',
  blocked: 'Blocked',
  in_review: 'Review',
  completed: 'Done',
  not_required: 'N/R',
};

/** Digit that sets each status from the keyboard, derived from the domain order. */
export const PAGE_STATUS_KEYS: Record<PageWorkStatus, string> = PAGE_WORK_STATUSES.reduce(
  (acc, status, index) => {
    acc[status] = String(index + 1);
    return acc;
  },
  {} as Record<PageWorkStatus, string>,
);

/** `'3'` → `'blocked'`. Anything outside 1–6 is not a status. */
export function statusForDigit(digit: string): PageWorkStatus | undefined {
  if (!/^[0-9]$/.test(digit)) return undefined;
  return PAGE_WORK_STATUSES[Number(digit) - 1];
}
