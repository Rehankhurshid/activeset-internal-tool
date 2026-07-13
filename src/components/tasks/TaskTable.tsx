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
  CornerDownRight,
  Trash2,
  ExternalLink,
  Sparkles,
  Link2,
  Link2Off,
  Loader2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
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
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format-money';

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
import { isClickUpCreateSyncPending } from './clickupSyncState';

interface TaskTableProps {
  tasks: Task[];
  assignees: string[];
  loading: boolean;
  /** ms-since-epoch of the user's previous visit to this Tasks tab. Tasks
   *  created after this timestamp render with a "New" badge + accent border.
   *  Pass 0 to disable. */
  previousViewedAt?: number;
  /** Used to suppress "new" badges on tasks the current user created. */
  userEmail?: string;
  /** Render cells as static (no inline editing, no delete, no ClickUp link
   *  dialog). Used by the public share view. */
  readOnly?: boolean;
  /** Project-level ClickUp list binding. Enables local task create/link actions. */
  clickupListId?: string;
  clickupListName?: string;
  /** Ad-hoc billing config. When `enabled`, the table shows Billable / Hours /
   *  Amount / Invoiced columns so tasks can become invoice line items. */
  billing?: {
    enabled: boolean;
    hourlyRate: number | null;
    currency: string;
  };
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

/** Linked tasks have a ClickUp id and can sync in both directions. */
const isLinkedToClickUp = (t: Task) => Boolean(t.clickupTaskId);

export function TaskTable({
  tasks,
  assignees,
  loading,
  previousViewedAt = 0,
  userEmail,
  clickupListId,
  clickupListName,
  billing,
  readOnly = false,
}: TaskTableProps) {
  const billingEnabled = Boolean(billing?.enabled) && !readOnly;
  const billingRate = billing?.hourlyRate ?? null;
  const billingCurrency = billing?.currency ?? 'USD';
  const isNewSinceLastVisit = (t: Task): boolean => {
    if (previousViewedAt <= 0) return false;
    if (userEmail && t.createdBy === userEmail) return false;
    const ms = t.createdAt instanceof Date ? t.createdAt.getTime() : 0;
    return ms > previousViewedAt;
  };
  const [sorting, setSorting] = useState<SortingState>([]);
  const [titleQuery, setTitleQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [linkDialogTask, setLinkDialogTask] = useState<Task | null>(null);
  const [retryingTaskId, setRetryingTaskId] = useState<string | null>(null);

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

  // Re-order so subtasks appear directly under their parent. Tanstack preserves
  // input order when no column sort is active; once the user clicks a column
  // header, the column sort takes over and grouping breaks (acceptable v1).
  const ordered = useMemo(() => {
    const byClickupId = new Map<string, Task>();
    for (const t of filtered) {
      if (t.clickupTaskId) byClickupId.set(t.clickupTaskId, t);
    }
    const childrenByParent = new Map<string, Task[]>();
    const topLevel: Task[] = [];
    for (const t of filtered) {
      const parentId = t.parentClickupTaskId;
      if (parentId && byClickupId.has(parentId)) {
        const list = childrenByParent.get(parentId) ?? [];
        list.push(t);
        childrenByParent.set(parentId, list);
      } else {
        // No parent in the visible set — render as a top-level row, even if
        // `parentClickupTaskId` is set (parent was filtered out / not imported).
        topLevel.push(t);
      }
    }
    const result: Task[] = [];
    for (const t of topLevel) {
      result.push(t);
      if (t.clickupTaskId) {
        const kids = childrenByParent.get(t.clickupTaskId);
        if (kids) result.push(...kids);
      }
    }
    return result;
  }, [filtered]);

  // Whether a row should render with subtask styling — true when the parent is
  // also in the current visible set (so the visual link reads).
  const visibleParentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of filtered) if (t.clickupTaskId) ids.add(t.clickupTaskId);
    return ids;
  }, [filtered]);

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

  const handleRetryClickUp = async (task: Task) => {
    setRetryingTaskId(task.id);
    try {
      await tasksService.retryClickUpSync(task);
      toast.success('ClickUp sync retry started');
    } catch (err) {
      console.error('[TaskTable] ClickUp retry failed', err);
      toast.error(err instanceof Error ? err.message : 'Failed to retry ClickUp sync');
    } finally {
      setRetryingTaskId((current) => (current === task.id ? null : current));
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
          const isSubtask =
            !!task.parentClickupTaskId && visibleParentIds.has(task.parentClickupTaskId);
          const isNew = isNewSinceLastVisit(task);
          // Title is bidirectional — always editable. Edits flow to ClickUp
          // via /api/clickup/sync-update for linked tasks.
          return (
            <div className={cn('min-w-[240px] max-w-[420px]', isSubtask && 'pl-6')}>
              <div className="flex items-start gap-1.5">
                {isSubtask && (
                  <CornerDownRight
                    className="h-3.5 w-3.5 mt-1 shrink-0 text-muted-foreground"
                    aria-label="Subtask"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {readOnly ? (
                      <span
                        className={cn(
                          'text-sm font-medium',
                          isSubtask && 'text-muted-foreground',
                        )}
                      >
                        {task.title}
                      </span>
                    ) : (
                      <InlineEdit
                        value={task.title}
                        onSave={(v) => handleUpdate(task.id, { title: v })}
                        className="text-sm"
                        displayClassName={cn(
                          'text-sm font-medium',
                          isSubtask && 'text-muted-foreground',
                        )}
                        inputClassName="h-8 text-sm"
                      />
                    )}
                    {isNew && (
                      <Badge
                        variant="outline"
                        className="h-5 px-1.5 text-[10px] font-medium border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        title={`Added on ${task.createdAt.toLocaleString()}`}
                      >
                        New
                      </Badge>
                    )}
                  </div>
                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 px-2 whitespace-pre-line break-words">
                      {task.description}
                    </p>
                  )}
                </div>
              </div>
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
          if (readOnly) {
            return (
              <div className="h-8 px-1 inline-flex items-center">
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
          if (readOnly) {
            return (
              <div className="h-8 px-1 inline-flex items-center">
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
          if (readOnly) {
            return (
              <div className="h-8 px-1 inline-flex items-center">
                <TaskCategoryBadge category={task.category} />
              </div>
            );
          }
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
          if (readOnly) {
            return (
              <div className="h-8 px-1 inline-flex items-center text-xs">
                {task.assignee ? (
                  <span>{task.assignee.split('@')[0]}</span>
                ) : (
                  <span className="text-muted-foreground">Unassigned</span>
                )}
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
              readOnly={readOnly}
            />
          );
        },
      },
      ...(billingEnabled
        ? ([
            {
              id: 'billable',
              header: 'Billable',
              enableSorting: false,
              cell: ({ row }) => {
                const task = row.original;
                const invoiced = Boolean(task.invoiceId);
                return (
                  <div className="flex items-center justify-center">
                    <Checkbox
                      checked={Boolean(task.billable)}
                      disabled={invoiced}
                      onCheckedChange={(v) =>
                        handleUpdate(task.id, { billable: Boolean(v) })
                      }
                      aria-label="Billable"
                      title={invoiced ? 'Already invoiced' : 'Mark as billable'}
                    />
                  </div>
                );
              },
            },
            {
              id: 'hours',
              header: 'Hours',
              enableSorting: false,
              cell: ({ row }) => {
                const task = row.original;
                if (!task.billable) {
                  return <span className="text-xs text-muted-foreground">—</span>;
                }
                return (
                  <BillingHoursCell
                    value={task.billedHours}
                    disabled={Boolean(task.invoiceId)}
                    onCommit={(n) => handleUpdate(task.id, { billedHours: n })}
                  />
                );
              },
            },
            {
              id: 'amount',
              header: 'Amount',
              enableSorting: false,
              cell: ({ row }) => {
                const task = row.original;
                if (!task.billable) {
                  return <span className="text-xs text-muted-foreground">—</span>;
                }
                const rate = task.billedRate ?? billingRate;
                if (rate == null || rate <= 0) {
                  return (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      Set rate
                    </span>
                  );
                }
                const hours =
                  task.billedHours != null && task.billedHours > 0 ? task.billedHours : 1;
                return (
                  <span className="text-xs font-medium tabular-nums">
                    {formatMoney(hours * rate, billingCurrency)}
                  </span>
                );
              },
            },
            {
              id: 'invoiced',
              header: 'Invoiced',
              enableSorting: false,
              cell: ({ row }) => {
                const task = row.original;
                if (!task.invoiceId) {
                  return <span className="text-xs text-muted-foreground">—</span>;
                }
                return (
                  <Badge
                    variant="outline"
                    className="h-5 px-1.5 text-[10px] font-medium border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    title={
                      task.invoicedAt
                        ? `Invoiced ${task.invoicedAt.toLocaleString()}`
                        : 'Invoiced'
                    }
                  >
                    {task.invoiceNumber ? `#${task.invoiceNumber}` : 'Invoiced'}
                  </Badge>
                );
              },
            },
          ] as ColumnDef<Task>[])
        : []),
      {
        accessorKey: 'source',
        header: 'Source',
        enableSorting: false,
        cell: ({ row }) => {
          const task = row.original;
          const synced = isLinkedToClickUp(task);
          const pending = !synced && isClickUpCreateSyncPending(task);
          const failed = Boolean(task.clickupSyncError);
          const label = synced
            ? 'ClickUp'
            : pending
              ? 'Syncing'
              : failed
                ? 'Sync failed'
                : SOURCE_LABEL[task.source];
          const SourceIcon = synced ? Link2 : pending ? Loader2 : failed ? AlertCircle : Link2Off;
          const sourceTitle = synced
            ? task.clickupSyncError || 'View ClickUp link'
            : pending
              ? 'Creating this task in ClickUp'
              : failed
                ? task.clickupSyncError
                : clickupListId
                  ? 'Sync this task to ClickUp or link an existing ClickUp task'
                  : 'Link to an existing ClickUp task';
          return (
            <div className="flex items-center gap-1">
              {task.requestId && (
                <Sparkles
                  className="h-3 w-3 text-violet-500"
                  aria-label="AI parsed"
                />
              )}
              {readOnly ? (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md text-xs px-1.5 py-0.5 border',
                    synced
                      ? 'border-violet-200 bg-violet-50 text-violet-700'
                      : pending
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : failed
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : 'border-border bg-transparent text-muted-foreground',
                  )}
                  title={sourceTitle}
                >
                  <SourceIcon className={cn('h-3 w-3', pending && 'animate-spin')} />
                  {label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setLinkDialogTask(task)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md text-xs px-1.5 py-0.5 border transition-colors',
                    synced
                      ? 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'
                      : pending
                        ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                        : failed
                          ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                      : 'border-border bg-transparent text-muted-foreground hover:bg-accent',
                  )}
                  title={sourceTitle}
                >
                  <SourceIcon className={cn('h-3 w-3', pending && 'animate-spin')} />
                  {label}
                </button>
              )}
              {synced && failed && (
                <span title={task.clickupSyncError}>
                  <AlertCircle
                    className="h-3.5 w-3.5 text-rose-500"
                    aria-label="ClickUp sync failed"
                  />
                </span>
              )}
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
              {!readOnly && task.clickupSyncError && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[11px] text-amber-700 hover:text-amber-800 hover:bg-amber-500/10 dark:text-amber-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRetryClickUp(task);
                  }}
                  disabled={retryingTaskId === task.id}
                  title={task.clickupSyncError}
                >
                  {retryingTaskId === task.id ? (
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 mr-1" />
                  )}
                  Retry
                </Button>
              )}
            </div>
          );
        },
      },
      ...(readOnly
        ? []
        : [
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
            } as ColumnDef<Task>,
          ]),
    ],
    [assignees, visibleParentIds, previousViewedAt, userEmail, readOnly, clickupListId, retryingTaskId, billingEnabled, billingRate, billingCurrency],
  );

  const table = useReactTable({
    data: ordered,
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
              table.getRowModel().rows.map((row) => {
                const isNew = isNewSinceLastVisit(row.original);
                return (
                  <TableRow
                    key={row.id}
                    className={cn(
                      row.original.status === 'done' && 'opacity-60',
                      isNew &&
                        'bg-emerald-500/5 border-l-2 border-l-emerald-500',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-1.5 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {!readOnly && linkDialogTask && (
        <ClickUpLinkDialog
          open={Boolean(linkDialogTask)}
          onOpenChange={(open) => {
            if (!open) setLinkDialogTask(null);
          }}
          task={linkDialogTask}
          clickupListId={clickupListId}
          clickupListName={clickupListName}
        />
      )}
    </div>
  );
}

/**
 * Inline hours editor for a billable task. Commits on blur / Enter; an empty
 * value clears the hours (falls back to a quantity of 1 downstream).
 */
function BillingHoursCell({
  value,
  disabled = false,
  onCommit,
}: {
  value?: number;
  disabled?: boolean;
  onCommit: (next: number | undefined) => void;
}) {
  const [draft, setDraft] = useState(value != null ? String(value) : '');

  // Keep the local draft in sync when the underlying value changes elsewhere.
  const lastValueRef = value != null ? String(value) : '';
  const [lastSeen, setLastSeen] = useState(lastValueRef);
  if (lastSeen !== lastValueRef) {
    setLastSeen(lastValueRef);
    setDraft(lastValueRef);
  }

  if (disabled) {
    return (
      <span className="text-xs tabular-nums text-muted-foreground">
        {value != null ? value : 1}
      </span>
    );
  }

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      onCommit(undefined);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) {
      setDraft(value != null ? String(value) : '');
      return;
    }
    onCommit(n);
  };

  return (
    <Input
      type="number"
      min={0}
      step="0.25"
      inputMode="decimal"
      value={draft}
      placeholder="1"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="h-8 w-16 text-xs tabular-nums"
    />
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
