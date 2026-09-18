import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PortalPhaseView } from '../../domain/client-portal.types';

interface PortalPhaseStepperProps {
  phases: PortalPhaseView[];
  /** Index of the current phase; -1 marks every phase upcoming, `phases.length` marks every phase done. */
  currentIndex: number;
  className?: string;
}

type StepState = 'done' | 'current' | 'upcoming';

export function PortalPhaseStepper({ phases: allPhases, currentIndex, className }: PortalPhaseStepperProps) {
  // The synthetic "Other" group holds unphased milestones; it is not a step.
  const phases = allPhases.filter((phase) => !phase.ungrouped);
  if (phases.length === 0) return null;

  return (
    <ol aria-label="Project phases" className={cn('flex flex-wrap gap-x-6 gap-y-3', className)}>
      {phases.map((phase, index) => {
        const state: StepState = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming';
        return (
          <li
            key={phase.id}
            aria-current={state === 'current' ? 'step' : undefined}
            className="flex items-center gap-2"
          >
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                state === 'done' && 'bg-muted text-foreground',
                state === 'current' && 'bg-primary text-primary-foreground ring-4 ring-primary/15',
                state === 'upcoming' && 'border border-border bg-card text-muted-foreground',
              )}
            >
              {state === 'done' ? <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}
              {state === 'done' && <span className="sr-only">Done:</span>}
            </span>
            <span
              className={cn(
                'text-sm',
                state === 'current' && 'font-semibold text-foreground',
                state === 'done' && 'text-foreground',
                state === 'upcoming' && 'text-muted-foreground',
              )}
            >
              {phase.title}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
