'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  CircleDot,
  ExternalLink,
  Link as LinkIcon,
  ListChecks,
  MoreHorizontal,
  SkipForward,
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
import { cn } from '@/lib/utils';
import type {
  ChecklistItem,
  ChecklistItemStatus,
  ChecklistStage,
  ProjectChecklist,
} from '@/types';
import { sectionsForStage, stageProgress } from '../../domain/delivery.checklist';
import type { AutoCheckVerdict } from '../../domain/delivery.types';
import { deliveryRepository } from '../../infrastructure/delivery.repository';

/**
 * A delivery stage, rendered from the project's own checklist.
 *
 * The list is not held here. Whoever runs the project decides what kickoff or
 * launch means for it — by editing the checklist on the project, or the SOP
 * template it came from — and tags the section with a stage. This renders the
 * sections tagged for one stage, and a tick writes to the same item the
 * Checklist tab writes to, so the two can never disagree.
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

const STAGE_LABELS: Record<ChecklistStage, string> = {
  kickoff: 'kickoff',
  launch: 'launch',
};

/** One item's identity across every checklist on the project. */
function itemKey(checklistId: string, sectionId: string, itemId: string): string {
  return `${checklistId}:${sectionId}:${itemId}`;
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

        {item.notes && <p className="mt-0.5 text-xs text-muted-foreground">{item.notes}</p>}

        <div className="mt-1 flex flex-wrap items-center gap-2 empty:mt-0">
          {status === 'skipped' && (
            <Badge
              variant="outline"
              className="h-5 border-amber-500/40 px-1.5 text-[10px] font-normal text-amber-700 dark:text-amber-300"
            >
              Not applicable
            </Badge>
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

          {item.referenceLink && (
            <a
              href={item.referenceLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
            >
              <LinkIcon className="h-2.5 w-2.5" />
              Reference
            </a>
          )}

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
  projectId: string;
  /** Every checklist on the project; this picks the sections tagged for the stage. */
  checklists: ProjectChecklist[];
  stage: ChecklistStage;
  /** Recorded against whatever a person completes, same as the Checklist tab. */
  userEmail?: string;
  /** One line saying what this stage is for, shown when nothing is tagged for it. */
  emptyHint?: string;
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
  checklists,
  stage,
  userEmail,
  emptyHint,
  autoVerdicts,
  disabled,
  className,
}: StageChecklistProps) {
  // Ticks already written but not yet echoed by the subscription, so a click
  // lands immediately rather than after a round trip.
  const [overrides, setOverrides] = useState<Record<string, ChecklistItemStatus>>({});

  const sections = useMemo(() => sectionsForStage(checklists, stage), [checklists, stage]);
  const untagged = useMemo(() => stageProgress(checklists, stage).untagged, [checklists, stage]);
  const showChecklistName = checklists.length > 1;

  const serverStatuses = useMemo(() => {
    const map: Record<string, ChecklistItemStatus> = {};
    for (const { checklistId, section } of sections) {
      for (const item of section.items ?? []) {
        map[itemKey(checklistId, section.id, item.id)] = item.status;
      }
    }
    return map;
  }, [sections]);

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
    async (
      checklistId: string,
      sectionId: string,
      itemId: string,
      status: ChecklistItemStatus,
    ) => {
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
    [overrides, userEmail],
  );

  if (untagged) {
    return (
      <div
        className={cn(
          'rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center',
          className,
        )}
      >
        <ListChecks className="mx-auto h-6 w-6 text-muted-foreground" />
        <h3 className="mt-2 text-sm font-semibold">
          {checklists.length === 0
            ? 'This project has no checklist yet'
            : `No checklist section is tagged ${STAGE_LABELS[stage]}`}
        </h3>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          {emptyHint ? `${emptyHint} ` : ''}
          Nothing is missing from the build — this stage just has not been set up. On the Checklist
          tab, press Edit Structure and set a section to {STAGE_LABELS[stage]}; the SOP template a
          checklist is made from can carry the tag too. Tag one and it appears here.
        </p>
        <Button asChild size="sm" variant="outline" className="mt-3 h-8 px-2.5 text-xs">
          {/* A plain link: the Checklist tab is chosen from the URL on load. */}
          <a href={`/modules/project-links/${projectId}?tab=checklist`}>
            <ListChecks className="h-3.5 w-3.5" />
            {checklists.length === 0 ? 'Add a checklist' : 'Tag a section'}
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {sections.map(({ checklistId, checklistName, section }) => {
        const items = [...(section.items ?? [])].sort((a, b) => a.order - b.order);
        const statuses = items.map(
          (item) => overrides[itemKey(checklistId, section.id, item.id)] ?? item.status,
        );
        const skipped = statuses.filter((status) => status === 'skipped').length;
        const done = statuses.filter((status) => status === 'completed').length;
        const total = items.length - skipped;

        return (
          <section key={`${checklistId}:${section.id}`} className="overflow-hidden rounded-lg border bg-card">
            <header className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="text-base leading-none">
                  {section.emoji || '📋'}
                </span>
                <h3 className="truncate text-sm font-semibold">{section.title}</h3>
                {showChecklistName && (
                  <span className="truncate text-xs text-muted-foreground">{checklistName}</span>
                )}
              </div>
              <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {done} of {total}
                {skipped > 0 && <span className="ml-1.5">· {skipped} skipped</span>}
              </p>
            </header>

            <div className="divide-y divide-border/60">
              {items.map((item, index) => (
                <StageChecklistRow
                  key={item.id}
                  item={item}
                  status={statuses[index]}
                  verdict={autoVerdicts?.[item.id]}
                  disabled={disabled}
                  onChange={(status) => handleChange(checklistId, section.id, item.id, status)}
                />
              ))}

              {items.length === 0 && (
                <p className="px-3 py-3 text-xs text-muted-foreground">
                  This section has no items yet. Add them on the Checklist tab.
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
