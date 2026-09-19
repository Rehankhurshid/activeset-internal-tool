'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUpFromLine, ExternalLink, Link as LinkIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { ProjectChecklist, SOPTemplate, StageRole } from '@/types';
import {
  improvementsFor,
  type Improvement,
  type ItemGuidance,
} from '../../domain/delivery.feedback';
import { deliveryRepository } from '../../infrastructure/delivery.repository';
import { AUTO_CHECK_DESCRIPTIONS } from './CheckStatusControl';

/**
 * What a project worked out, offered back to the SOP it came from.
 *
 * The checklist is deep-copied onto the project, so the copy is one-way:
 * somebody spends an afternoon establishing what a step actually involves,
 * writes it down here, and the next build starts from the same blank line. This
 * is the way back — the project's checklists diffed against their templates, one
 * checkbox each, and a write that only ever touches guidance.
 *
 * It renders nothing at all when the diff is empty, which is most of the time.
 * Something that volunteers itself has to earn the interruption, and a count
 * that is always on screen is a count nobody reads.
 */

/** One template, with everything this project could teach it. */
interface TemplateGroup {
  templateId: string;
  templateName: string;
  /** Built-ins live in code, so there is no document behind them to write to. */
  builtIn: boolean;
  improvements: Improvement[];
}

/** Unique across templates, because one dialog can be offering several. */
/**
 * The templates a checklist came from.
 *
 * `templateIds` was added after merged checklists already existed, so an older
 * one carries only `templateId` — the first of however many it was built from.
 * Those still work; they just cannot offer anything back to the templates after
 * the first, which is better than pretending to.
 */
function sourceTemplateIds(checklist: ProjectChecklist): string[] {
  const ids = checklist.templateIds?.length ? checklist.templateIds : [checklist.templateId];
  return [...new Set(ids.filter(Boolean))];
}

function choiceKey(templateId: string, improvement: Improvement): string {
  return `${templateId}::${improvement.key}`;
}

/** Roles as the Delivery tab says them, rather than as they are stored. */
const ROLE_LABELS: Record<StageRole, string> = {
  kickoff: 'Kickoff',
  pages: 'Page build',
  client_review: 'Client review',
  launch: 'Launch',
};

function roleLabel(role: StageRole | undefined): string {
  return role ? ROLE_LABELS[role] : 'no role';
}

const KIND_LABELS: Record<Improvement['kind'], string> = {
  changed: 'Changed',
  added: 'New step',
  role: 'Stage role',
};

/** Improvements in the order they arrived, gathered under their section. */
function bySection(improvements: Improvement[]): { title: string; improvements: Improvement[] }[] {
  const out: { title: string; improvements: Improvement[] }[] = [];
  for (const improvement of improvements) {
    const last = out[out.length - 1];
    const existing =
      last?.title === improvement.sectionTitle
        ? last
        : out.find((group) => group.title === improvement.sectionTitle);
    if (existing) existing.improvements.push(improvement);
    else out.push({ title: improvement.sectionTitle, improvements: [improvement] });
  }
  return out;
}

interface GuidanceBlockProps {
  label: string;
  guidance: ItemGuidance;
  /** The project's side — the one being offered, so it is the one tinted. */
  proposed?: boolean;
}

/**
 * One side of a change, as it would read to whoever runs the step next.
 *
 * The how-to keeps its line breaks, because it is written as a few short lines
 * and collapsing them is what makes a change impossible to judge. No
 * character-level diff: two legible versions, labelled, answer "is this better?"
 * better than a field of highlights does.
 */
