'use client';

import { useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

import { useProjectTasks } from '@/hooks/useProjectTasks';
import { useProjectRequests } from '@/hooks/useProjectRequests';
import { useAssignees } from '@/hooks/useAssignees';
import { tasksService } from '@/services/database';

import { TaskTable } from './TaskTable';
import { NewRequestDialog } from './NewRequestDialog';

interface TasksTabProps {
  projectId: string;
  userEmail: string;
}

export function TasksTab({ projectId, userEmail }: TasksTabProps) {
  const { tasks, loading } = useProjectTasks(projectId);
  const { requests } = useProjectRequests(projectId);
  const { assignees } = useAssignees();

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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Open" value={openCount} />
        <SummaryCard label="Urgent" value={urgentCount} accent="rose" />
        <SummaryCard label="Assigned to me" value={myCount} accent="blue" />
        <SummaryCard label="Requests" value={requestCount} accent="violet" />
      </div>

      {/* Action row */}
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

      {/* Table */}
      <TaskTable tasks={tasks} assignees={assignees} loading={loading} />

      <NewRequestDialog
        open={requestDialogOpen}
        onOpenChange={setRequestDialogOpen}
        projectId={projectId}
        userEmail={userEmail}
      />
    </div>
  );
}

const ACCENT_CLASSES: Record<string, string> = {
  rose: 'text-rose-600 dark:text-rose-400',
  blue: 'text-blue-600 dark:text-blue-400',
  violet: 'text-violet-600 dark:text-violet-400',
};

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: keyof typeof ACCENT_CLASSES;
}) {
  return (
    <Card>
      <CardContent className="py-3 px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={
            accent
              ? `text-2xl font-bold ${ACCENT_CLASSES[accent]}`
              : 'text-2xl font-bold'
          }
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
