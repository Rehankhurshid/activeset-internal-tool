'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  CheckCircle2,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ProjectReviewToggle } from './ProjectReviewToggle';
import type { Project } from '@/types';
import { isReviewedToday, getReviewStatus, todayIso } from '@/lib/review-status';
import { cn } from '@/lib/utils';

interface DailyReviewBannerProps {
  /** All projects shown on the dashboard. The banner filters to current ones internally. */
  projects: Project[];
  className?: string;
}

type BannerPosition = 'top' | 'bottom';
const POSITION_STORAGE_KEY = 'projectLinks.dailyReviewBanner.position';

/** Sort: never reviewed first, then most overdue, then most recently reviewed last. */
function sortForReview(a: Project, b: Project): number {
  const aStatus = getReviewStatus(a);
  const bStatus = getReviewStatus(b);
  const order: Record<string, number> = {
    never: 0,
    overdue: 1,
    stale: 2,
    recent: 3,
    today: 4,
  };
  return order[aStatus] - order[bStatus];
}

export function DailyReviewBanner({ projects, className }: DailyReviewBannerProps) {
  const [reviewIndex, setReviewIndex] = React.useState(0);
  const [position, setPosition] = React.useState<BannerPosition>('top');

  // Pick up the saved position on mount. SSR-safe because we don't touch
  // localStorage during render.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(POSITION_STORAGE_KEY);
    if (stored === 'top' || stored === 'bottom') setPosition(stored);
  }, []);

  const togglePosition = () => {
    setPosition((p) => {
      const next: BannerPosition = p === 'top' ? 'bottom' : 'top';
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(POSITION_STORAGE_KEY, next);
      }
      return next;
    });
  };

  // Local-TZ "today" — the banner resets at the user's midnight, not UTC's.
  const today = todayIso();

  // "Live" projects = current + tagged. Untagged-current projects fall outside
  // both the Maintenance and Active dashboard buckets, so the user doesn't think
  // of them as live work — and we shouldn't pester them for a daily review.
  const currentProjects = React.useMemo(
    () =>
      projects.filter(p => {
        const status = p.status ?? 'current';
        if (status !== 'current') return false;
        return (p.tags?.length ?? 0) > 0;
      }),
    [projects],
  );
  const total = currentProjects.length;

  const reviewedTodayCount = React.useMemo(
    () => currentProjects.filter(p => isReviewedToday(p, today)).length,
    [currentProjects, today],
  );

  const pending = React.useMemo(
    () =>
      currentProjects
        .filter(p => !isReviewedToday(p, today))
        .sort(sortForReview),
    [currentProjects, today],
  );

  const allDone = total > 0 && pending.length === 0;

  // Hide entirely only if there's nothing to track (no live projects).
  if (total === 0) return null;

  // Clamp the displayed pending project to the bounds of the current pending list.
  const safeIndex = Math.min(reviewIndex, Math.max(0, pending.length - 1));
  const focused = pending[safeIndex];
  const focusedControlHref = focused ? `/modules/project-links/${focused.id}?tab=control` : '#';

  const progress = total === 0 ? 0 : Math.round((reviewedTodayCount / total) * 100);

  const positionButton = (
    <Button
      variant="ghost"
      size="icon"
      onClick={togglePosition}
      aria-label={position === 'top' ? 'Move banner to bottom' : 'Move banner to top'}
      title={position === 'top' ? 'Move to bottom' : 'Move to top'}
      className="h-7 w-7 text-muted-foreground hover:text-foreground"
    >
      {position === 'top' ? (
        <ArrowDownToLine className="h-3.5 w-3.5" />
      ) : (
        <ArrowUpToLine className="h-3.5 w-3.5" />
      )}
    </Button>
  );

  let inner: React.ReactNode;
  if (allDone) {
    inner = (
      <div
        className={cn(
          'relative overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent p-3',
          // At the bottom we get a backdrop blur for legibility over scrolled cards.
          position === 'bottom' && 'backdrop-blur-md bg-background/85',
        )}
        role="status"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 shrink-0">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              All caught up for today · {total}/{total}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Resets at midnight. Nice work — see you tomorrow.
            </p>
          </div>
          {positionButton}
        </div>
      </div>
    );
  } else {
    inner = (
      <div
        className={cn(
          'relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-r from-primary/5 via-primary/[0.02] to-transparent p-4',
          position === 'bottom' && 'backdrop-blur-md bg-background/85 shadow-lg',
        )}
        role="region"
        aria-label="Daily project reviews"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-foreground">
                  Daily reviews · {reviewedTodayCount} of {total} done
                </p>
                <span className="text-xs text-muted-foreground">
                  ({pending.length} pending)
                </span>
              </div>
              <Progress value={progress} className="mt-2 h-1.5" />
              {focused && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Up next:{' '}
                  <Link
                    href={focusedControlHref}
                    className="font-medium text-foreground underline-offset-4 hover:underline hover:text-primary inline-flex items-center gap-0.5"
                    aria-label={`Open ${focused.name} control tab`}
                  >
                    {focused.name}
                    <ChevronRight className="h-3 w-3 opacity-70" />
                  </Link>
                </p>
              )}
            </div>
          </div>

          {focused && (
            <div className="flex items-center gap-2 shrink-0">
              <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                <Link href={focusedControlHref}>
                  Open Control
                  <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                </Link>
              </Button>
              <ProjectReviewToggle project={focused} variant="button" />
              {pending.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReviewIndex((i) => (i + 1) % pending.length)}
                  className="h-8 text-xs"
                  aria-label="Skip to next pending review"
                >
                  Skip
                </Button>
              )}
              {positionButton}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Bottom layout: fixed dock + spacer in flow so cards don't hide under it.
  if (position === 'bottom') {
    return (
      <>
        {/* Spacer keeps the page from clipping behind the fixed dock */}
        <div aria-hidden className="h-24" />
        <div
          className={cn(
            'fixed bottom-0 left-0 right-0 z-40 px-4 sm:px-6 lg:px-8 pb-4 pointer-events-none',
            className,
          )}
        >
          <div className="container mx-auto pointer-events-auto">{inner}</div>
        </div>
      </>
    );
  }

  return <div className={className}>{inner}</div>;
}
