'use client';

import { Fragment, useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  CalendarIcon,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  MessageSquareText,
  MoreHorizontal,
  PenTool,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { ConfirmDialog } from '@/components/ui/alert-dialog-confirm';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InlineEdit } from '@/components/ui/inline-edit';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TableCell, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type {
  PageWorkStatus,
  ProjectPage,
  StackDiscipline,
} from '../../domain/delivery.types';
import { normalizePageWorkStatus } from '../../domain/delivery.types';
import { PageStatusCell } from './PageStatusCell';

/** Radix Select cannot hold an empty value, so "nobody" needs a name. */
const UNASSIGNED = '__unassigned__';

/**
 * The page stays put while the discipline columns scroll sideways — on a wide
 * stack you are otherwise reading a row of statuses with no idea whose they are.
 * Shared with the header so the two offsets cannot drift: `#` is 2.5rem wide,
 * which is where Page starts.
 */
export const STICKY_NUMBER_COL = 'sticky left-0 w-10 px-1';
export const STICKY_PAGE_COL = 'sticky left-10';
/** Sticky cells need their own opaque fill, including under the row hover. */
const STICKY_FILL = 'z-10 bg-background group-hover:bg-muted/50';

export interface PageGridRowProps {
  page: ProjectPage;
  /** Tracker number ("No."), 1-based and always the position in the full list. */
  rowNumber: number;
  disciplines: StackDiscipline[];
  assignees: string[];
  isFirst: boolean;
  isLast: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onSetWork: (disciplineId: string, status: PageWorkStatus) => Promise<void>;
  onUpdate: (patch: Partial<Omit<ProjectPage, 'id' | 'createdAt'>>) => Promise<void>;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
  /** Index of the focused status cell in this row, or null when focus is elsewhere. */
  focusedCol: number | null;
  /** This row holds the grid's single tab stop while nothing is focused yet. */
  fallbackTabbable: boolean;
  onCellFocus: (col: number) => void;
  onNavigate: (dx: number, dy: number) => void;
  /** Row index in the *rendered* list, for the grid's focus bookkeeping. */
  rowIndex: number;
  columnCount: number;
}

export function PageGridRow({
  page,
  rowNumber,
  disciplines,
  assignees,
  isFirst,
  isLast,
  expanded,
  onToggleExpanded,
  onSetWork,
  onUpdate,
  onMove,
  onDelete,
  focusedCol,
  fallbackTabbable,
  onCellFocus,
  onNavigate,
  rowIndex,
  columnCount,
}: PageGridRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hasComment = Boolean(page.reviewComment?.trim());

  return (
    <Fragment>
      <TableRow className="group">
        <TableCell className={cn(STICKY_NUMBER_COL, STICKY_FILL, 'py-1 text-center')}>
          <span className="text-[11px] tabular-nums text-muted-foreground">{rowNumber}</span>
        </TableCell>

        <TableCell className={cn(STICKY_PAGE_COL, STICKY_FILL, 'py-1')}>
          <div className="flex min-w-[200px] max-w-[320px] items-start gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-0.5 size-5 shrink-0 text-muted-foreground"
              onClick={onToggleExpanded}
              aria-expanded={expanded}
              aria-label={expanded ? 'Hide page details' : 'Show page details'}
            >
              {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </Button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <InlineEdit
                  value={page.title}
                  onSave={(value) => onUpdate({ title: value })}
                  className="-mx-1 px-1 py-0"
                  displayClassName="text-xs font-medium truncate"
                  inputClassName="h-7 text-xs"
                  placeholder="Untitled page"
                />
                {hasComment && (
                  <MessageSquareText
                    className="size-3 shrink-0 text-amber-600 dark:text-amber-400"
                    aria-label="Has a review comment"
                  />
                )}
              </div>
              <p className="truncate px-1 font-mono text-[10px] text-muted-foreground" title={page.path}>
                {page.path}
              </p>
            </div>
          </div>
        </TableCell>

        {disciplines.map((discipline, col) => (
          <TableCell key={discipline.id} className="px-1 py-1">
            <PageStatusCell
              status={normalizePageWorkStatus(page.work?.[discipline.id])}
              pageTitle={page.title || page.path}
              disciplineLabel={discipline.label}
              onChange={(next) => onSetWork(discipline.id, next)}
              cellId={`${rowIndex}:${col}`}
              tabIndex={focusedCol === col || (fallbackTabbable && col === 0) ? 0 : -1}
              onFocus={() => onCellFocus(col)}
              onNavigate={onNavigate}
            />
          </TableCell>
        ))}

        <TableCell className="py-1">
          <AssigneeCell
            value={page.assignee}
            assignees={assignees}
            onChange={(next) => onUpdate({ assignee: next })}
          />
        </TableCell>

        <TableCell className="py-1">
          <ExpectedDateCell
            value={page.expectedDate}
            onChange={(next) => onUpdate({ expectedDate: next })}
          />
        </TableCell>

        <TableCell className="py-1">
          <div className="flex items-center gap-0.5">
            <LinkIcon href={page.designLink} label="Design" icon={<PenTool className="size-3.5" />} />
            <LinkIcon
              href={page.stagingLink}
              label="Staging"
              icon={<ExternalLink className="size-3.5" />}
            />
            <LinkIcon href={page.docsLink} label="Docs" icon={<FileText className="size-3.5" />} />
          </div>
        </TableCell>

        <TableCell className="py-1 text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                aria-label={`Actions for ${page.title || page.path}`}
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem disabled={isFirst} onSelect={() => onMove(-1)}>
                <ChevronUp className="size-3.5" />
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isLast} onSelect={() => onMove(1)}>
                <ChevronDown className="size-3.5" />
                Move down
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onToggleExpanded}>
                <MessageSquareText className="size-3.5" />
                {expanded ? 'Hide details' : 'Edit details'}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!page.stagingLink}
                onSelect={() => {
                  if (page.stagingLink) window.open(page.stagingLink, '_blank', 'noopener,noreferrer');
                }}
              >
                <ExternalLink className="size-3.5" />
                Open staging
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 className="size-3.5" />
                Remove page
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={columnCount} className="p-0">
            <PageDetails page={page} onUpdate={onUpdate} />
          </TableCell>
        </TableRow>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Remove this page?"
        description={`"${page.title || page.path}" comes off the tracker, along with its statuses and QC answers. The page itself is not touched.`}
        confirmText="Remove"
        variant="destructive"
        onConfirm={onDelete}
      />
    </Fragment>
  );
}

