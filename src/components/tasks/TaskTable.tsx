'use client';

import { useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import {
  ArrowUpDown,
  CalendarIcon,
  Trash2,
  ExternalLink,
  Sparkles,
  Link2,
  Link2Off,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { InlineEdit } from '@/components/ui/inline-edit';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { tasksService } from '@/services/database';
import {
  TASK_CATEGORIES,
  TASK_CATEGORY_LABELS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type Task,
  type TaskCategory,
  type TaskPriority,
  type TaskStatus,
} from '@/types';
import {
  TaskCategoryBadge,
  TaskPriorityBadge,
  TaskStatusBadge,
} from './TaskBadges';
import { ClickUpLinkDialog } from './ClickUpLinkDialog';

interface TaskTableProps {
  tasks: Task[];
  assignees: string[];
  loading: boolean;
}

type StatusFilter = TaskStatus | 'all' | 'open';
type PriorityFilter = TaskPriority | 'all';

const SOURCE_LABEL: Record<Task['source'], string> = {
  manual: 'Manual',
  paste: 'Pasted',
  slack: 'Slack',
  email: 'Email',
  clickup: 'ClickUp',
};

/** Once a task is linked to ClickUp, ClickUp owns these fields. */
const isSyncedFromClickUp = (t: Task) => t.source === 'clickup' && Boolean(t.clickupTaskId);

export function TaskTable({ tasks, assignees, loading }: TaskTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [titleQuery, setTitleQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [linkDialogTask, setLinkDialogTask] = useState<Task | null>(null);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (statusFilter === 'open' && t.status === 'done') return false;
      if (
        statusFilter !== 'all' &&
        statusFilter !== 'open' &&
        t.status !== statusFilter
      ) {
        return false;
      }
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) {
        return false;
      }
      if (titleQuery) {
        const q = titleQuery.toLowerCase();
        if (
          !t.title.toLowerCase().includes(q) &&
          !(t.description?.toLowerCase().includes(q) ?? false)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [tasks, titleQuery, statusFilter, priorityFilter]);

  const handleUpdate = async (
    taskId: string,
    patch: Parameters<typeof tasksService.updateTask>[1],
  ) => {
    try {
      await tasksService.updateTask(taskId, patch);
    } catch (err) {
      console.error('[TaskTable] update failed', err);
      toast.error('Failed to update task');
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      await tasksService.deleteTask(taskId);
      toast.success('Task deleted');
    } catch (err) {
      console.error('[TaskTable] delete failed', err);
      toast.error('Failed to delete task');
    }
  };

  const columns = useMemo<ColumnDef<Task>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <SortableHeader column={column} label="Title" />
        ),
        cell: ({ row }) => {
          const task = row.original;
          const synced = isSyncedFromClickUp(task);
          return (
            <div className="min-w-[240px] max-w-[420px]">
              {synced ? (
                <div className="text-sm font-medium px-2 break-words">
                  {task.title}
                </div>
              ) : (
                <InlineEdit
                  value={task.title}
                  onSave={(v) => handleUpdate(task.id, { title: v })}
                  className="text-sm"
                  displayClassName="text-sm font-medium"
                  inputClassName="h-8 text-sm"
                />
              )}
              {task.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 px-2 whitespace-pre-line break-words">
                  {task.description}
                </p>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <SortableHeader column={column} label="Status" />
        ),
        cell: ({ row }) => {
          const task = row.original;
          if (isSyncedFromClickUp(task)) {
            return (
              <div className="px-1">
                <TaskStatusBadge status={task.status} />
              </div>
            );
          }
          return (
            <Select
              value={task.status}
              onValueChange={(v) =>
                handleUpdate(task.id, { status: v as TaskStatus })
              }
            >
              <SelectTrigger className="h-8 w-[130px] border-0 bg-transparent shadow-none px-1 hover:bg-accent">
                <SelectValue asChild>
                  <TaskStatusBadge status={task.status} />
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TASK_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {TASK_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        },
      },
      {
        accessorKey: 'priority',
        header: ({ column }) => (
          <SortableHeader column={column} label="Priority" />
        ),
        sortingFn: (a, b) => {
          const order: Record<TaskPriority, number> = {
            urgent: 0,
            high: 1,
            medium: 2,
            low: 3,
          };
          return order[a.original.priority] - order[b.original.priority];
        },
        cell: ({ row }) => {
          const task = row.original;
          if (isSyncedFromClickUp(task)) {
            return (
              <div className="px-1">
                <TaskPriorityBadge priority={task.priority} />
              </div>
            );
          }
          return (
            <Select
              value={task.priority}
              onValueChange={(v) =>
                handleUpdate(task.id, { priority: v as TaskPriority })
              }
            >
              <SelectTrigger className="h-8 w-[110px] border-0 bg-transparent shadow-none px-1 hover:bg-accent">
                <SelectValue asChild>
                  <TaskPriorityBadge priority={task.priority} />
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TASK_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {TASK_PRIORITY_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        },
      },
      {
        accessorKey: 'category',
        header: ({ column }) => (
          <SortableHeader column={column} label="Category" />
        ),
        cell: ({ row }) => {
          const task = row.original;
          return (
            <Select
              value={task.category}
              onValueChange={(v) =>
                handleUpdate(task.id, { category: v as TaskCategory })
              }
            >
              <SelectTrigger className="h-8 w-[110px] border-0 bg-transparent shadow-none px-1 hover:bg-accent">
                <SelectValue asChild>
                  <TaskCategoryBadge category={task.category} />
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TASK_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {TASK_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        },
      },
      {
        accessorKey: 'assignee',
        header: ({ column }) => (
          <SortableHeader column={column} label="Assignee" />
        ),
        cell: ({ row }) => {
          const task = row.original;
          if (isSyncedFromClickUp(task)) {
            return (
              <div className="px-1 text-xs text-muted-foreground">
                {task.assignee ? task.assignee.split('@')[0] : 'Unassigned'}
              </div>
            );
          }
          return (
            <Select
              value={task.assignee ?? '__unassigned__'}
              onValueChange={(v) =>
                handleUpdate(task.id, {
                  assignee: v === '__unassigned__' ? undefined : v,
                })
              }
            >
              <SelectTrigger className="h-8 w-[160px] border-0 bg-transparent shadow-none px-1 hover:bg-accent text-xs">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__">
                  <span className="text-muted-foreground">Unassigned</span>
                </SelectItem>
                {assignees.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a.split('@')[0]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        },
      },
      {
        accessorKey: 'dueDate',
        header: ({ column }) => (
          <SortableHeader column={column} label="Due" />
        ),
        cell: ({ row }) => {
          const task = row.original;
          return (
            <DueDateCell
              value={task.dueDate}
              onChange={(v) => handleUpdate(task.id, { dueDate: v || undefined })}
              readOnly={isSyncedFromClickUp(task)}
            />
          );
        },
      },
      {
        accessorKey: 'source',
        header: 'Source',
        enableSorting: false,
        cell: ({ row }) => {
          const task = row.original;
          const synced = isSyncedFromClickUp(task);
          return (
            <div className="flex items-center gap-1">
              {task.requestId && (
                <Sparkles
                  className="h-3 w-3 text-violet-500"
                  aria-label="AI parsed"
                />
              )}
              <button
                type="button"
                onClick={() => setLinkDialogTask(task)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md text-xs px-1.5 py-0.5 border transition-colors',
                  synced
                    ? 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'
                    : 'border-border bg-transparent text-muted-foreground hover:bg-accent',
                )}
                title={synced ? 'View ClickUp link' : 'Link to a ClickUp task'}
              >
                {synced ? (
                  <>
                    <Link2 className="h-3 w-3" />
                    ClickUp
                  </>
                ) : (
                  <>
                    <Link2Off className="h-3 w-3" />
                    {SOURCE_LABEL[task.source]}
                  </>
                )}
              </button>
              {synced && task.clickupUrl && (
                <a
                  href={task.clickupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                  title="Open in ClickUp"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {!synced && task.sourceLink && (
                <a
                  href={task.sourceLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-rose-600"
            onClick={() => handleDelete(row.original.id)}
            title="Delete task"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ),
      },
    ],
    [assignees],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search tasks…"
          value={titleQuery}
          onChange={(e) => setTitleQuery(e.target.value)}
          className="h-9 w-full sm:w-64"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open (not done)</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
            {TASK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={priorityFilter}
          onValueChange={(v) => setPriorityFilter(v as PriorityFilter)}
        >
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {TASK_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {TASK_PRIORITY_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} of {tasks.length} task{tasks.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Table */}
      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className="whitespace-nowrap">
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  Loading tasks…
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-muted-foreground"
                >
                  {tasks.length === 0
                    ? 'No tasks yet. Click "New Request" above to paste a Slack/email message and let AI break it into tasks.'
                    : 'No tasks match the current filters.'}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(
                    row.original.status === 'done' && 'opacity-60',
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-1.5 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {linkDialogTask && (
        <ClickUpLinkDialog
          open={Boolean(linkDialogTask)}
          onOpenChange={(open) => {
            if (!open) setLinkDialogTask(null);
          }}
          task={linkDialogTask}
        />
      )}
    </div>
  );
}

function SortableHeader({
  column,
  label,
}: {
  column: { toggleSorting: (desc?: boolean) => void; getIsSorted: () => false | 'asc' | 'desc' };
  label: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 px-2 font-medium"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
    >
      {label}
      <ArrowUpDown className="ml-1.5 h-3 w-3 opacity-50" />
    </Button>
  );
}

function DueDateCell({
  value,
  onChange,
  readOnly = false,
}: {
  value?: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(value + 'T00:00:00') : undefined;

  const overdue = (() => {
    if (!value) return false;
    const today = format(new Date(), 'yyyy-MM-dd');
    return value < today;
  })();

  if (readOnly) {
    return (
      <div
        className={cn(
          'h-8 px-2 inline-flex items-center text-xs',
          !value && 'text-muted-foreground',
          overdue && 'text-rose-600',
        )}
      >
        <CalendarIcon className="h-3.5 w-3.5 mr-1.5 opacity-70" />
        {value ? format(date!, 'MMM d') : '—'}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-8 px-2 font-normal text-xs',
            !value && 'text-muted-foreground',
            overdue && 'text-rose-600',
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 mr-1.5 opacity-70" />
          {value ? format(date!, 'MMM d') : 'Set date'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            onChange(d ? format(d, 'yyyy-MM-dd') : '');
            setOpen(false);
          }}
          initialFocus
        />
        {value && (
          <div className="p-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              Clear date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
