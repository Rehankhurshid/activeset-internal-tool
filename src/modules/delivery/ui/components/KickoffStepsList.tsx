'use client';

import { useState } from 'react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { ProjectDeliveryState, StackDefinition, StackKickoffStep } from '../../domain/delivery.types';
import { buildKickoffStepProgress, resolveKickoffStep, type KickoffContext } from '../../domain/delivery.progress';
import { deliveryRepository } from '../../infrastructure/delivery.repository';

interface KickoffStepsListProps {
  projectId: string;
  stack: StackDefinition;
  delivery: ProjectDeliveryState | undefined;
  context: KickoffContext;
  /** Jumps to whatever performs a step — the email dialog, the cadence card, the grid. */
  onAction?: (action: NonNullable<StackKickoffStep['action']>) => void;
}

const ACTION_LABELS: Record<NonNullable<StackKickoffStep['action']>, string> = {
  'welcome-email': 'Draft it',
  cadence: 'Set it',
  sheet: 'Generate it',
  pages: 'Import pages',
};

/**
 * Our side of kickoff: book the call, hold it, open the Slack channel, send the
 * welcome email, set the project up.
 *
 * These live here rather than only in the SOP checklist because this is the
 * screen the team is on during kickoff — that checklist carries sixty-odd items
 * across the whole build, and the kickoff section disappears inside it.
 *
 * Three steps answer themselves from the project, so nobody ticks a box about
 * something the screen already shows. The rest are things only a person knows.
 */
export function KickoffStepsList({ projectId, stack, delivery, context, onAction }: KickoffStepsListProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});

  const ticks = { ...(delivery?.kickoffSteps ?? {}), ...optimistic };
  const progress = buildKickoffStepProgress(stack, { ...delivery, kickoffSteps: ticks }, context);
  const steps = [...stack.kickoffSteps].sort((a, b) => a.order - b.order);
  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const toggle = async (step: StackKickoffStep, next: boolean) => {
    setPending(step.id);
    setOptimistic((o) => ({ ...o, [step.id]: next }));
    try {
      await deliveryRepository.setKickoffStep(projectId, step.id, next);
    } catch (err) {
      setOptimistic((o) => Object.fromEntries(Object.entries(o).filter(([id]) => id !== step.id)));
      toast.error(err instanceof Error ? err.message : 'Could not save that');
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="space-y-3 rounded-lg border bg-card p-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">What we do</h2>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {progress.done}/{progress.total}
          </span>
        </div>
        <Progress value={percent} className="h-1" />
        <p className="text-xs text-muted-foreground">
          {progress.complete
            ? 'Kickoff is done on our side.'
            : `Next: ${progress.outstanding[0]}`}
        </p>
      </div>

      <ul className="space-y-0.5">
        {steps.map((step) => {
          const { done, source } = resolveKickoffStep(step, ticks[step.id], delivery, context);
          const busy = pending === step.id;
          const fromProject = done && source === 'project';

          return (
            <li key={step.id} className="flex items-start gap-2.5 rounded-md px-1 py-1.5 hover:bg-muted/40">
              {fromProject ? (
                // The project already shows this is done, so there is nothing
                // to tick — a checkbox here would only invite someone to
                // contradict what the screen plainly says.
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-emerald-500/15 text-emerald-600"
                >
                  <Check className="size-3" />
                </span>
              ) : busy ? (
                <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <Checkbox
                  id={`kickoff-step-${step.id}`}
                  checked={done}
                  onCheckedChange={(v) => void toggle(step, v === true)}
                  className="mt-0.5"
                />
              )}

              <div className="min-w-0 flex-1 space-y-0.5">
                <label
                  htmlFor={fromProject ? undefined : `kickoff-step-${step.id}`}
                  className={cn(
                    'flex flex-wrap items-center gap-1.5 text-xs leading-snug',
                    fromProject ? 'cursor-default' : 'cursor-pointer',
                    done ? 'text-muted-foreground line-through decoration-muted-foreground/40' : 'text-foreground',
                  )}
                >
                  {step.title}
                  {fromProject && (
                    <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal text-muted-foreground">
                      done in the app
                    </Badge>
                  )}
                </label>

                {step.note && !done && (
                  <p className="text-[11px] leading-snug text-muted-foreground">{step.note}</p>
                )}
              </div>

              {step.action && !done && onAction && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 shrink-0 px-1.5 text-[11px] text-muted-foreground"
                  onClick={() => onAction(step.action!)}
                >
                  {ACTION_LABELS[step.action]}
                  <ArrowRight className="size-3" />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
