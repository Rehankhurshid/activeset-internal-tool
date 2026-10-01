import { Check, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PortalStageView, PortalStepView } from '../../domain/client-portal.types';
import { formatDay, formatStageDates } from './portal-format';
import { PortalSectionHeading } from './PortalSectionHeading';

interface PortalProcessProps {
  stages: PortalStageView[];
  now: Date;
}

const OWNER_LABEL = { client: 'You', both: 'Together' } as const;

/** "Done · 3 Sep", "Waiting on you", "In progress", "Planned · 18 Sep". */
function StepStatus({ step, now }: { step: PortalStepView; now: Date }) {
  const day = step.endDate ?? step.startDate;
  if (step.state === 'done') {
    return (
      <span className="text-xs font-medium text-emerald-700">
        Done{day ? <span className="font-normal text-muted-foreground"> · {formatDay(day, now)}</span> : null}
      </span>
    );
  }
  if (step.waiting) {
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Waiting on you</span>;
  }
  if (step.state === 'current') return <span className="text-xs font-medium text-foreground">In progress</span>;
  return day ? <span className="text-xs text-muted-foreground">Planned · {formatDay(day, now)}</span> : null;
}

/**
 * The project's process as one numbered list, stage by stage, from kickoff to
 * launch: what is done and when, what is happening now, and every step that is
 * waiting on the client. Rehan's brief for the client page: "1. Kickoff call –
 * Done – [date]. 2. Moodboarding – Done – [date]. 3. Awaiting feedback on
 * moodboard." Built from the project sheet's Process tab; skipped steps never
 * reach it.
 */
export function PortalProcess({ stages, now }: PortalProcessProps) {
  const withSteps = stages.filter((s) => (s.steps?.length ?? 0) > 0);
  if (withSteps.length === 0) return null;

  // The step the project is on: the first one not done in the stage it is in.
  // A step left open in an earlier stage stays open, but is not where we are.
  const currentStage = withSteps.find((s) => s.state === 'current');
  const nowId = (currentStage?.steps ?? []).find((step) => step.state !== 'done')?.id;
  let number = 0;

  return (
    <section aria-labelledby="portal-process-heading" className="space-y-5">
      <div className="space-y-1">
        <PortalSectionHeading id="portal-process-heading">The process</PortalSectionHeading>
        <p className="text-sm text-muted-foreground">Every step from kickoff to launch, in order.</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {withSteps.map((stage) => {
          const steps = stage.steps ?? [];
          const done = steps.filter((s) => s.state === 'done').length;
          const dates = formatStageDates(stage.startDate, stage.dueDate, now);
          return (
            <section key={stage.id} aria-label={stage.title} className="border-b border-border last:border-b-0">
              <header
                className={cn(
                  'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2.5 sm:px-5',
                  stage.state === 'current' ? 'bg-primary/[0.06]' : 'bg-muted/40',
                )}
              >
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">{stage.title}</h3>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {done === steps.length ? 'Done' : `${done} of ${steps.length} done`}
                  {dates ? ` · ${dates}` : ''}
                </span>
              </header>
              <ol>
                {steps.map((step) => {
                  number += 1;
                  const isNow = step.id === nowId;
                  return (
                    <li
                      key={step.id}
                      aria-current={isNow ? 'step' : undefined}
                      className={cn(
                        'flex items-start gap-3 border-t border-border/70 px-4 py-3 first:border-t-0 sm:px-5',
                        isNow && (step.waiting ? 'bg-amber-50' : 'bg-primary/[0.04]'),
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums',
                          step.state === 'done' && 'bg-emerald-600 text-white',
                          step.state !== 'done' && isNow && (step.waiting ? 'bg-amber-400 text-amber-950' : 'bg-primary text-primary-foreground'),
                          step.state !== 'done' && !isNow && 'border border-border text-muted-foreground',
                        )}
                      >
                        {step.state === 'done' ? <Check className="h-3 w-3" strokeWidth={3.5} /> : number}
                      </span>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p
                          className={cn(
                            'text-sm leading-snug',
                            step.state === 'upcoming' && !isNow ? 'text-foreground/70' : 'text-foreground',
                            isNow && 'font-medium',
                          )}
                        >
                          <span className="sr-only">{number}. </span>
                          {step.title}
                          {step.owner && (
                            <span className="ml-2 inline-block rounded-full bg-muted px-1.5 py-px align-[1px] text-[10px] font-semibold text-muted-foreground">
                              {OWNER_LABEL[step.owner]}
                            </span>
                          )}
                        </p>
                        {step.note && <p className="text-xs text-muted-foreground">{step.note}</p>}
                        {step.url && (
                          <a
                            href={step.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline-offset-2 hover:underline"
                          >
                            {step.urlLabel ?? (step.waiting ? 'Open to review' : 'Open')}
                            <ExternalLink aria-hidden="true" className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      <div className="shrink-0 pt-0.5 text-right">
                        <StepStatus step={step} now={now} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </section>
  );
}
