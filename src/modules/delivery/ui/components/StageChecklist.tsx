'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  CircleDot,
  ExternalLink,
  Link as LinkIcon,
  ListChecks,
  MoreHorizontal,
  SkipForward,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { daysBetweenIso, todayIso } from '@/lib/review-status';
import { cn } from '@/lib/utils';
import type { ChecklistItem, ChecklistItemLink, ChecklistItemStatus } from '@/types';
import type { SectionStage } from '../../domain/delivery.arc';
import type { AutoCheckVerdict } from '../../domain/delivery.types';
import { deliveryRepository } from '../../infrastructure/delivery.repository';

/**
 * The items of one stage of the arc.
 *
 * This is the only place a stage's items are rendered. Every stage goes through
 * it — the ones the app does something extra at and the eight that are just a
 * list — so a task looks and behaves the same wherever you meet it, and a tick
 * writes to the same item the Checklist tab writes to.
 */

/** Status vocabulary, icons and cycle order, as the Checklist tab uses them. */
const STATUS_CONFIG: Record<
  ChecklistItemStatus,
  { label: string; icon: typeof Circle; color: string; next: ChecklistItemStatus }
> = {
  not_started: {
    label: 'Not started',
    icon: Circle,
    color: 'text-muted-foreground/60',
    next: 'in_progress',
  },
  in_progress: {
    label: 'In progress',
    icon: CircleDot,
    color: 'text-blue-500 dark:text-blue-400',
    next: 'completed',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    color: 'text-emerald-600 dark:text-emerald-400',
    next: 'not_started',
  },
  skipped: {
    label: 'Skipped',
    icon: SkipForward,
    color: 'text-amber-600 dark:text-amber-400',
    next: 'not_started',
  },
};

const STATUS_ORDER: ChecklistItemStatus[] = ['not_started', 'in_progress', 'completed', 'skipped'];

/** One item's identity across every checklist on the project. */
function itemKey(checklistId: string, sectionId: string, itemId: string): string {
  return `${checklistId}:${sectionId}:${itemId}`;
}

/**
 * The item's links, with the older single `referenceLink` folded in unlabelled.
 *
 * Live projects still carry that field, and the SOP crammed URLs into titles
 * before labelled links existed. Reading both means nothing has to be migrated
 * for a link to become clickable.
 */
function linksOf(item: ChecklistItem): ChecklistItemLink[] {
  const links = (item.links ?? []).filter((link) => link.url);
  if (item.referenceLink && !links.some((link) => link.url === item.referenceLink)) {
    return [...links, { label: 'Reference', url: item.referenceLink }];
  }
  return links;
}

/**
 * A due date as a day, not an instant.
 *
 * Whatever wrote it may have written a full timestamp; only the date part means
 * anything here. An answered item is never overdue — the date has done its job.
 */
function dueState(
  dueDate: string | undefined,
  answered: boolean,
): { label: string; overdue: boolean } | null {
  if (!dueDate) return null;
  const day = dueDate.slice(0, 10);
  const at = new Date(`${day}T00:00:00`);
  if (Number.isNaN(at.getTime())) return null;
  return {
    label: at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    overdue: !answered && daysBetweenIso(day, todayIso()) > 0,
  };
}

interface StageChecklistRowProps {
  item: ChecklistItem;
  status: ChecklistItemStatus;
  /** What the last page scans say about this item, when it names an auto check. */
  verdict?: AutoCheckVerdict;
  onChange: (status: ChecklistItemStatus) => void;
  disabled?: boolean;
}

