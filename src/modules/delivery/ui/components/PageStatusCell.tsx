'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  PAGE_WORK_STATUSES,
  PAGE_WORK_STATUS_LABELS,
  type PageWorkStatus,
} from '../../domain/delivery.types';
import {
  PAGE_STATUS_KEYS,
  PAGE_STATUS_SHORT_LABELS,
  PAGE_STATUS_TONES,
  statusForDigit,
} from './delivery-tones';

export interface PageStatusCellProps {
  status: PageWorkStatus;
  pageTitle: string;
  disciplineLabel: string;
  /** Writes through to Firestore. Rejecting reverts the optimistic value. */
  onChange: (next: PageWorkStatus) => Promise<void>;
  /** `data-grid-cell`, so the grid can put focus back after an arrow key. */
  cellId: string;
  /** Roving tabindex: exactly one cell in the grid is tabbable. */
  tabIndex: number;
  onFocus: () => void;
  /** dx/dy in cells. The grid clamps and decides what is next. */
  onNavigate: (dx: number, dy: number) => void;
}

/**
 * One discipline's status on one page — the cell the team spends the day in.
 *
 * Clicking opens the full list rather than cycling: a spreadsheet user reaching
 * for "Blocked" should not have to click four times past it, and a mis-click
 * that silently advances a status is worse than one that opens a menu. Speed
 * comes from the keyboard instead — arrows to move, 1–6 to set, no menu at all.
 *
 * The write is optimistic. Firestore's own snapshot round-trip is ~100ms on a
 * good connection and unbounded on a bad one, and a grid that lags behind the
 * keyboard is a grid people stop trusting.
 */
export function PageStatusCell({
  status,
  pageTitle,
  disciplineLabel,
  onChange,
  cellId,
  tabIndex,
  onFocus,
  onNavigate,
}: PageStatusCellProps) {
  const [open, setOpen] = useState(false);
  const [optimistic, setOptimistic] = useState<PageWorkStatus | null>(null);

  // Clear the optimistic value once the subscription catches up. Comparing to
  // the incoming status rather than clearing on every render keeps a slow write
  // from flickering back to the old value in between.
  useEffect(() => {
    setOptimistic((pending) => (pending === null || pending === status ? null : pending));
  }, [status]);

  const shown = optimistic ?? status;
  const tone = PAGE_STATUS_TONES[shown];

  const apply = (next: PageWorkStatus) => {
    setOpen(false);
    if (next === shown) return;
    setOptimistic(next);
    void onChange(next).catch((error) => {
      console.error('[PageStatusCell] failed to set status', error);
      setOptimistic(null);
      toast.error(
        error instanceof Error ? error.message : `Could not set ${disciplineLabel} on ${pageTitle}`,
      );
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        onNavigate(-1, 0);
        return;
      case 'ArrowRight':
        event.preventDefault();
        onNavigate(1, 0);
        return;
      case 'ArrowUp':
        event.preventDefault();
        onNavigate(0, -1);
        return;
      case 'ArrowDown':
        event.preventDefault();
        onNavigate(0, 1);
        return;
      case 'Backspace':
      case 'Delete':
        event.preventDefault();
        apply('not_started');
        return;
      default:
        break;
    }

    const next = statusForDigit(event.key);
    if (next) {
      event.preventDefault();
      apply(next);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-grid-cell={cellId}
          tabIndex={tabIndex}
          onFocus={onFocus}
          onKeyDown={handleKeyDown}
          aria-label={`${disciplineLabel} on ${pageTitle}: ${PAGE_WORK_STATUS_LABELS[shown]}`}
          className={cn(
            'flex h-7 w-full min-w-[68px] items-center justify-center rounded px-1.5 text-[11px] font-medium',
            'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
            tone.cell,
          )}
        >
          {PAGE_STATUS_SHORT_LABELS[shown]}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-48 p-1">
        <p className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {disciplineLabel}
        </p>
        {PAGE_WORK_STATUSES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => apply(value)}
            className={cn(
              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
              value === shown && 'bg-accent/60 font-medium',
            )}
          >
            <span className={cn('size-2 shrink-0 rounded-full', PAGE_STATUS_TONES[value].dot)} />
            <span className="flex-1 truncate">{PAGE_WORK_STATUS_LABELS[value]}</span>
            <kbd className="rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
              {PAGE_STATUS_KEYS[value]}
            </kbd>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
