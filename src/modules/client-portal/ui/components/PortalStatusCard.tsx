import type { ClientPortalView } from '../../domain/client-portal.types';
import { formatDateRange, formatRelativeDay } from './portal-format';
import { PortalPhaseStepper } from './PortalPhaseStepper';
import { PortalSectionHeading } from './PortalSectionHeading';
import { PortalStatusChip } from './PortalStatusChip';

interface PortalStatusCardProps {
  view: ClientPortalView;
  now: Date;
}

/** "Where we are": status, note, phase stepper, next milestone, progress, freshness. */
export function PortalStatusCard({ view, now }: PortalStatusCardProps) {
  const { phases, currentPhase, nextMilestone, progress } = view;
  const realPhaseCount = phases.filter((phase) => !phase.ungrouped).length;
  const allDone = progress.total > 0 && progress.done === progress.total;
  const currentIndex = currentPhase?.index ?? (allDone ? realPhaseCount : -1);
  const relative = formatRelativeDay(view.lastUpdateAt, now);
  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const nextRange = nextMilestone ? formatDateRange(nextMilestone.startDate, nextMilestone.endDate, now) : '';

  return (
    <section
      aria-labelledby="portal-status-heading"
      className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7"
    >
      <PortalSectionHeading id="portal-status-heading" variant="eyebrow">
        Where we are
      </PortalSectionHeading>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <PortalStatusChip status={view.status} label={view.statusLabel} />
        {relative && <p className="text-sm text-muted-foreground">Last update {relative}</p>}
      </div>

      {view.statusNote && <p className="mt-4 max-w-prose text-base leading-relaxed text-foreground">{view.statusNote}</p>}

      {(realPhaseCount > 0 || currentPhase || nextMilestone) && (
        <div className="mt-6 space-y-4 border-t border-border pt-6">
          <PortalPhaseStepper phases={phases} currentIndex={currentIndex} />
          {(currentPhase || nextMilestone) && (
            <div className="space-y-1.5 text-sm text-muted-foreground">
              {currentPhase && (
                <p>
                  Phase {currentPhase.index + 1} of {currentPhase.total} ·{' '}
                  <span className="font-medium text-foreground">{currentPhase.title}</span>
                </p>
              )}
              {nextMilestone && (
                <p>
                  Next: <span className="font-medium text-foreground">{nextMilestone.title}</span>
                  {nextRange && ` · ${nextRange}`}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {progress.total > 0 && (
        <div className="mt-6">
          <div
            role="progressbar"
            aria-label="Milestones done"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {progress.done} of {progress.total} milestones done
          </p>
        </div>
      )}
    </section>
  );
}
