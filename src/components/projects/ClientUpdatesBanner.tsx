'use client';

import React from 'react';
import Link from 'next/link';
import { BellRing, ChevronRight } from 'lucide-react';
import type { Project } from '@/types';
import { PORTAL_STALE_AFTER_DAYS, daysSinceClientUpdate, isPortalStale } from '@/modules/client-portal';
import { todayIso } from '@/lib/review-status';
import { cn } from '@/lib/utils';

interface ClientUpdatesBannerProps {
  /** All projects shown on the dashboard. The banner filters to stale portals internally. */
  projects: Project[];
  className?: string;
}

const MAX_NAMED = 3;

/**
 * Compact nudge: client portals that are enabled but have had no team update
 * for more than PORTAL_STALE_AFTER_DAYS days (or never). Same visual family as
 * DailyReviewBanner, but a single row with no position toggle. Renders nothing
 * when every portal is fresh.
 */
export function ClientUpdatesBanner({ projects, className }: ClientUpdatesBannerProps) {
  // Local-TZ "today" so the threshold flips at the user's midnight.
  const today = todayIso();

  // Never-updated portals first, then the longest-neglected.
  const stale = React.useMemo(() => {
    const age = (p: Project) => daysSinceClientUpdate(p.clientFacing, today) ?? Number.POSITIVE_INFINITY;
    return projects
      .filter(p => isPortalStale(p, today))
      .sort((a, b) => age(b) - age(a));
  }, [projects, today]);

  if (stale.length === 0) return null;

  const named = stale.slice(0, MAX_NAMED);
  const extra = stale.length - named.length;
  const noun = stale.length === 1 ? 'portal' : 'portals';

  return (
    <div className={className}>
      <div
        role="region"
        aria-label="Client portal updates due"
        className={cn(
          'relative overflow-hidden rounded-xl border border-amber-500/30 p-3',
          'bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent',
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300">
            <BellRing className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-semibold text-foreground">
              Client updates due
              <span className="font-normal text-muted-foreground">
                {' '}· {stale.length} {noun} not updated in {PORTAL_STALE_AFTER_DAYS}+ days
              </span>
            </p>
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {named.map(project => (
                <Link
                  key={project.id}
                  href={`/modules/project-links/${project.id}?tab=client`}
                  aria-label={`Open ${project.name} client tab`}
                  className="inline-flex max-w-[14rem] items-center gap-0.5 font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                >
                  <span className="truncate">{project.name}</span>
                  <ChevronRight className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
                </Link>
              ))}
              {extra > 0 && <span>+{extra} more</span>}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
