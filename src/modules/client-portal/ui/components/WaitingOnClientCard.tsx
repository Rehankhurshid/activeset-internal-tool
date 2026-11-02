'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Task, UpdateTaskInput } from '@/types';
import { cn } from '@/lib/utils';
import { tasksService } from '@/services/database';
import { isoToday, waitingOnClient, type WaitingOnClientRow } from '../../domain/waiting-on-client';

interface WaitingOnClientCardProps {
  tasks: Task[];
  onOpenTasks?: () => void;
}

function shortDay(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function plusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function save(taskId: string, patch: UpdateTaskInput) {
  try {
    await tasksService.updateTask(taskId, patch);
  } catch {
    toast.error('Could not save that');
  }
}

function Row({ row, today }: { row: WaitingOnClientRow; today: string }) {
  const { task } = row;
  const [theirs, setTheirs] = useState(task.clientOwner ?? '');
  const followUpLate = !!row.followUpAt && row.followUpAt < today;
  const dueLate = !!task.dueDate && task.dueDate < today;

  return (
    <li className={cn('space-y-2 py-2.5', row.overdue && 'rounded-md bg-rose-500/5 px-2')}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="flex min-w-0 items-baseline gap-1.5 text-sm font-medium">
          {row.overdue && <AlertTriangle className="h-3.5 w-3.5 shrink-0 self-center text-rose-600" aria-label="Overdue" />}
          {task.title}
          {task.sourceLink && (
            <a href={task.sourceLink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Open the source message">
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {row.owner ? `Ours: ${row.owner.split('@')[0]}` : 'No owner on our side'}
          {task.dueDate && (
            <span className={cn(dueLate && 'font-medium text-rose-600')}> · due {shortDay(task.dueDate)}</span>
          )}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <label className="space-y-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">With them</span>
          <Input
            value={theirs}
            onChange={(e) => setTheirs(e.target.value)}
            onBlur={() => {
              const next = theirs.trim();
              if (next === (task.clientOwner ?? '')) return;
              if (next.includes('@')) {
                toast.error('A name, not an address: the client sees it');
                return;
              }
              void save(task.id, { clientOwner: next || undefined });
            }}
            placeholder="Their person or team"
            maxLength={80}
            className="h-8 text-xs"
          />
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Asked</span>
          <Input
            type="date"
            value={row.askedAt ?? ''}
            onChange={(e) => void save(task.id, { askedAt: e.target.value || undefined })}
            className="h-8 text-xs"
          />
        </label>
        <label className="space-y-0.5">
          <span
            className={cn(
              'text-[10px] font-semibold uppercase tracking-wide',
              followUpLate ? 'text-rose-600' : 'text-muted-foreground',
            )}
          >
            {followUpLate ? 'Follow-up overdue' : 'Next follow-up'}
          </span>
          <div className="flex gap-1">
            <Input
              type="date"
              value={row.followUpAt ?? ''}
              onChange={(e) => void save(task.id, { followUpAt: e.target.value || undefined })}
              className={cn('h-8 text-xs', followUpLate && 'border-rose-500/60')}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 shrink-0 px-2 text-[11px]"
              title="Followed up today: next follow-up in a week"
              onClick={() => void save(task.id, { followUpAt: plusDays(today, 7) })}
            >
              +7d
            </Button>
          </div>
        </label>
      </div>
    </li>
  );
}

/**
 * "Waiting on client" (ACT-88): every open ask (a task flagged "Needs client
 * input"), with who has it on their side, when we asked and when we next
 * chase. Overdue rows (past their due date or their follow-up) come first and
 * are marked, by the same rule the client's page uses. Edits save straight to
 * the task; the client's page shows the asked date, their owner and the
 * follow-up, never our owner or the source link.
 */
export function WaitingOnClientCard({ tasks, onOpenTasks }: WaitingOnClientCardProps) {
  const today = isoToday(new Date());
  const rows = useMemo(() => waitingOnClient(tasks, today), [tasks, today]);
  const overdue = rows.filter((r) => r.overdue).length;

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing is waiting on the client. Flag a task &ldquo;Needs client input&rdquo; on the Tasks tab and it shows here and on
        their page.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {rows.length} open{overdue > 0 && <span className="font-medium text-rose-600"> · {overdue} overdue</span>}
        {onOpenTasks && (
          <>
            {' · '}
            <button type="button" onClick={onOpenTasks} className="underline-offset-2 hover:underline">
              Tasks tab
            </button>
          </>
        )}
      </p>
      <ol className="divide-y divide-border/60">
        {rows.map((row) => (
          <Row key={row.task.id} row={row} today={today} />
        ))}
      </ol>
    </div>
  );
}
