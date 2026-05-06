'use client';

import React from 'react';
import { Check, Flame, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import type { Project } from '@/types';
import { projectsService } from '@/services/database';
import { useAuth } from '@/modules/auth-access';
import { getReviewStatus, isReviewedToday, daysSinceReview } from '@/lib/review-status';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ProjectReviewToggleProps {
  project: Project;
  /** Compact pill (in card header) vs full button (in card footer / banner). */
  variant?: 'pill' | 'button';
  className?: string;
}

const STATUS_COLORS: Record<string, { dot: string; text: string; ring: string; bg: string }> = {
  today: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-400',
    ring: 'border-emerald-500/30',
    bg: 'bg-emerald-500/10',
  },
  recent: {
    dot: 'bg-amber-500',
    text: 'text-amber-400',
    ring: 'border-amber-500/30',
    bg: 'bg-amber-500/10',
  },
  stale: {
    dot: 'bg-amber-600',
    text: 'text-amber-500',
    ring: 'border-amber-500/40',
    bg: 'bg-amber-500/10',
  },
  overdue: {
    dot: 'bg-rose-500',
    text: 'text-rose-400',
    ring: 'border-rose-500/30',
    bg: 'bg-rose-500/10',
  },
  never: {
    dot: 'bg-muted-foreground/40',
    text: 'text-muted-foreground',
    ring: 'border-border',
    bg: 'bg-muted/30',
  },
};

function statusLabel(project: Project): string {
  const status = getReviewStatus(project);
  if (status === 'today') return 'Reviewed today';
  if (status === 'never') return 'Not yet reviewed';
  const d = daysSinceReview(project) ?? 0;
  if (d === 1) return 'Reviewed yesterday';
  return `Reviewed ${d} days ago`;
}

export function ProjectReviewToggle({
  project,
  variant = 'pill',
  className,
}: ProjectReviewToggleProps) {
  const { user } = useAuth();
  const [isPending, setIsPending] = React.useState(false);
  const reviewedToday = isReviewedToday(project);
  const status = getReviewStatus(project);
  const colors = STATUS_COLORS[status];
  const streak = project.reviewStreak ?? 0;

  const handleToggle = async () => {
    if (!user?.email) return;
    setIsPending(true);
    try {
      if (reviewedToday) {
        await projectsService.unmarkProjectReviewed(project.id);
        toast.success(`Undid today's review of ${project.name}`);
      } else {
        await projectsService.markProjectReviewed(project.id, user.email);
        toast.success(`${project.name} marked as reviewed`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Could not update review');
    } finally {
      setIsPending(false);
    }
  };

  const tooltipText = reviewedToday
    ? `Reviewed today by ${project.lastReviewedBy ?? 'someone'}. Click to undo.`
    : `${statusLabel(project)}. Click to mark reviewed today.`;

  if (variant === 'button') {
    return (
      <Button
        variant={reviewedToday ? 'outline' : 'default'}
        size="sm"
        onClick={handleToggle}
        disabled={isPending}
        className={cn(
          'h-8 text-xs gap-1.5',
          reviewedToday && cn(colors.bg, colors.text, colors.ring),
          className,
        )}
        aria-label={tooltipText}
      >
        {reviewedToday ? (
          <>
            <Undo2 className="h-3.5 w-3.5" />
            Undo review
          </>
        ) : (
          <>
            <Check className="h-3.5 w-3.5" />
            Mark reviewed
          </>
        )}
        {streak > 1 && (
          <span className="inline-flex items-center gap-0.5 ml-1 text-[10px] font-semibold opacity-90">
            <Flame className="h-3 w-3" /> {streak}
          </span>
        )}
      </Button>
    );
  }

  // Pill variant — small, fits in the header badge row
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleToggle}
            disabled={isPending}
            aria-label={tooltipText}
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0 h-[18px] text-[10px] font-medium rounded-full border transition-all',
              'hover:scale-105 active:scale-95 disabled:opacity-60',
              colors.bg,
              colors.text,
              colors.ring,
              className,
            )}
          >
            <span
              className={cn(
                'inline-block w-1.5 h-1.5 rounded-full',
                colors.dot,
                status === 'overdue' && 'animate-pulse',
              )}
            />
            {reviewedToday ? (
              <>
                <Check className="w-2.5 h-2.5" />
                Today
              </>
            ) : status === 'never' ? (
              'Review'
            ) : (
              `${daysSinceReview(project)}d`
            )}
            {streak > 1 && reviewedToday && (
              <span className="inline-flex items-center gap-0.5 ml-0.5">
                <Flame className="w-2.5 h-2.5" />
                {streak}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
