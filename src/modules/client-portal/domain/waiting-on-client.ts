import type { Task } from '@/types';

/**
 * "Waiting on client": the asks, as a list somebody chases (ACT-88).
 *
 * An ask is a task flagged `needsClientInput` that is not done; this adds when
 * it was asked, when we next follow up, and who has it on their side. The
 * client's page and the team's Client tab both decide "overdue" here, so the
 * two never disagree about what is late.
 */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD string, or undefined. Anything else (a timestamp, garbage) is dropped. */
export function isoDayOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!ISO_DAY.test(trimmed)) return undefined;
  return Number.isNaN(Date.parse(`${trimmed}T00:00:00Z`)) ? undefined : trimmed;
}

/** Today as YYYY-MM-DD in UTC, the portal's clock. */
export function isoToday(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The client-side person an ask is with, as a name the client may see:
 * trimmed, at most 80 characters, and never an email address.
 */
export function clientOwnerName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const name = value.trim().slice(0, 80);
  if (!name || name.includes('@')) return undefined;
  return name;
}

/**
 * Late: the date it was needed by has passed, or the date we said we would
 * follow up has passed and it is still open. `today` is YYYY-MM-DD.
 */
export function askOverdue(ask: { dueDate?: string; followUpDate?: string }, today: string): boolean {
  return (!!ask.dueDate && ask.dueDate < today) || (!!ask.followUpDate && ask.followUpDate < today);
}

/** One row of the team's "Waiting on client" list. */
export interface WaitingOnClientRow {
  task: Task;
  askedAt?: string;
  followUpAt?: string;
  clientOwner?: string;
  /** Our owner, the task's assignee. Team-only. */
  owner?: string;
  overdue: boolean;
}

/**
 * Open asks for the team: overdue first, then the soonest follow-up, then the
 * soonest due date, then the oldest ask. Dates that are not YYYY-MM-DD are
 * treated as unset.
 */
export function waitingOnClient(tasks: readonly Task[], today: string): WaitingOnClientRow[] {
  return tasks
    .filter((t) => t.needsClientInput === true && t.status !== 'done')
    .map((task): WaitingOnClientRow => {
      const askedAt = isoDayOrUndefined(task.askedAt);
      const followUpAt = isoDayOrUndefined(task.followUpAt);
      const dueDate = isoDayOrUndefined(task.dueDate);
      return {
        task,
        askedAt,
        followUpAt,
        clientOwner: clientOwnerName(task.clientOwner),
        owner: task.assignee || undefined,
        overdue: askOverdue({ dueDate, followUpDate: followUpAt }, today),
      };
    })
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        (a.followUpAt ?? '9999').localeCompare(b.followUpAt ?? '9999') ||
        (isoDayOrUndefined(a.task.dueDate) ?? '9999').localeCompare(isoDayOrUndefined(b.task.dueDate) ?? '9999') ||
        (a.askedAt ?? '9999').localeCompare(b.askedAt ?? '9999') ||
        a.task.order - b.task.order,
    );
}
