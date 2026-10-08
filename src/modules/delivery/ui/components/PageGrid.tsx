'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Check, ChevronDown } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type {
  PageWorkOwner,
  PageWorkStatus,
  ProjectPage,
  StackDiscipline,
} from '../../domain/delivery.types';
import { PageGridRow, STICKY_NUMBER_COL, STICKY_PAGE_COL } from './PageGridRow';

const STICKY_HEAD =
  'sticky top-0 z-20 bg-background shadow-[inset_0_-1px_0_var(--border)] h-9 px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground';

export interface PageGridProps {
  /** Already filtered and in display order. */
  pages: ProjectPage[];
  /** Page id → its index in the *unfiltered* list, so "No." and move stay honest. */
  positionById: Map<string, number>;
  totalCount: number;
  disciplines: StackDiscipline[];
  /** Discipline id → who does it on this project. Missing ids are ours. */
  owners: Readonly<Record<string, PageWorkOwner>>;
  /** Who the project's services say does it, before anyone changed a column. */
  serviceOwners: Readonly<Record<string, PageWorkOwner>>;
  /** `null` goes back to what the services say. */
  onSetOwner: (disciplineId: string, owner: PageWorkOwner | null) => void;
  assignees: string[];
  loading: boolean;
  onSetWork: (pageId: string, disciplineId: string, status: PageWorkStatus) => Promise<void>;
  onUpdatePage: (
    pageId: string,
    patch: Partial<Omit<ProjectPage, 'id' | 'createdAt'>>,
  ) => Promise<void>;
  onMovePage: (pageId: string, toIndex: number) => void;
  onDeletePage: (pageId: string) => void;
}

interface ActiveCell {
  row: number;
  col: number;
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, value));
}

/**
 * The tracker itself: a row per page, a column per discipline.
 *
 * Column order follows the sheets it replaces — No. | Page | one status column
 * per discipline | Assignee | Expected date — so anyone moving off the
 * spreadsheet finds the same things in the same places. The links the sheets
 * kept as three wide columns are icons here, and the review comment lives in
 * the expandable detail row; both are read far more often than they are typed.
 *
 * Arrow keys move between status cells, and 1–6 sets one. That is deliberate:
 * this replaces a spreadsheet, and a grid you can only click is slower than the
 * thing it replaces however good it looks.
 */
