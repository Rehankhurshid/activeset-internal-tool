import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PortalStepView } from '../../domain/client-portal.types';
import { formatDateRange } from './portal-format';

const STATE_WORD = { done: 'Done', current: 'In progress', upcoming: 'Planned' } as const;

/** A stage's milestones: a quiet ledger of what is done, in hand and planned, with dates. */
export function PortalSteps({ steps, now }: { steps: PortalStepView[]; now: Date }) {
  if (steps.length === 0) return null;
  return (
    <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {steps.map((step) => {
        const dates = step.startDate || step.endDate ? formatDateRange(step.startDate ?? '', step.endDate ?? step.startDate ?? '', now) : '';
        return (
          <li key={step.id} className="flex items-start gap-3 px-3 py-2.5 sm:px-4">
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                step.state === 'done' && 'bg-emerald-600 text-white',
                step.state === 'current' && 'border-2 border-foreground bg-card',
                step.state === 'upcoming' && 'border border-muted-foreground/40 bg-card',
              )}
            >
              {step.state === 'done' && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
              {step.state === 'current' && <span className="h-1.5 w-1.5 rounded-full bg-foreground" />}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block text-sm leading-snug',
                  step.state === 'upcoming' ? 'text-foreground/75' : 'text-foreground',
                  step.state === 'current' && 'font-medium',
                )}
              >
                {step.title}
                {step.owner && (
                  <span className="ml-2 inline-block rounded-full bg-amber-100 px-1.5 py-px align-[1px] text-[10px] font-semibold text-amber-900">
                    {step.owner === 'client' ? 'You' : 'Together'}
                  </span>
                )}
                <span className="sr-only">, {STATE_WORD[step.state]}</span>
              </span>
            </span>
            <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {dates}
              {step.state === 'current' && <span className="block font-medium text-foreground">In progress</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
