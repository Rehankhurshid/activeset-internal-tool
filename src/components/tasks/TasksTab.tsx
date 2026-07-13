'use client';

import { useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { useProjectTasks } from '@/hooks/useProjectTasks';
import { useProjectRequests } from '@/hooks/useProjectRequests';
import { useAssignees } from '@/hooks/useAssignees';
import { useLastViewed } from '@/hooks/useLastViewed';
import { tasksService } from '@/services/database';

import { TaskTable } from './TaskTable';
import { NewRequestDialog } from './NewRequestDialog';
import { ClickUpListLinkCard } from './ClickUpListLinkCard';
import { isClickUpCreateSyncPending } from './clickupSyncState';

interface TasksTabProps {
  projectId: string;
  userEmail: string;
  clickupListId?: string;
  clickupListName?: string;
  /** When true (ad-hoc projects), show per-task billable hours + amount so
   *  tasks can be rolled into an invoice from the Invoices tab. */
  billingEnabled?: boolean;
  /** Project default hourly rate, used when a task has no per-task override. */
  hourlyRate?: number;
  /** Currency for the computed amounts. Defaults to USD. */
  billingCurrency?: string;
  /** Hide quick-add, new request, ClickUp link, and table editors. Used by
   *  the public share view so guests can browse but not modify tasks. */
  readOnly?: boolean;
}

export function TasksTab({
  projectId,
  userEmail,
  clickupListId,
  clickupListName,
  billingEnabled = false,
  hourlyRate,
  billingCurrency = 'USD',
  readOnly = false,
}: TasksTabProps) {
  const { tasks, loading } = useProjectTasks(projectId);
  const { requests } = useProjectRequests(projectId);
  const { assignees } = useAssignees();
  const previousViewedAt = useLastViewed(`tasks-tab-viewed:${projectId}:${userEmail}`);

  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [creating, setCreating] = useState(false);

  // High-level counters for the summary strip.
  const openCount = tasks.filter((t) => t.status !== 'done').length;
  const urgentCount = tasks.filter(
    (t) => t.priority === 'urgent' && t.status !== 'done',
  ).length;
  const myCount = tasks.filter(
    (t) => t.assignee === userEmail && t.status !== 'done',
  ).length;
  const requestCount = requests.length;
  // Tasks created since this user last viewed this project's Tasks tab.
  // Suppress on first ever visit (previousViewedAt === 0) and skip ones the
  // current user created themselves — those aren't "new" to them.
  const newCount =
    previousViewedAt > 0
      ? tasks.filter((t) => {
          if (t.createdBy === userEmail) return false;
          const ms = t.createdAt instanceof Date ? t.createdAt.getTime() : 0;
          return ms > previousViewedAt;
        }).length
      : 0;
  const syncableTaskIds = tasks
    .filter((t) => !t.clickupTaskId && !isClickUpCreateSyncPending(t))
    .map((t) => t.id);
  const clickupTaskCount = new Set(
    tasks
      .map((t) => t.clickupTaskId)
      .filter((id): id is string => Boolean(id)),
  ).size;
  const localTaskCount = tasks.filter((t) => !t.clickupTaskId).length;
  const pendingSyncCount = tasks.filter((t) => isClickUpCreateSyncPending(t)).length;
  const failedSyncCount = tasks.filter((t) => Boolean(t.clickupSyncError)).length;

  const handleQuickAdd = async () => {
    const title = quickAddTitle.trim();
    if (!title) return;

    setCreating(true);
    try {
      await tasksService.createTask({
        projectId,
        title,
        category: 'other',
        status: 'todo',
        priority: 'medium',
        source: 'manual',
        tags: [],
        createdBy: userEmail,
      });
      setQuickAddTitle('');
      toast.success(
        clickupListId
          ? 'Task added. Syncing to ClickUp.'
          : 'Task added',
      );
    } catch (err) {
      console.error('[TasksTab] quick add failed', err);
      toast.error('Failed to add task');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 divide-x divide-border rounded-lg border sm:grid-cols-5">
        <SummaryStat label="Open" value={openCount} />
        <SummaryStat label="Urgent" value={urgentCount} accent="rose" />
        <SummaryStat label="Assigned to me" value={myCount} accent="blue" />
        <SummaryStat label="Requests" value={requestCount} accent="violet" />
        <SummaryStat label="New since last visit" value={newCount} accent="emerald" />
      </div>

      {/* Action row — hidden in read-only share view */}
      {!readOnly && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleQuickAdd();
            }}
            className="flex-1 flex gap-2"
          >
            <Input
              placeholder="Quick add: type a task title and press Enter…"
              value={quickAddTitle}
              onChange={(e) => setQuickAddTitle(e.target.value)}
              disabled={creating}
              className="flex-1"
            />
            <Button
              type="submit"
              variant="outline"
              disabled={creating || !quickAddTitle.trim()}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </form>
          <Button onClick={() => setRequestDialogOpen(true)}>
            <Sparkles className="h-4 w-4 mr-2" />
            New Request
          </Button>
        </div>
      )}

      {/* ClickUp list binding — hidden in read-only share view */}
      {!readOnly && (
        <ClickUpListLinkCard
          projectId={projectId}
          clickupListId={clickupListId}
          clickupListName={clickupListName}
          syncableTaskIds={syncableTaskIds}
          clickupTaskCount={clickupTaskCount}
          localTaskCount={localTaskCount}
          pendingSyncCount={pendingSyncCount}
          failedSyncCount={failedSyncCount}
        />
      )}

      {/* Table */}
      <TaskTable
        tasks={tasks}
        assignees={assignees}
        loading={loading}
        previousViewedAt={previousViewedAt}
        userEmail={userEmail}
        clickupListId={clickupListId}
        clickupListName={clickupListName}
        billing={
          billingEnabled
            ? { enabled: true, hourlyRate: hourlyRate ?? null, currency: billingCurrency }
            : undefined
        }
        readOnly={readOnly}
      />

      {!readOnly && (
        <NewRequestDialog
          open={requestDialogOpen}
          onOpenChange={setRequestDialogOpen}
          projectId={projectId}
          userEmail={userEmail}
        />
      )}
    </div>
  );
}

const ACCENT_CLASSES: Record<string, string> = {
  rose: 'text-rose-600 dark:text-rose-400',
  blue: 'text-blue-600 dark:text-blue-400',
  violet: 'text-violet-600 dark:text-violet-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
};

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: keyof typeof ACCENT_CLASSES;
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          accent
            ? `text-lg font-semibold ${ACCENT_CLASSES[accent]}`
            : 'text-lg font-semibold'
        }
      >
        {value}
      </p>
    </div>
  );
}