export function PageGrid({
  pages,
  positionById,
  totalCount,
  disciplines,
  owners,
  serviceOwners,
  onSetOwner,
  assignees,
  loading,
  onSetWork,
  onUpdatePage,
  onMovePage,
  onDeletePage,
}: PageGridProps) {
  const [active, setActive] = useState<ActiveCell | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [focusSeq, setFocusSeq] = useState(0);
  const movedRef = useRef(false);

  // Column count: #, Page, one per discipline, Assignee, Expected, Links, menu.
  const columnCount = disciplines.length + 6;
  const maxRow = pages.length - 1;
  const maxCol = disciplines.length - 1;

  // A filter or a delete can leave the cursor pointing past the end.
  useEffect(() => {
    setActive((current) => {
      if (!current) return current;
      if (maxRow < 0 || maxCol < 0) return null;
      if (current.row <= maxRow && current.col <= maxCol) return current;
      return { row: clamp(current.row, maxRow), col: clamp(current.col, maxCol) };
    });
  }, [maxRow, maxCol]);

  // Only pull focus when the user actually pressed an arrow key — never on mount,
  // and never because a re-render happened to change `active`.
  useEffect(() => {
    if (!movedRef.current || !active) return;
    movedRef.current = false;
    const target = document.querySelector<HTMLElement>(
      `[data-grid-cell="${active.row}:${active.col}"]`,
    );
    target?.focus();
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [focusSeq, active]);

  const navigate = useCallback(
    (dx: number, dy: number) => {
      if (pages.length === 0 || disciplines.length === 0) return;
      movedRef.current = true;
      setActive((current) => {
        const base = current ?? { row: 0, col: 0 };
        return { row: clamp(base.row + dy, maxRow), col: clamp(base.col + dx, maxCol) };
      });
      setFocusSeq((seq) => seq + 1);
    },
    [pages.length, disciplines.length, maxRow, maxCol],
  );

  const toggleExpanded = useCallback((pageId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  }, []);

  return (
    <div className="rounded-md border [&_[data-slot=table-container]]:max-h-[calc(100vh-20rem)] [&_[data-slot=table-container]]:min-h-[8rem]">
      <Table className="text-xs">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(STICKY_HEAD, STICKY_NUMBER_COL, 'z-30 text-center')}>#</TableHead>
            <TableHead className={cn(STICKY_HEAD, STICKY_PAGE_COL, 'z-30')}>Page</TableHead>
            {disciplines.map((discipline) => (
              <TableHead key={discipline.id} className={cn(STICKY_HEAD, 'px-1')}>
                <OwnerMenu
                  discipline={discipline}
                  owner={owners[discipline.id] ?? 'activeset'}
                  fromServices={serviceOwners[discipline.id] ?? 'activeset'}
                  onSetOwner={(owner) => onSetOwner(discipline.id, owner)}
                />
              </TableHead>
            ))}
            <TableHead className={STICKY_HEAD}>Assignee</TableHead>
            <TableHead className={STICKY_HEAD}>Expected</TableHead>
            <TableHead className={STICKY_HEAD}>Links</TableHead>
            <TableHead className={cn(STICKY_HEAD, 'w-10')}>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
                Loading pages…
              </TableCell>
            </TableRow>
          ) : pages.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
                No pages match these filters.
              </TableCell>
            </TableRow>
          ) : (
            pages.map((page, rowIndex) => {
              const position = positionById.get(page.id) ?? rowIndex;
              return (
                <PageGridRow
                  key={page.id}
                  page={page}
                  rowIndex={rowIndex}
                  rowNumber={position + 1}
                  columnCount={columnCount}
                  disciplines={disciplines}
                  owners={owners}
                  assignees={assignees}
                  isFirst={position === 0}
                  isLast={position === totalCount - 1}
                  expanded={expanded.has(page.id)}
                  onToggleExpanded={() => toggleExpanded(page.id)}
                  onSetWork={(disciplineId, status) => onSetWork(page.id, disciplineId, status)}
                  onUpdate={(patch) => onUpdatePage(page.id, patch)}
                  onMove={(delta) => onMovePage(page.id, clamp(position + delta, totalCount - 1))}
                  onDelete={() => onDeletePage(page.id)}
                  focusedCol={active && active.row === rowIndex ? active.col : null}
                  fallbackTabbable={active === null && rowIndex === 0}
                  onCellFocus={(col) => setActive({ row: rowIndex, col })}
                  onNavigate={navigate}
                />
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

const OWNER_CHOICES: { owner: PageWorkOwner; label: string; hint: string }[] = [
  { owner: 'activeset', label: 'ActiveSet', hint: 'We do it; counts towards pages built' },
  { owner: 'client', label: 'The client', hint: 'They send it; we track what arrived' },
];

/**
 * A column heading that says, and changes, who does that work on this project.
 * The client's columns carry a "Client" tag so the grid reads right at a glance.
 */
function OwnerMenu({
  discipline,
  owner,
  fromServices,
  onSetOwner,
}: {
  discipline: StackDiscipline;
  owner: PageWorkOwner;
  fromServices: PageWorkOwner;
  onSetOwner: (owner: PageWorkOwner | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center gap-1 rounded px-1 py-0.5 uppercase tracking-wide outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        title={`${discipline.label}: done by ${owner === 'client' ? 'the client' : 'ActiveSet'}`}
      >
        {discipline.shortLabel}
        {owner === 'client' && (
          <span className="rounded border border-dashed px-1 text-[9px] normal-case tracking-normal">Client</span>
        )}
        <ChevronDown className="size-3 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs">Who does {discipline.label.toLowerCase()}?</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OWNER_CHOICES.map((choice) => (
          <DropdownMenuItem
            key={choice.owner}
            // Picking what the services already say clears the setting, so a
            // later change of engagement still moves this column.
            onSelect={() => onSetOwner(choice.owner === fromServices ? null : choice.owner)}
            className="items-start gap-2"
          >
            <Check className={cn('mt-0.5 size-3.5 shrink-0', choice.owner !== owner && 'invisible')} />
            <span className="flex flex-col">
              <span className="text-xs font-medium">
                {choice.label}
                {choice.owner === fromServices && (
                  <span className="font-normal text-muted-foreground"> · default</span>
                )}
              </span>
              <span className="text-[11px] text-muted-foreground">{choice.hint}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
