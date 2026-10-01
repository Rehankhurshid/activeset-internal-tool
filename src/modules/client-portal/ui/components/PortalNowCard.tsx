import { CircleCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { showsProcess, type ClientPortalView, type PortalStageView } from '../../domain/client-portal.types';
import { PortalStageDetail } from './PortalStageDetail';
import { formatDay, formatRelativeDay, formatStageDates } from './portal-format';
import { PortalSectionHeading } from './PortalSectionHeading';
import { PortalStatusChip } from './PortalStatusChip';

interface StageTrackProps {
  stages: PortalStageView[];
  label: string;
}

/**
 * One segment per stage: full once done, filled to the percentage while it is
 * the current one. A current stage the checklist does not track has no honest
 * percentage, so it shows as started rather than as a made-up number.
 */
function StageTrack({ stages, label }: StageTrackProps) {
  return (
    <div role="img" aria-label={label} className="flex gap-1">
      {stages.map((stage) => {
        const fill =
          stage.state === 'done'
            ? '100%'
            : stage.state === 'current'
              ? stage.percent !== undefined
                ? `${Math.max(stage.percent, 4)}%`
                : '100%'
              : '0%';
        return (
          <span key={stage.id} className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className={cn(
                'block h-full rounded-full',
                stage.state === 'current' && stage.percent === undefined ? 'bg-primary/30' : 'bg-primary',
              )}
              style={{ width: fill }}
            />
          </span>
        );
      })}
    </div>
  );
}

interface PortalNowCardProps {
  view: ClientPortalView;
  now: Date;
}

/**
 * "Where we are": the stage the project is in, how far through, when it is
 * due, and — right under it — that stage's milestones, meetings and files.
 */
export function PortalNowCard({ view, now }: PortalNowCardProps) {
  const { stages, currentStageIndex } = view;
  const current = currentStageIndex !== undefined ? stages[currentStageIndex] : undefined;
  const next = currentStageIndex !== undefined ? stages[currentStageIndex + 1] : undefined;
  const allDone = stages.length > 0 && current === undefined;
  const relative = formatRelativeDay(view.lastUpdateAt, now);
  const dates = current ? formatStageDates(current.startDate, current.dueDate, now) : '';

  // With the process (from the sheet or the checklist), the full step list sits in "The process" below; here, only the step we are on.
  const sheetMode = showsProcess(view.planSource);
  const steps = current?.steps ?? [];
  const nowIndex = steps.findIndex((step) => step.state !== 'done');
  const nowStep = nowIndex >= 0 ? steps[nowIndex] : undefined;
  const nextStep = nowIndex >= 0 ? steps[nowIndex + 1] : undefined;

  const trackLabel = current
    ? `Stage ${currentStageIndex! + 1} of ${stages.length}: ${current.title}${
        current.percent !== undefined ? `, ${current.percent}% done` : ''
      }`
    : 'Every stage is done';

  return (
    <section aria-labelledby="portal-now-heading" className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <PortalSectionHeading id="portal-now-heading" variant="eyebrow">
          Where we are
        </PortalSectionHeading>
        {relative && <p className="text-xs text-muted-foreground">Updated {relative}</p>}
      </div>

      <div className="mt-4">
        <PortalStatusChip status={view.status} label={view.statusLabel} />
      </div>

      {current && (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-muted-foreground">
            Stage {currentStageIndex! + 1} of {stages.length}
          </p>
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
              {current.title}
            </p>
            {current.percent !== undefined && (
              <p className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                {current.steps?.length
                  ? `${current.steps.filter((step) => step.state === 'done').length} of ${current.steps.length} done`
                  : `${current.percent}%`}
              </p>
            )}
          </div>
          <StageTrack stages={stages} label={trackLabel} />
          {sheetMode && nowStep && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border bg-background px-4 py-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Right now</span>
              <span className="text-sm font-medium text-foreground">{nowStep.title}</span>
              {nowStep.waiting ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Waiting on you</span>
              ) : (
                <span className="text-xs text-muted-foreground">In progress with ActiveSet</span>
              )}
              {nextStep && <span className="basis-full text-xs text-muted-foreground">Then: {nextStep.title}</span>}
            </div>
          )}
          {(dates || next) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {dates && <p>{dates}</p>}
              {next && (
                <p>
                  Up next: <span className="font-medium text-foreground">{next.title}</span>
                  {next.startDate && `, from ${formatDay(next.startDate, now)}`}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {allDone && (
        <div className="mt-6 space-y-3">
          <p className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
            <CircleCheck aria-hidden="true" className="h-6 w-6 text-emerald-600" />
            Every stage is done
          </p>
          <StageTrack stages={stages} label={trackLabel} />
        </div>
      )}

      {view.statusNote && (
        <p className="mt-6 max-w-prose border-l-2 border-border pl-4 text-base leading-relaxed text-foreground">
          {view.statusNote}
        </p>
      )}

      {current &&
        ((!sheetMode && current.steps?.length) || current.meetings?.length || current.files.length > 0) && (
          <div className="mt-6 border-t border-border pt-5">
            <PortalStageDetail stage={sheetMode ? { ...current, steps: undefined } : current} now={now} />
          </div>
        )}
    </section>
  );
}