/**
 * Review comment and the three links, on demand.
 *
 * The trackers keep these as columns, but they are long text in a grid that is
 * already too wide, and they are edited far less often than a status. Fields
 * commit on blur so nothing needs saving twice.
 */
function PageDetails({
  page,
  onUpdate,
}: {
  page: ProjectPage;
  onUpdate: (patch: Partial<Omit<ProjectPage, 'id' | 'createdAt'>>) => Promise<void>;
}) {
  return (
    <div className="sticky left-0 max-w-[820px] space-y-3 p-3">
      <div className="space-y-1">
        <label
          className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
          htmlFor={`review-${page.id}`}
        >
          Review comment
        </label>
        <CommittingTextarea
          id={`review-${page.id}`}
          value={page.reviewComment ?? ''}
          placeholder="What is holding this page up, or what the reviewer wants changed"
          onCommit={(value) => onUpdate({ reviewComment: value })}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <CommittingInput
          label="Design link"
          value={page.designLink ?? ''}
          onCommit={(value) => onUpdate({ designLink: value })}
        />
        <CommittingInput
          label="Staging link"
          value={page.stagingLink ?? ''}
          onCommit={(value) => onUpdate({ stagingLink: value })}
        />
        <CommittingInput
          label="Docs link"
          value={page.docsLink ?? ''}
          onCommit={(value) => onUpdate({ docsLink: value })}
        />
      </div>
    </div>
  );
}

/** Keeps a local draft, writes on blur, and re-syncs when someone else edits. */
function useDraft(value: string) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return [draft, setDraft] as const;
}

function CommittingTextarea({
  id,
  value,
  placeholder,
  onCommit,
}: {
  id: string;
  value: string;
  placeholder: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useDraft(value);
  return (
    <Textarea
      id={id}
      value={draft}
      placeholder={placeholder}
      rows={2}
      className="min-h-0 resize-y text-xs"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft.trim() !== value.trim()) onCommit(draft.trim());
      }}
    />
  );
}

function CommittingInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useDraft(value);
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <Input
        value={draft}
        placeholder="https://"
        className="h-7 text-xs"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft.trim() !== value.trim()) onCommit(draft.trim());
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function LinkIcon({
  href,
  label,
  icon,
}: {
  href?: string;
  label: string;
  icon: React.ReactNode;
}) {
  if (!href) {
    return (
      <span
        className="flex size-6 items-center justify-center text-muted-foreground/25"
        aria-hidden="true"
        title={`No ${label.toLowerCase()} link`}
      >
        {icon}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`${label}: ${href}`}
      aria-label={`Open ${label.toLowerCase()} link`}
      className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {icon}
    </a>
  );
}

function AssigneeCell({
  value,
  assignees,
  onChange,
}: {
  value?: string;
  assignees: string[];
  onChange: (next: string) => void;
}) {
  // Someone can be assigned who has since left the list; never hide them.
  const options = Array.from(new Set([...assignees, ...(value ? [value] : [])])).sort();

  return (
    <Select
      value={value || UNASSIGNED}
      onValueChange={(next) => onChange(next === UNASSIGNED ? '' : next)}
    >
      <SelectTrigger
        size="sm"
        className={cn(
          'h-7 w-[132px] border-0 bg-transparent px-1.5 text-xs shadow-none hover:bg-accent',
          !value && 'text-muted-foreground',
        )}
        aria-label="Assignee"
      >
        <SelectValue placeholder="Unassigned" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED} className="text-xs">
          Unassigned
        </SelectItem>
        {options.map((email) => (
          <SelectItem key={email} value={email} className="text-xs">
            {email.split('@')[0]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ExpectedDateCell({
  value,
  onChange,
}: {
  value?: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(`${value}T00:00:00`) : undefined;
  const overdue = Boolean(value) && value! < format(new Date(), 'yyyy-MM-dd');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            'h-7 justify-start px-1.5 text-xs font-normal',
            !value && 'text-muted-foreground',
            overdue && 'text-rose-600 dark:text-rose-400',
          )}
        >
          <CalendarIcon className="size-3 opacity-70" />
          {date ? format(date, 'MMM d') : 'Set'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(next) => {
            onChange(next ? format(next, 'yyyy-MM-dd') : '');
            setOpen(false);
          }}
          autoFocus
        />
        {value && (
          <div className="border-t p-2">
            <Button
              type="button"
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