function StageChecklistRow({ item, status, verdict, onChange, disabled }: StageChecklistRowProps) {
  const config = STATUS_CONFIG[status];
  const StatusIcon = config.icon;
  const answered = status === 'completed' || status === 'skipped';
  const links = linksOf(item);
  const due = dueState(item.dueDate, answered);

  return (
    <div className="group flex items-start gap-2.5 px-3 py-2 hover:bg-muted/40">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={`${item.title} — ${config.label}`}
            onClick={() => onChange(config.next)}
            className={cn(
              'mt-0.5 shrink-0 rounded-sm transition-transform',
              'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              config.color,
              disabled ? 'cursor-default' : 'cursor-pointer hover:scale-110',
            )}
          >
            <StatusIcon className="h-[18px] w-[18px]" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {disabled
            ? config.label
            : `${config.label} → ${STATUS_CONFIG[config.next].label}. Use the menu for the rest.`}
        </TooltipContent>
      </Tooltip>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm leading-snug',
            status === 'completed' && 'text-muted-foreground line-through',
            // Skipped is "we decided this does not apply", not "we did it".
            status === 'skipped' &&
              'text-muted-foreground line-through decoration-muted-foreground/50',
          )}
        >
          {item.emoji && <span className="mr-1.5">{item.emoji}</span>}
          {item.title}
        </p>

        {/* The how-to is inline and always visible. Guidance behind a hover is
            guidance nobody reads, which is how the SOP ended up with URLs inside
            item titles in the first place. */}
        {item.howTo && (
          <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
            {item.howTo}
          </p>
        )}

        {/* The how-to came with the SOP; a note is what happened on this
            project. Italics keep the two apart without a label. */}
        {item.notes && <p className="mt-1 text-xs italic text-muted-foreground/90">{item.notes}</p>}

        <div className="mt-1 flex flex-wrap items-center gap-2 empty:mt-0">
          {status === 'skipped' && (
            <Badge
              variant="outline"
              className="h-5 border-amber-500/40 px-1.5 text-[10px] font-normal text-amber-700 dark:text-amber-300"
            >
              Not applicable
            </Badge>
          )}

          {/* A settled item blocks nothing, so the mark goes away with the tick. */}
          {item.blocking && !answered && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="h-5 cursor-help gap-1 border-rose-500/40 px-1.5 text-[10px] font-normal text-rose-700 dark:text-rose-300"
                >
                  <TriangleAlert className="h-2.5 w-2.5" />
                  Blocking
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-[18rem]">
                This stage is not finished until this is settled, and the stages after it say they
                are waiting on it.
              </TooltipContent>
            </Tooltip>
          )}

          {due && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px]',
                due.overdue
                  ? 'bg-rose-500/10 font-medium text-rose-700 dark:text-rose-300'
                  : 'bg-muted/60 text-muted-foreground',
              )}
            >
              <CalendarClock className="h-2.5 w-2.5" />
              {due.overdue ? `Overdue — ${due.label}` : `Due ${due.label}`}
            </span>
          )}

          {verdict && verdict !== 'unknown' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className={cn(
                    'h-5 cursor-help border-dashed px-1.5 text-[10px] font-normal',
                    verdict === 'pass'
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-rose-700 dark:text-rose-300',
                  )}
                >
                  from scan: {verdict === 'pass' ? 'clear' : 'problems'}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-[18rem]">
                {verdict === 'pass'
                  ? 'The last page scans found nothing wrong with this. It still needs a person to tick it — your answer is the one that counts.'
                  : 'The last page scans found something that would fail this. Worth looking before you tick it — your answer still wins.'}
              </TooltipContent>
            </Tooltip>
          )}

          {links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
            >
              <LinkIcon className="h-2.5 w-2.5" />
              {link.label || 'Link'}
            </a>
          ))}

          {item.assignee && (
            <span className="inline-flex items-center rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {item.assignee.split('@')[0]}
            </span>
          )}

          {answered && item.completedAt && (
            <span className="text-[10px] text-muted-foreground">
              {new Date(item.completedAt).toLocaleDateString()}
              {item.completedBy ? ` · ${item.completedBy.split('@')[0]}` : ''}
            </span>
          )}
        </div>
      </div>

      {!disabled && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              aria-label={`Change the status of ${item.title}`}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {STATUS_ORDER.filter((candidate) => candidate !== status).map((candidate) => {
              const option = STATUS_CONFIG[candidate];
              const Icon = option.icon;
              return (
                <DropdownMenuItem key={candidate} onClick={() => onChange(candidate)}>
                  <Icon className={cn('mr-2 h-3.5 w-3.5', option.color)} />
                  {candidate === 'skipped' ? 'Skip — not applicable here' : `Mark ${option.label.toLowerCase()}`}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

export interface StageChecklistProps {
  /** Only for the link out to the Checklist tab when the stage has no items. */
  projectId: string;
  /** The stage whose items these are. It carries the checklist a tick writes to. */
  stage: SectionStage;
  /** Recorded against whatever a person completes, same as the Checklist tab. */
  userEmail?: string;
  /**
   * Item id → what the last scans make of it. Purely presentational: the parent
   * works these out, and a person's status always wins over them.
   */
  autoVerdicts?: Record<string, AutoCheckVerdict>;
  disabled?: boolean;
  className?: string;
}

export function StageChecklist({
  projectId,
  stage,
  userEmail,
  autoVerdicts,
  disabled,
  className,
}: StageChecklistProps) {
  // Ticks already written but not yet echoed by the subscription, so a click
  // lands immediately rather than after a round trip.
  const [overrides, setOverrides] = useState<Record<string, ChecklistItemStatus>>({});

  const { checklistId, items } = stage;
  const sectionId = stage.section.id;

  const serverStatuses = useMemo(() => {
    const map: Record<string, ChecklistItemStatus> = {};
    for (const item of items) map[itemKey(checklistId, sectionId, item.id)] = item.status;
    return map;
  }, [items, checklistId, sectionId]);

  // Drop an optimistic tick once the stored data agrees with it, so a later
  // change by someone else is not masked by a stale local value.
  useEffect(() => {
    setOverrides((prev) => {
      const next: Record<string, ChecklistItemStatus> = {};
      let changed = false;
      for (const [key, status] of Object.entries(prev)) {
        const stored = serverStatuses[key];
        if (stored === status || stored === undefined) changed = true;
        else next[key] = status;
      }
      return changed ? next : prev;
    });
  }, [serverStatuses]);

  const handleChange = useCallback(
    async (itemId: string, status: ChecklistItemStatus) => {
      const key = itemKey(checklistId, sectionId, itemId);
      const previous = overrides[key];
      setOverrides((prev) => ({ ...prev, [key]: status }));
      try {
        await deliveryRepository.setChecklistItemStatus(
          checklistId,
          sectionId,
          itemId,
          status,
          userEmail,
        );
      } catch {
        setOverrides((prev) => {
          const next = { ...prev };
          if (previous === undefined) delete next[key];
          else next[key] = previous;
          return next;
        });
        toast.error('Could not save that — it has been put back');
      }
    },
    [overrides, userEmail, checklistId, sectionId],
  );

  if (items.length === 0) {
    return (
      <div
        className={cn('rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center', className)}
      >
        <ListChecks className="mx-auto h-6 w-6 text-muted-foreground" />
        <h3 className="mt-2 text-sm font-semibold">This stage has no items yet</h3>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          The stage exists — it is a section of this project&apos;s checklist — but nobody has said
          what happens in it. Add the items there, or in the SOP template it came from, and they
          appear here.
        </p>
        <Button asChild size="sm" variant="outline" className="mt-3 h-8 px-2.5 text-xs">
          {/* A plain link: the Checklist tab is chosen from the URL on load. */}
          <a href={`/modules/project-links/${projectId}?tab=checklist`}>
            <ListChecks className="h-3.5 w-3.5" />
            Add items
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('overflow-hidden rounded-lg border bg-card', className)}>
      <div className="divide-y divide-border/60">
        {items.map((item) => (
          <StageChecklistRow
            key={item.id}
            item={item}
            status={overrides[itemKey(checklistId, sectionId, item.id)] ?? item.status}
            verdict={autoVerdicts?.[item.id]}
            disabled={disabled}
            onChange={(status) => handleChange(item.id, status)}
          />
        ))}
      </div>
    </div>
  );
}
