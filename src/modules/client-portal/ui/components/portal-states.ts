import type { WorkState } from '../../domain/client-portal.types';

/**
 * The status legend in the client's words, with one colour per state. The
 * same seven states every tab of the project sheet is read into.
 */
export const WORK_STATE: Record<WorkState, { label: string; cell: string; dot: string }> = {
  not_started: { label: 'Not started', cell: 'bg-muted ring-1 ring-inset ring-border', dot: 'bg-muted-foreground/40' },
  in_progress: { label: 'In progress', cell: 'bg-sky-500', dot: 'bg-sky-500' },
  in_review: { label: 'Ready for your review', cell: 'bg-amber-400', dot: 'bg-amber-400' },
  changes: { label: 'Changes in progress', cell: 'bg-orange-500', dot: 'bg-orange-500' },
  done: { label: 'Done', cell: 'bg-emerald-600', dot: 'bg-emerald-600' },
  blocked: { label: 'On hold', cell: 'bg-rose-500', dot: 'bg-rose-500' },
  not_needed: {
    label: 'Not needed',
    cell: 'bg-[repeating-linear-gradient(45deg,var(--border)_0_3px,transparent_3px_6px)] ring-1 ring-inset ring-border',
    dot: 'bg-muted-foreground/20',
  },
};

/** Legend order: the way work moves. */
export const WORK_STATE_ORDER: WorkState[] = ['not_started', 'in_progress', 'in_review', 'changes', 'done', 'blocked', 'not_needed'];

/** Today, as YYYY-MM-DD, from the projection's clock. */
export function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}
