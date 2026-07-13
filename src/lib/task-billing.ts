import type { TaskBillingMode } from '@/types';

/**
 * Resolves how a billable ad-hoc task becomes an invoice line item. Shared by
 * the Tasks table, the "generate invoice" card, and the server route so the
 * hourly-vs-fixed math and validation stay identical everywhere.
 */

export interface TaskBillingInput {
  title?: string;
  billingMode?: TaskBillingMode | null;
  /** Hourly mode: quantity. */
  billedHours?: number | null;
  /** Hourly mode: per-task rate override. */
  billedRate?: number | null;
  /** Fixed mode: flat price. */
  billedAmount?: number | null;
}

export interface TaskLineItem {
  name: string;
  quantity: number;
  rate: number;
}

export function resolveTaskBillingMode(task: TaskBillingInput): TaskBillingMode {
  return task.billingMode === 'fixed' ? 'fixed' : 'hourly';
}

/**
 * Turns a billable task into a `{ name, quantity, rate }` line item, or returns
 * `null` when it can't be priced — hourly with no resolvable rate, or fixed
 * with no positive amount. `projectHourlyRate` is the fallback for hourly tasks
 * without a per-task rate.
 */
export function taskToLineItem(
  task: TaskBillingInput,
  projectHourlyRate: number | null,
): TaskLineItem | null {
  const name = task.title?.trim() || 'Task';

  if (resolveTaskBillingMode(task) === 'fixed') {
    const amount = task.billedAmount;
    if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
    return { name, quantity: 1, rate: amount };
  }

  const rate = task.billedRate != null ? task.billedRate : projectHourlyRate;
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return null;
  const hours =
    task.billedHours != null && Number.isFinite(task.billedHours) && task.billedHours > 0
      ? task.billedHours
      : 1;
  return { name, quantity: hours, rate };
}

/** Billable amount for display, or `null` when the task can't be priced yet. */
export function taskBillAmount(
  task: TaskBillingInput,
  projectHourlyRate: number | null,
): number | null {
  const item = taskToLineItem(task, projectHourlyRate);
  return item ? item.quantity * item.rate : null;
}
