'use client';

import React from 'react';
import { CheckCircle2, ChevronRight, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ProjectReviewToggle } from './ProjectReviewToggle';
import type { Project } from '@/types';
import { isReviewedToday, getReviewStatus } from '@/lib/review-status';
import { cn } from '@/lib/utils';

interface DailyReviewBannerProps {
  /** All projects shown on the dashboard. The banner filters to current ones internally. */
  projects: Project[];
  className?: string;
}

const DISMISS_STORAGE_KEY = 'projectLinks.dailyReviewBanner.dismissedFor';

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
  const [dismissedFor, setDismissedFor] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    setDismissedFor(window.localStorage.getItem(DISMISS_STORAGE_KEY));
  }, []);

  const today = new Date().toISOString().slice(0, 10);

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
  const isDismissed = dismissedFor === today;

  // Hide entirely if there are no current projects to review.
  if (total === 0) return null;
  // If everything is done, briefly celebrate (unless user dismissed). Hide after dismiss.
  if (allDone && isDismissed) return null;
  // If user dismissed and there are still pending, don't show until tomorrow.
  if (isDismissed && !allDone) return null;

  const dismiss = () => {
    setDismissedFor(today);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, today);
    }
  };

  // Clamp the displayed pending project to the bounds of the current pending list.
  const safeIndex = Math.min(reviewIndex, Math.max(0, pending.length - 1));
  const focused = pending[safeIndex];

  const progress = total === 0 ? 0 : Math.round((reviewedTodayCount / total) * 100);

  if (allDone) {
    return (
      <div
        className={cn(
          'relative overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent p-4',
          className,
        )}
        role="status"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">All caught up for today</p>
            <p className="text-xs text-muted-foreground">
              All {total} current {total === 1 ? 'project' : 'projects'} reviewed. Nice work.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={dismiss}
            aria-label="Dismiss banner"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-r from-primary/5 via-primary/[0.02] to-transparent p-4',
        className,
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
                Up next: <span className="font-medium text-foreground">{focused.name}</span>
              </p>
            )}
          </div>
        </div>

        {focused && (
          <div className="flex items-center gap-2 shrink-0">
            <ProjectReviewToggle project={focused} variant="button" />
            {pending.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReviewIndex((i) => (i + 1) % pending.length)}
                className="h-8 text-xs"
                aria-label="Skip to next pending review"
              >
                Skip
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={dismiss}
              aria-label="Dismiss banner until tomorrow"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
