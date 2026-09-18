'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { TONE_CLASSES } from '@/lib/ui-tones';
import { cn } from '@/lib/utils';
import { buildKickoffProgress } from '../../domain/delivery.progress';
import type { ProjectDeliveryState, StackDefinition, StackKickoffInput } from '../../domain/delivery.types';
import { deliveryRepository } from '../../infrastructure/delivery.repository';

/**
 * What the client owes us before the build can start.
 *
 * The list is the stack definition's, not this component's — a Webflow
 * migration needs a paid Webflow account and an Astro build will not, and that
 * difference belongs in the stack file rather than in a screen.
 */

interface InputRowProps {
  input: StackKickoffInput;
  received: boolean;
  busy: boolean;
  onToggle: (received: boolean) => void;
}

function InputRow({ input, received, busy, onToggle }: InputRowProps) {
  const id = `kickoff-input-${input.id}`;
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-md border px-2.5 py-2 transition-colors',
        received ? 'border-border/50 bg-muted/30' : 'border-border/60',
        busy && 'opacity-60',
      )}
    >
      <Checkbox
        id={id}
        checked={received}
        disabled={busy}
        onCheckedChange={(next) => onToggle(next === true)}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <label
          htmlFor={id}
          className={cn(
            'block cursor-pointer text-sm leading-snug',
            received ? 'text-muted-foreground line-through decoration-muted-foreground/40' : 'text-foreground',
          )}
        >
          {input.title}
          {input.optional && (
            <span className="ml-2 align-middle rounded-sm border border-border/60 px-1 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Optional
            </span>
          )}
        </label>
        {input.note && <p className="text-xs leading-snug text-muted-foreground">{input.note}</p>}
      </div>
    </div>
  );
}

interface KickoffInputsListProps {
  projectId: string;
  stack: StackDefinition;
  delivery: ProjectDeliveryState | undefined;
}

export function KickoffInputsList({ projectId, stack, delivery }: KickoffInputsListProps) {
  const serverInputs = useMemo(() => delivery?.kickoffInputs ?? {}, [delivery?.kickoffInputs]);

  // Ticks that have been clicked but not yet come back through the project
  // subscription. Cleared the moment the server agrees, so a stale optimistic
  // value cannot sit on top of someone else's change for the rest of the session.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setPending((prev) => {
      const next: Record<string, boolean> = {};
      let changed = false;
      for (const [id, value] of Object.entries(prev)) {
        if ((serverInputs[id] === true) === value) changed = true;
        else next[id] = value;
      }
      return changed ? next : prev;
    });
  }, [serverInputs]);

  const [busyId, setBusyId] = useState<string | null>(null);

  const effective = useMemo<ProjectDeliveryState>(
    () => ({ ...delivery, kickoffInputs: { ...serverInputs, ...pending } }),
    [delivery, serverInputs, pending],
  );
  const progress = buildKickoffProgress(stack, effective);

  const { required, optional } = useMemo(() => {
    const sorted = [...stack.kickoffInputs].sort((a, b) => a.order - b.order);
    return {
      required: sorted.filter((i) => !i.optional),
      optional: sorted.filter((i) => i.optional),
    };
  }, [stack]);

  const isReceived = (id: string) => (effective.kickoffInputs ?? {})[id] === true;

  const handleToggle = async (input: StackKickoffInput, received: boolean) => {
    const previous = isReceived(input.id);
    setPending((p) => ({ ...p, [input.id]: received }));
    setBusyId(input.id);
    try {
      await deliveryRepository.setKickoffInput(projectId, input.id, received);
    } catch (error) {
      setPending((p) => ({ ...p, [input.id]: previous }));
      toast.error(error instanceof Error ? error.message : 'Failed to update the kickoff list');
    } finally {
      setBusyId((current) => (current === input.id ? null : current));
    }
  };

  const renderRow = (input: StackKickoffInput) => (
    <InputRow
      key={input.id}
      input={input}
      received={isReceived(input.id)}
      busy={busyId === input.id}
      onToggle={(received) => handleToggle(input, received)}
    />
  );

  return (
    <section className="rounded-lg border bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">What we need from the client</h2>
          <p className="text-xs text-muted-foreground">
            Shared with the client as the project&rsquo;s ask list.
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 text-xs tabular-nums',
            progress.complete ? 'font-medium text-emerald-600 dark:text-emerald-300' : 'text-muted-foreground',
          )}
        >
          {progress.done} of {progress.total} received
        </span>
      </header>

      <div className="space-y-1.5 p-3">
        {required.map(renderRow)}

        {optional.length > 0 && (
          <>
            <p className="pt-2 pb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Only if the build needs them
            </p>
            {optional.map(renderRow)}
          </>
        )}

        {progress.complete ? (
          <div className={cn('mt-2 flex items-start gap-2 rounded-md border px-2.5 py-2', TONE_CLASSES.emerald)}>
            <CheckCircle2 className="mt-px h-4 w-4 shrink-0" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Ready to start building</p>
              <p className="text-xs opacity-80">
                Everything the build needs is in. Anything left above is optional.
              </p>
            </div>
          </div>
        ) : (
          <p className="pt-1.5 text-xs text-muted-foreground">
            {progress.outstanding.length === 1
              ? `One thing still to come: ${progress.outstanding[0]}.`
              : `${progress.outstanding.length} things still to come before the build can start.`}
          </p>
        )}
      </div>
    </section>
  );
}
