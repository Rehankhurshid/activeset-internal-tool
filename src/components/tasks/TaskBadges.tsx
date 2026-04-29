'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  TASK_CATEGORY_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type TaskCategory,
  type TaskPriority,
  type TaskStatus,
} from '@/types';

const STATUS_CLASSES: Record<TaskStatus, string> = {
  backlog: 'bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300',
  todo: 'bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300',
  in_review: 'bg-violet-100 text-violet-800 hover:bg-violet-100 dark:bg-violet-950 dark:text-violet-300',
  done: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300',
  blocked: 'bg-rose-100 text-rose-800 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300',
};

const PRIORITY_CLASSES: Record<TaskPriority, string> = {
  low: 'bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300',
  medium: 'bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300',
  high: 'bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300',
  urgent: 'bg-rose-100 text-rose-800 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300',
};

export function TaskStatusBadge({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn('font-medium border-0', STATUS_CLASSES[status], className)}
    >
      {TASK_STATUS_LABELS[status]}
    </Badge>
  );
}

export function TaskPriorityBadge({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn('font-medium border-0', PRIORITY_CLASSES[priority], className)}
    >
      {TASK_PRIORITY_LABELS[priority]}
    </Badge>
  );
}

export function TaskCategoryBadge({
  category,
  className,
}: {
  category: TaskCategory;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn('font-normal', className)}>
      {TASK_CATEGORY_LABELS[category]}
    </Badge>
  );
}