function GuidanceBlock({ label, guidance, proposed }: GuidanceBlockProps) {
  const links = guidance.links ?? [];
  const extras = links.length > 0 || guidance.blocking || guidance.autoCheck;

  return (
    <div className="min-w-0 space-y-1">
      <p
        className={cn(
          'text-[10px] font-medium uppercase tracking-wide',
          proposed ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
        )}
      >
        {label}
      </p>
      <div
        className={cn(
          'rounded-md border px-2 py-1.5 text-xs',
          proposed ? 'border-emerald-500/30 bg-emerald-500/5' : 'bg-muted/30',
        )}
      >
        {guidance.howTo ? (
          <p className="whitespace-pre-line leading-relaxed">{guidance.howTo}</p>
        ) : (
          <p className="italic text-muted-foreground">No how-to</p>
        )}

        {extras && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {links.map((link) => (
              <span
                key={`${link.label}|${link.url}`}
                className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                <LinkIcon className="h-2.5 w-2.5" />
                {link.label || 'Link'}
              </span>
            ))}
            {guidance.blocking && (
              <Badge
                variant="outline"
                className="h-5 border-rose-500/40 px-1.5 text-[10px] font-normal text-rose-700 dark:text-rose-300"
              >
                Blocking
              </Badge>
            )}
            {guidance.autoCheck && (
              <Badge
                variant="outline"
                className="h-5 border-dashed px-1.5 text-[10px] font-normal text-muted-foreground"
              >
                from scan: {AUTO_CHECK_DESCRIPTIONS[guidance.autoCheck]}
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface ImprovementRowProps {
  id: string;
  improvement: Improvement;
  checked: boolean;
  /** A built-in template has nowhere to write to, so its rows are read-only. */
  locked?: boolean;
  onToggle: (checked: boolean) => void;
}

function ImprovementRow({ id, improvement, checked, locked, onToggle }: ImprovementRowProps) {
  // A role improvement is about the section, which is already the heading above
  // this list — repeating it there reads as two different things with one name.
  const heading = improvement.itemTitle ?? 'This stage';

  return (
    <div className="flex items-start gap-2.5 px-2 py-2">
      <Checkbox
        id={id}
        checked={checked}
        disabled={locked}
        onCheckedChange={(next) => onToggle(next === true)}
        className="mt-0.5"
      />

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <label
            htmlFor={id}
            className={cn('text-sm leading-snug', locked ? 'cursor-default' : 'cursor-pointer')}
          >
            {heading}
          </label>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
            {KIND_LABELS[improvement.kind]}
          </span>
        </div>

        <p className="text-xs text-muted-foreground">{improvement.summary}</p>

        {/* A role is one value either side, so it reads as a line rather than
            two blocks — and in the words Delivery uses, not the stored ones. */}
        {improvement.kind === 'role' && (
          <p className="text-xs">
            <span className="text-muted-foreground">{roleLabel(improvement.before?.role)}</span>
            {' → '}
            <span className="font-medium">{roleLabel(improvement.after.role)}</span>
          </p>
        )}

        {/* Only a rewrite needs both versions; an added step has no "before". */}
        {improvement.kind === 'changed' && improvement.before && (
          <div className="grid gap-2 sm:grid-cols-2">
            <GuidanceBlock label="Template today" guidance={improvement.before} />
            <GuidanceBlock label="This project" guidance={improvement.after} proposed />
          </div>
        )}

        {improvement.kind === 'added' && (
          <GuidanceBlock label="What it would say" guidance={improvement.after} proposed />
        )}
      </div>
    </div>
  );
}

export interface TemplateImprovementsProps {
  /** Every checklist on the project. Each is diffed against its own template. */
  checklists: ProjectChecklist[];
  className?: string;
}

export function TemplateImprovements({ checklists, className }: TemplateImprovementsProps) {
  const [templates, setTemplates] = useState<SOPTemplate[]>([]);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);

  // A string rather than the array, because the checklists arrive from a live
  // subscription: a new array every snapshot would refetch every template on
  // every tick. Firestore ids cannot contain a pipe.
  const idsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const checklist of checklists) for (const id of sourceTemplateIds(checklist)) ids.add(id);
    return [...ids].join('|');
  }, [checklists]);

  useEffect(() => {
    const ids = idsKey ? idsKey.split('|') : [];
    if (ids.length === 0) {
      setTemplates([]);
      return;
    }

    let cancelled = false;
    // A template can be deleted while projects made from it are still running,
    // and this is an offer nobody asked for — a missing or unreadable one is
    // dropped rather than turned into an error somebody has to dismiss.
    void Promise.all(
      ids.map((id) => deliveryRepository.getSOPTemplate(id).catch(() => null)),
    ).then((found) => {
      if (!cancelled) setTemplates(found.filter((template): template is SOPTemplate => !!template));
    });

    return () => {
      cancelled = true;
    };
  }, [idsKey, reload]);

  const groups = useMemo<TemplateGroup[]>(() => {
    if (templates.length === 0) return [];
    const byId = new Map(templates.map((template) => [template.id, template]));
    const out = new Map<string, TemplateGroup>();

    for (const checklist of checklists) {
      // Every template it was built from, not just the first: a merged checklist
      // would otherwise drop the later templates' sections without saying so.
      // Each diff skips the sections that template does not have, so running the
      // same checklist against several of them sorts itself out.
      for (const templateId of sourceTemplateIds(checklist)) {
        const template = byId.get(templateId);
        if (!template) continue;
        const improvements = improvementsFor(checklist, template);
        if (improvements.length === 0) continue;

        // Two checklists can share a template. They are gathered under it, since
        // the save that follows rewrites that one template's sections.
        const group = out.get(template.id) ?? {
          templateId: template.id,
          templateName: template.name,
          builtIn: Boolean(template.isBuiltIn),
          improvements: [],
        };
        group.improvements = [...group.improvements, ...improvements];
        out.set(template.id, group);
      }
    }

    return [...out.values()];
  }, [checklists, templates]);

  const total = groups.reduce((sum, group) => sum + group.improvements.length, 0);
  const writable = groups.filter((group) => !group.builtIn);
  const readOnly = groups.filter((group) => group.builtIn);
  // Counted over the writable templates only: a built-in's rows can be read and
  // never sent, so counting them would promise something that cannot happen.
  const offered = writable.reduce((sum, group) => sum + group.improvements.length, 0);
  const sendable = writable.reduce(
    (sum, group) =>
      sum + group.improvements.filter((i) => chosen.has(choiceKey(group.templateId, i))).length,
    0,
  );

  const handleOpenChange = (next: boolean) => {
    // Everything is chosen on opening, because everything here was written by
    // someone doing the work. Re-seeding while the dialog is open would tick
    // boxes somebody had just cleared.
    if (next) {
      setChosen(
        new Set(
          groups.flatMap((group) =>
            group.improvements.map((i) => choiceKey(group.templateId, i)),
          ),
        ),
      );
    }
    setOpen(next);
  };

  const toggle = (key: string, checked: boolean) => {
    setChosen((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const save = async () => {
    const batches = writable
      .map((group) => ({
        group,
        improvements: group.improvements.filter((i) =>
          chosen.has(choiceKey(group.templateId, i)),
        ),
      }))
      .filter((batch) => batch.improvements.length > 0);
    if (batches.length === 0) return;

    setSaving(true);
    let done = 0;
    try {
      // One write per template, in order. They are independent documents, so a
      // failure on the second leaves the first saved — which is why the count
      // that got through is reported rather than assumed.
      for (const batch of batches) {
        await deliveryRepository.saveTemplateImprovements(
          batch.group.templateId,
          batch.improvements,
        );
        done += 1;
      }

      const first = batches[0];
      toast.success(
        batches.length === 1
          ? `${first.improvements.length} ${first.improvements.length === 1 ? 'improvement' : 'improvements'} sent to "${first.group.templateName}". The next project starts with them.`
          : `${sendable} improvements sent to ${batches.length} templates.`,
      );
      setOpen(false);
    } catch (error) {
      // The message is the point: the one for a built-in template says what to
      // do instead, and flattening it to "failed" would throw that away.
      const message =
        error instanceof Error ? error.message : 'Could not send those improvements';
      toast.error(
        done > 0 ? `${message} — ${done} of ${batches.length} templates were updated` : message,
      );
    } finally {
      setSaving(false);
      // Whatever landed should stop being offered, and a failure may still have
      // written some of it.
      setReload((n) => n + 1);
    }
  };

  if (total === 0) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => (saving ? undefined : handleOpenChange(next))}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className={cn(
            'h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground',
            className,
          )}
        >
          <ArrowUpFromLine className="h-3.5 w-3.5" />
          {total} {total === 1 ? 'improvement' : 'improvements'} for{' '}
          {groups.length === 1 ? 'the template' : `${groups.length} templates`}
        </Button>
      </DialogTrigger>

      {/* A column rather than the default grid: the list is the only part that
          should scroll, so Save stays on screen however long the diff is. */}
      <DialogContent className="gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">Send improvements back to the SOP</DialogTitle>
          <DialogDescription className="text-xs">
            What this project knows that its template does not. Only how the work is done travels —
            the how-to, the links, whether a step gates the stage. Notes, owners, dates and statuses
            stay here, because they are facts about this build.
          </DialogDescription>
        </DialogHeader>

        {readOnly.length > 0 && (
          <div className="rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
            <p className="font-medium">
              {readOnly.length === 1
                ? `"${readOnly[0].templateName}" is a built-in template.`
                : `${readOnly.length} of these are built-in templates.`}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              Built-ins ship with the app and live in code, so nothing can be written to them —
              read what is below, then duplicate the template in the Checklist Creator and point the
              project at the copy. Improvements will have somewhere to go from then on.
            </p>
            <Button asChild size="sm" variant="outline" className="mt-2 h-7 px-2 text-xs">
              {/* A plain link: the Creator is its own page, and this dialog is
                  not worth keeping open behind it. */}
              <a href="/modules/checklist-creator">
                Open the Checklist Creator
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </a>
            </Button>
          </div>
        )}

        <div className="-mx-1 space-y-4 px-1">
          {groups.map((group) => (
            <div key={group.templateId} className="space-y-2">
              {/* Named even when there is only one, so it is always obvious
                  which SOP is about to change. */}
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-sm font-semibold">{group.templateName}</p>
                <span className="text-[11px] text-muted-foreground">
                  {group.builtIn
                    ? 'read-only'
                    : `${group.improvements.length} ${group.improvements.length === 1 ? 'improvement' : 'improvements'}`}
                </span>
              </div>

              {bySection(group.improvements).map((section) => (
                <div key={section.title} className="overflow-hidden rounded-lg border bg-card">
                  <p className="border-b bg-muted/30 px-2.5 py-1.5 text-xs font-medium">
                    {section.title}
                  </p>
                  <div className="divide-y divide-border/60">
                    {section.improvements.map((improvement) => {
                      const key = choiceKey(group.templateId, improvement);
                      return (
                        <ImprovementRow
                          key={key}
                          id={`improvement-${key}`}
                          improvement={improvement}
                          checked={chosen.has(key)}
                          locked={group.builtIn}
                          onToggle={(checked) => toggle(key, checked)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            {writable.length === 0
              ? 'Nothing here can be saved yet.'
              : `${sendable} of ${offered} chosen. Nothing on this project changes.`}
          </p>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2.5 text-xs"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              {writable.length === 0 ? 'Close' : 'Cancel'}
            </Button>
            {writable.length > 0 && (
              <Button
                size="sm"
                className="h-8 px-2.5 text-xs"
                disabled={saving || sendable === 0}
                onClick={save}
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowUpFromLine className="h-3.5 w-3.5" />
                )}
                {saving ? 'Sending…' : `Send ${sendable === offered ? 'all' : sendable} to the SOP`}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
