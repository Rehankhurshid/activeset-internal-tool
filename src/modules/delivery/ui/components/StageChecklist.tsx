'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleDot,
  Copy,
  ExternalLink,
  Link as LinkIcon,
  ListChecks,
  MessageSquareQuote,
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
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { daysBetweenIso, todayIso } from '@/lib/review-status';
import { cn } from '@/lib/utils';
import type {
  ChecklistItem,
  ChecklistItemField,
  ChecklistItemLink,
  ChecklistItemStatus,
  ChecklistItemTemplate,
} from '@/types';
import type { SectionStage } from '../../domain/delivery.arc';
import type { AutoCheckVerdict } from '../../domain/delivery.types';
import { deliveryRepository } from '../../infrastructure/delivery.repository';
import { copyText } from './copy-text';

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

/**
 * Tidies a value on the way out of the field, not on the way in.
 *
 * Someone typing "meet.google.com/abc" has given us a URL; storing it without a
 * scheme makes it a dead link when it is clicked three weeks later. Emails are
 * kept as one comma-separated string because that is what gets pasted into
 * Slack's invite box, and re-spacing them is the only thing worth doing to them.
 */
function normalizeFieldValue(type: ChecklistItemField['type'], raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (type === 'url' && !/^[a-z][a-z0-9+.-]*:/i.test(value)) return `https://${value}`;
  if (type === 'emails') {
    return value
      .split(/[,;\s]+/)
      .filter(Boolean)
      .join(', ');
  }
  return value;
}

/** Only an http(s) value is safe to hand to an anchor, and only that is worth opening. */
function openableUrl(value: string): string | null {
  return /^https?:\/\//i.test(value) ? value : null;
}

interface TemplateChoice {
  label: string;
  /** What lands on the clipboard. */
  text: string;
  /** The option this choice is, when it is one, so it can be read before it is sent. */
  option?: string;
}

/** An option is a sentence and a button is not, so the button gets its opening words. */
function shortOptionLabel(option: string): string {
  const line = option.split('\n')[0].trim();
  const words = line.split(/\s+/);
  if (words.length <= 5 && line.length <= 32) return line;
  return `${words.slice(0, 5).join(' ').slice(0, 32)}…`;
}

/**
 * What the copy buttons put on the clipboard.
 *
 * With no options there is one message. With them, each option is composed onto
 * the body, because an option on its own is a fragment — "every two weeks" is
 * not something anyone can send — and the first is the one to send unless there
 * is a reason not to.
 */
function templateChoices(template: ChecklistItemTemplate): TemplateChoice[] {
  const body = (template.body ?? '').trim();
  const options = (template.options ?? []).map((option) => option.trim()).filter(Boolean);
  if (options.length === 0) {
    return [{ label: template.label?.trim() || 'Copy message', text: body }];
  }
  return options.map((option) => ({
    label: shortOptionLabel(option),
    text: body ? `${body}\n\n${option}` : option,
    option,
  }));
}

interface ItemFieldProps {
  field: ChecklistItemField;
  value: string;
  /** Ticked, expected, and still empty. Worth saying; never worth blocking. */
  missing: boolean;
  disabled?: boolean;
  onCommit: (value: string) => void;
}

