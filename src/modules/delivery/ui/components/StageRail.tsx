'use client';

import { useEffect, useRef } from 'react';
import { Check, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ArcEntry } from '../../domain/delivery.arc';

/**
 * The arc as a rail: every stage of the project's own SOP, in order.
 *
 * One scrolling strip rather than a row of equal buttons, because a Webflow
 * build has eleven stages and this gets used on a phone. Each chip carries its
 * own progress, so the rail answers "where is this project" without opening a
 * stage, and the active one is scrolled into view when it changes — with eleven
 * stages the one you just picked is often off-screen.
 */

export interface StageRailProps {
  arc: ArcEntry[];
  activeKey: string;
  onSelect: (key: string) => void;
  /**
   * Stage key → whether the gate before it is open. Closed stages are still
   * selectable; the lock says what is waiting, it does not trap anyone.
   */
  openByKey?: Record<string, boolean>;
  /** The page grid's own count, which is pages built rather than items ticked. */
  pagesProgress?: { done: number; total: number } | null;
}

export function StageRail({ arc, activeKey, onSelect, openByKey, pagesProgress }: StageRailProps) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // Scrolled by hand rather than with scrollIntoView, which would also scroll
  // the page: the stage you just picked is already in front of you, and the page
  // jumping under it on a phone is worse than a chip off-screen.
  useEffect(() => {
    const rail = railRef.current;
    const chip = activeRef.current;
    if (!rail || !chip) return;

    // Brought to the left edge, not centred. The chips carry `snap-start`, so a
    // scroll that lands anywhere else is pulled back here by the browser
    // anyway; aiming at the centre only made the code disagree with the result.
    // A small lead-in keeps a sliver of the previous stage visible, which is
    // what tells you the rail scrolls at all.
    const LEAD_IN = 24;

    // Measured a frame late, deliberately: on first paint the emoji font is
    // often still loading and every chip measures narrower than it ends up, so
    // the rail concluded there was nothing to scroll and left the stage you are
    // on hanging off the right edge of a phone.
    const frame = requestAnimationFrame(() => {
      const railBox = rail.getBoundingClientRect();
      const chipBox = chip.getBoundingClientRect();
      const delta = chipBox.left - railBox.left - LEAD_IN;
      if (Math.abs(delta) < 1) return;
      rail.scrollTo({ left: Math.max(0, rail.scrollLeft + delta), behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
    // Re-centres when the arc itself changes shape, not only when you pick a
    // stage: a section added on the Checklist tab moves every chip after it.
  }, [activeKey, arc.length]);

  return (
    <div
      ref={railRef}
      role="tablist"
      aria-label="Delivery stages"
      className="-mx-1 flex snap-x gap-1 overflow-x-auto px-1 pb-1"
    >
      {arc.map((entry) => {
        const active = entry.key === activeKey;
        const pages = entry.kind === 'pages';
        const counted = pages ? pagesProgress : entry.progress;
        const complete = pages
          ? Boolean(counted && counted.total > 0 && counted.done === counted.total)
          : entry.progress.complete;
        const blocked = entry.kind === 'section' && entry.progress.blocking.length > 0;
        const locked = openByKey?.[entry.key] === false;

        return (
          <button
            key={entry.key}
            ref={active ? activeRef : undefined}
            type="button"
            role="tab"
            aria-selected={active}
            title={entry.title}
            onClick={() => onSelect(entry.key)}
            className={cn(
              'flex shrink-0 snap-start items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors',
              active
                ? 'border-primary/40 bg-background font-medium text-foreground shadow-sm'
                : 'border-transparent bg-muted/40 text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="font-mono text-[10px] tabular-nums opacity-60">{entry.position}</span>
            <span aria-hidden>{entry.emoji || (pages ? '🧱' : '📋')}</span>
            <span className="max-w-[8rem] truncate sm:max-w-[13rem]">{entry.title}</span>

            {complete ? (
              <Check className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              counted &&
              counted.total > 0 && (
                <span className="font-mono text-[10px] tabular-nums opacity-70">
                  {counted.done}/{counted.total}
                </span>
              )
            )}

            {/* Something here is holding up everything after it — worth seeing
                from the rail, not only once you are inside the stage. */}
            {blocked && (
              <span
                aria-label="has a blocking item"
                className="size-1.5 shrink-0 rounded-full bg-rose-500"
              />
            )}
            {locked && <Lock className="h-3 w-3 shrink-0 opacity-50" />}
          </button>
        );
      })}
    </div>
  );
}
