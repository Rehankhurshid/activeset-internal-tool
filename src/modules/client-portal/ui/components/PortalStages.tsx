import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PORTAL_STAGE_LABELS, type PortalStageView } from '../../domain/client-portal.types';
import { PortalFileList } from './PortalFileList';
import { formatStageDates } from './portal-format';
import { PortalSectionHeading } from './PortalSectionHeading';

function StageMarker({ stage, index }: { stage: PortalStageView; index: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
        stage.state === 'done' && 'bg-emerald-100 text-emerald-800',
        stage.state === 'current' && 'bg-primary text-primary-foreground ring-4 ring-primary/15',
        stage.state === 'upcoming' && 'border border-border bg-card text-muted-foreground',
      )}
    >
      {stage.state === 'done' ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}
    </span>
  );
}

interface PortalStagesProps {
  stages: PortalStageView[];
  now: Date;
}

/** "What you get, and when": every stage, its dates, what it delivers and its files. */
export function PortalStages({ stages, now }: PortalStagesProps) {
  return (
    <section aria-labelledby="portal-stages-heading" className="space-y-5">
      <PortalSectionHeading id="portal-stages-heading">What you get, and when</PortalSectionHeading>

      {stages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Your plan will appear here once kickoff is done.</p>
      ) : (
        <ol className="overflow-hidden rounded-2xl border border-border bg-card">
          {stages.map((stage, index) => {
            const dates = formatStageDates(stage.startDate, stage.dueDate, now);
            const stateLabel =
              stage.state === 'current' && stage.percent !== undefined
                ? `${PORTAL_STAGE_LABELS.current} · ${stage.percent}%`
                : PORTAL_STAGE_LABELS[stage.state];
            return (
              <li
                key={stage.id}
                aria-current={stage.state === 'current' ? 'step' : undefined}
                className={cn(
                  'flex gap-3.5 px-4 py-5 sm:gap-4 sm:px-6',
                  index > 0 && 'border-t border-border',
                  stage.state === 'current' && 'bg-accent/60',
                )}
              >
                <StageMarker stage={stage} index={index} />
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3
                      className={cn(
                        'text-base font-semibold',
                        stage.state === 'upcoming' ? 'text-foreground/80' : 'text-foreground',
                      )}
                    >
                      {stage.title}
                      <span className="sr-only">, {stateLabel}</span>
                    </h3>
                    <p className="text-sm tabular-nums text-muted-foreground">
                      {dates}
                      {dates && ' · '}
                      <span
                        className={cn(
                          stage.state === 'current' && 'font-medium text-foreground',
                          stage.state === 'done' && 'text-emerald-700',
                        )}
                        aria-hidden="true"
                      >
                        {stateLabel}
                      </span>
                    </p>
                  </div>

                  {stage.deliverables.length > 0 && (
                    <ul className="space-y-1.5">
                      {stage.deliverables.map((line, i) => (
                        <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-foreground">
                          <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                          <span className="min-w-0">{line}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {stage.files.length > 0 && <PortalFileList files={stage.files} compact />}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
