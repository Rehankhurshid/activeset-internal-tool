import { cn } from '@/lib/utils';
import {
  PORTAL_MILESTONE_LABELS,
  type PortalMilestoneStatus,
  type PortalPhaseView,
} from '../../domain/client-portal.types';
import { formatDateRange } from './portal-format';
import { PortalSectionHeading } from './PortalSectionHeading';

const DOT: Record<PortalMilestoneStatus, string> = {
  done: 'bg-emerald-500',
  in_progress: 'bg-primary ring-4 ring-primary/15',
  upcoming: 'border-2 border-border bg-card',
  on_hold: 'bg-amber-400',
};

interface PortalPlanProps {
  phases: PortalPhaseView[];
  now: Date;
}

/** "Plan": every phase that has at least one client-visible milestone. */
export function PortalPlan({ phases, now }: PortalPlanProps) {
  const withMilestones = phases.filter((phase) => phase.milestones.length > 0);

  return (
    <section aria-labelledby="portal-plan-heading" className="space-y-5">
      <PortalSectionHeading id="portal-plan-heading">Plan</PortalSectionHeading>

      {withMilestones.length === 0 ? (
        <p className="text-sm text-muted-foreground">Your plan will appear here once kickoff is done.</p>
      ) : (
        withMilestones.map((phase) => (
          <div key={phase.id} className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-semibold text-foreground">{phase.title}</h3>
              {phase.isCurrent && (
                <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                  Current
                </span>
              )}
            </div>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {phase.milestones.map((milestone) => {
                const done = milestone.status === 'done';
                const meta = [
                  formatDateRange(milestone.startDate, milestone.endDate, now),
                  PORTAL_MILESTONE_LABELS[milestone.status],
                ].filter(Boolean);
                return (
                  <li key={milestone.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                    <span aria-hidden="true" className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', DOT[milestone.status])} />
                    <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:justify-between sm:gap-4">
                      <p
                        className={cn(
                          'text-sm font-medium',
                          // Opacity would composite the whole row, dropping the
                          // meta line to ~2.6:1 on white — unreadable on a phone
                          // outdoors, and most rows are "done" late in a project.
                          done ? 'text-muted-foreground' : 'text-foreground',
                        )}
                      >
                        {milestone.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground sm:mt-0 sm:shrink-0 sm:text-right">
                        {meta.join(' · ')}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