function ItemField({ field, value, missing, disabled, onCommit }: ItemFieldProps) {
  const inputId = useId();
  const [draft, setDraft] = useState(value);
  // Every write re-renders this row through the subscription. Adopting the
  // stored value while someone is mid-sentence would eat their keystrokes, so it
  // is only adopted when nobody is in the field.
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);

  const commit = () => {
    editing.current = false;
    const next = normalizeFieldValue(field.type, draft);
    if (next !== draft) setDraft(next);
    if (next !== value) onCommit(next);
  };

  const openable = field.type === 'url' ? openableUrl(value) : null;

  return (
    <div className="min-w-0">
      <label
        htmlFor={inputId}
        className="flex flex-wrap items-center gap-x-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
      >
        {field.label}
        {missing && (
          <span className="font-normal normal-case tracking-normal text-amber-700 dark:text-amber-300">
            not recorded
          </span>
        )}
      </label>
      <div className="mt-1 flex items-center gap-1.5">
        <Input
          id={inputId}
          // The base size is deliberate: anything under 16px makes iOS Safari
          // zoom the whole page on focus, and this gets used from a phone.
          className={cn('h-9', missing && 'border-amber-500/50')}
          type={field.type === 'date' ? 'date' : field.type === 'url' ? 'url' : 'text'}
          inputMode={field.type === 'emails' ? 'email' : field.type === 'url' ? 'url' : undefined}
          autoComplete="off"
          placeholder={field.placeholder ?? (field.type === 'emails' ? 'name@client.com, …' : undefined)}
          disabled={disabled}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => {
            editing.current = true;
          }}
          onBlur={commit}
          // Enter is how a phone keyboard finishes; without this the value only
          // saves when something else happens to take the focus away.
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        {openable && (
          <a
            href={openable}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${field.label}`}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      {field.type === 'emails' && (
        <p className="mt-1 text-[10px] text-muted-foreground">Commas between them.</p>
      )}
    </div>
  );
}

interface ItemTemplateProps {
  template: ChecklistItemTemplate;
}

/**
 * The message this step needs sent, ready to paste.
 *
 * The body is one tap away rather than hidden: a button that silently fills the
 * clipboard with words nobody has read is how a client gets sent a placeholder.
 */
function ItemTemplate({ template }: ItemTemplateProps) {
  const [open, setOpen] = useState(false);
  const choices = useMemo(() => templateChoices(template), [template]);

  const copy = async (text: string) => {
    if (await copyText(text)) {
      toast.success('Copied — paste it to the client');
      return;
    }
    // The clipboard is refused on an insecure origin and by some mobile
    // browsers. Opening the message is the only useful answer left: it can be
    // selected and copied by hand.
    setOpen(true);
    toast.error('Could not reach the clipboard — the message is below, copy it by hand');
  };

  return (
    <div className="mt-2 rounded-md border border-dashed bg-muted/30 p-2">
      <div className="flex items-center gap-1.5">
        <MessageSquareQuote className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground">Message</span>
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          className="ml-auto inline-flex items-center gap-0.5 rounded-sm text-[10px] text-muted-foreground hover:text-foreground"
        >
          {open ? 'Hide' : 'Read it'}
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {open && template.body?.trim() && (
        <p className="mt-1.5 whitespace-pre-line rounded-md bg-background/70 p-2 text-[11px] leading-relaxed text-muted-foreground">
          {template.body.trim()}
        </p>
      )}

      <div className="mt-1.5 flex flex-col gap-1.5">
        {choices.map((choice, index) => (
          <div key={`${index}-${choice.label}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Button
              type="button"
              size="sm"
              variant={index === 0 ? 'secondary' : 'outline'}
              className="h-7 max-w-full px-2 text-xs"
              onClick={() => copy(choice.text)}
            >
              <Copy className="h-3 w-3" />
              <span className="truncate">{choice.label}</span>
            </Button>
            {index === 0 && choices.length > 1 && (
              <span className="text-[10px] text-muted-foreground">Suggest this one</span>
            )}
            {open && choice.option && (
              <p className="w-full whitespace-pre-line rounded-md bg-background/70 p-2 text-[11px] leading-relaxed text-muted-foreground">
                {choice.option}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface StageChecklistRowProps {
  item: ChecklistItem;
  status: ChecklistItemStatus;
  /** What the last page scans say about this item, when it names an auto check. */
  verdict?: AutoCheckVerdict;
  /** What this step recorded, with anything still in flight already folded in. */
  values: Record<string, string>;
  onChange: (status: ChecklistItemStatus) => void;
  onValueCommit: (fieldId: string, value: string) => void;
  disabled?: boolean;
}

function StageChecklistRow({
  item,
  status,
  verdict,
  values,
  onChange,
  onValueCommit,
  disabled,
}: StageChecklistRowProps) {
  const config = STATUS_CONFIG[status];
  const StatusIcon = config.icon;
  const answered = status === 'completed' || status === 'skipped';
  const links = linksOf(item);
  const due = dueState(item.dueDate, answered);
  const fields = (item.fields ?? []).filter((field) => field.id);
  const template = item.template;
  const hasTemplate = Boolean(template && (template.body?.trim() || template.options?.length));

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

        {/* What the step produced, recorded where the step is. One column on a
            phone, two once there is room for them. */}
        {fields.length > 0 && (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {fields.map((field) => (
              <ItemField
                key={field.id}
                field={field}
                value={values[field.id] ?? ''}
                // Completed, not answered: skipped means the step did not apply
                // here, and nothing is missing from a step nobody did.
                missing={
                  status === 'completed' &&
                  Boolean(field.expected) &&
                  !(values[field.id] ?? '').trim()
                }
                disabled={disabled}
                onCommit={(value) => onValueCommit(field.id, value)}
              />
            ))}
          </div>
        )}

        {hasTemplate && template && <ItemTemplate template={template} />}
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
  // The same for recorded values, item key → field id → value. A blur writes and
  // the subscription echoes a whole new checklist a moment later; without this
  // the field would show the stored value again on the way through.
  const [valueOverrides, setValueOverrides] = useState<Record<string, Record<string, string>>>({});

  const { checklistId, items } = stage;
  const sectionId = stage.section.id;

  const serverStatuses = useMemo(() => {
    const map: Record<string, ChecklistItemStatus> = {};
    for (const item of items) map[itemKey(checklistId, sectionId, item.id)] = item.status;
    return map;
  }, [items, checklistId, sectionId]);

  const serverValues = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    for (const item of items) map[itemKey(checklistId, sectionId, item.id)] = item.values ?? {};
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

  // Same discipline as the ticks: a pending value is dropped the moment the
  // stored one agrees with it, so someone else's edit is not masked by ours.
  useEffect(() => {
    setValueOverrides((prev) => {
      const next: Record<string, Record<string, string>> = {};
      let changed = false;
      for (const [key, pending] of Object.entries(prev)) {
        const stored = serverValues[key];
        const remaining: Record<string, string> = {};
        for (const [fieldId, value] of Object.entries(pending)) {
          if (stored === undefined || (stored[fieldId] ?? '') === value) changed = true;
          else remaining[fieldId] = value;
        }
        if (Object.keys(remaining).length > 0) next[key] = remaining;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [serverValues]);

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

  const handleValueCommit = useCallback(
    async (itemId: string, fieldId: string, value: string) => {
      const key = itemKey(checklistId, sectionId, itemId);
      const previous = valueOverrides[key]?.[fieldId];
      setValueOverrides((prev) => ({ ...prev, [key]: { ...prev[key], [fieldId]: value } }));
      try {
        // One field, not the whole map: two people can be on the same step.
        await deliveryRepository.setChecklistItemValues(checklistId, sectionId, itemId, {
          [fieldId]: value,
        });
      } catch {
        setValueOverrides((prev) => {
          const forItem = { ...prev[key] };
          if (previous === undefined) delete forItem[fieldId];
          else forItem[fieldId] = previous;
          const next = { ...prev };
          if (Object.keys(forItem).length > 0) next[key] = forItem;
          else delete next[key];
          return next;
        });
        toast.error('Could not save that — it has been put back');
      }
    },
    [valueOverrides, checklistId, sectionId],
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
            values={{
              ...(item.values ?? {}),
              ...valueOverrides[itemKey(checklistId, sectionId, item.id)],
            }}
            disabled={disabled}
            onChange={(status) => handleChange(item.id, status)}
            onValueCommit={(fieldId, value) => handleValueCommit(item.id, fieldId, value)}
          />
        ))}
      </div>
    </div>
  );
}
