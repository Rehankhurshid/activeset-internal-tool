'use client';

import { useEffect, useMemo, useState } from 'react';
import { CircleAlert, Link as LinkIcon, ListPlus, Loader2 } from 'lucide-react';
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
import type { ProjectChecklist } from '@/types';
import { basicsGap, type MissingBasic } from '../../domain/delivery.basics';
import { deliveryRepository } from '../../infrastructure/delivery.repository';

/**
 * The agency's own routine, offered to a project that is running without it.
 *
 * The Slack channel, the welcome email, the kickoff call, the walkthrough videos
 * at the end — the same on every engagement, and now put onto every checklist at
 * creation. A checklist is a deep copy though, so a project that started before
 * that happened keeps the copy it was born with forever, and no amount of fixing
 * how new ones are made reaches it. This is the only way in.
 *
 * Its sibling {@link TemplateImprovements} carries what a project learned back
 * up to its SOP; this comes the other way, from the SOP down onto a project that
 * missed it. Same quiet trigger, same rule: it renders nothing when there is
 * nothing to offer, because a control that is always on screen is one nobody
 * reads.
 */

/** One checklist, and the basics it never got. */
interface ChecklistGap {
  checklistId: string;
  checklistName: string;
  missing: MissingBasic[];
}

/** Unique across checklists, because one dialog can be offering several. */
function choiceKey(checklistId: string, missing: MissingBasic): string {
  return `${checklistId}::${missing.key}`;
}

/** Where the steps land, said the way a person would say it. */
const PLACEMENT_HINT: Record<MissingBasic['placement'], string> = {
  start: 'goes at the front, before the build',
  close: 'goes at the end, after the build',
};

/**
 * The gap split into the two places it goes, start first.
 *
 * The order is written here rather than read off the gap: these are the front and
 * the back of a project, and that is true whatever order they arrived in.
 */
function byPlacement(
  missing: MissingBasic[],
): { placement: MissingBasic['placement']; title: string; missing: MissingBasic[] }[] {
  const placements: MissingBasic['placement'][] = ['start', 'close'];
  return placements
    .map((placement) => {
      const items = missing.filter((item) => item.placement === placement);
      return { placement, title: items[0]?.sectionTitle ?? '', missing: items };
    })
    .filter((group) => group.missing.length > 0);
}

interface BasicRowProps {
  id: string;
  missing: MissingBasic;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}

/**
 * One step, with enough of it on screen to decide.
 *
 * The how-to and the links are shown rather than summarised, because "Create the
 * shared Slack channel" and "Create the shared Slack channel, named the same way
 * every time, via the workflow" are different steps to whoever runs it next.
 */
function BasicRow({ id, missing, checked, onToggle }: BasicRowProps) {
  const { item, resembles, likelyDuplicate } = missing;
  const links = (item.links ?? []).filter((link) => link.url);

  return (
    <div className="flex items-start gap-2.5 px-2 py-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onToggle(next === true)}
        className="mt-0.5"
      />

      <div className="min-w-0 flex-1 space-y-1.5">
        <label
          htmlFor={id}
          className="flex cursor-pointer flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-sm leading-snug"
        >
          {item.emoji && <span aria-hidden>{item.emoji}</span>}
          <span className="min-w-0">{item.title}</span>
          {item.blocking && (
            <Badge
              variant="outline"
              className="h-5 border-rose-500/40 px-1.5 text-[10px] font-normal text-rose-700 dark:text-rose-300"
            >
              Blocking
            </Badge>
          )}
        </label>

        {/* Named, not hidden: the wording already on the project may well be the
            better one, and adding this anyway is how a checklist ends up with
            two steps that mean the same thing. Only a strong resemblance starts
            unticked, though — the matching is word overlap, and it is wrong
            often enough that erring towards adding is the safer default. */}
        {resembles && (
          <p className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
            <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="min-w-0">
              {likelyDuplicate ? 'You probably already have this' : 'This may overlap with'}:{' '}
              &ldquo;{resembles}&rdquo;
            </span>
          </p>
        )}

        {item.howTo && (
          <p className="whitespace-pre-line rounded-md bg-muted/30 px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
            {item.howTo}
          </p>
        )}

        {links.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
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
          </div>
        )}
      </div>
    </div>
  );
}

export interface AddAgencyBasicsProps {
  /** Every checklist on the project. Each has its own gap and its own write. */
  checklists: ProjectChecklist[];
  className?: string;
}

export function AddAgencyBasics({ checklists, className }: AddAgencyBasicsProps) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  /**
   * Which resemblances Jev judged, keyed by checklist id.
   *
   * The cheap word-overlap answer renders immediately; this replaces it when it
   * lands. Overlap has to tell "Create Slack Channel with Client" from "Create
   * the shared Slack channel with the client" without also matching "Schedule
   * the kickoff call" to "Hold the kickoff call", and it cannot. But waiting on
   * a judgment to show the dialog would be worse than showing a good guess, and
   * an absent or slow judgment has to cost nothing.
   */
  const [judged, setJudged] = useState<Record<string, MissingBasic[]>>({});

  const localGaps = useMemo<ChecklistGap[]>(
    () =>
      checklists
        .map((checklist) => ({
          checklistId: checklist.id,
          checklistName: checklist.templateName || 'This checklist',
          missing: basicsGap(checklist).missing,
        }))
        .filter((gap) => gap.missing.length > 0),
    [checklists],
  );

  const gaps = useMemo<ChecklistGap[]>(
    () => localGaps.map((gap) => ({ ...gap, missing: judged[gap.checklistId] ?? gap.missing })),
    [localGaps, judged],
  );

  // Asked once the dialog is open, not on every render of the trigger: the
  // trigger renders on every project screen and this is a paid request.
  const idsKey = localGaps.map((gap) => gap.checklistId).join('|');
  useEffect(() => {
    if (!open || !idsKey) return;
    let cancelled = false;

    void Promise.all(
      idsKey.split('|').map(async (checklistId) => {
        try {
          const res = await deliveryRepository.judgeBasicsGap(checklistId);
          return res?.judged ? ([checklistId, res.missing] as const) : null;
        } catch {
          // The guess already on screen is a fine answer. A failed judgment is
          // not worth an error somebody has to dismiss.
          return null;
        }
      }),
    ).then((rows) => {
      if (cancelled) return;
      const next = Object.fromEntries(rows.filter((row): row is NonNullable<typeof row> => row !== null));
      if (Object.keys(next).length > 0) setJudged((prev) => ({ ...prev, ...next }));
    });

    return () => {
      cancelled = true;
    };
  }, [open, idsKey]);

  const total = gaps.reduce((sum, gap) => sum + gap.missing.length, 0);
  const picked = gaps.reduce(
    (sum, gap) => sum + gap.missing.filter((item) => chosen.has(choiceKey(gap.checklistId, item))).length,
    0,
  );

  const handleOpenChange = (next: boolean) => {
    // Seeded on opening rather than as the gap changes: the checklists arrive
    // from a live subscription, and re-seeding on a snapshot would tick boxes
    // somebody had just cleared. Everything is ticked except the steps that are
    // almost certainly already here under another name — a mere resemblance is
    // not enough, because failing to add a standard step is invisible and a
    // duplicate takes two seconds to delete.
    if (next) {
      setChosen(
        new Set(
          gaps.flatMap((gap) =>
            gap.missing
              .filter((item) => !item.likelyDuplicate)
              .map((item) => choiceKey(gap.checklistId, item)),
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
    const batches = gaps
      .map((gap) => ({
        gap,
        picked: gap.missing.filter((item) => chosen.has(choiceKey(gap.checklistId, item))),
      }))
      .filter((batch) => batch.picked.length > 0);
    if (batches.length === 0) return;

    setSaving(true);
    let written = 0;
    let steps = 0;
    try {
      // One write per checklist, in order. They are separate documents, so a
      // failure on the second leaves the first saved — which is why what got
      // through is counted rather than assumed.
      for (const batch of batches) {
        await deliveryRepository.addAgencyBasics(batch.gap.checklistId, batch.picked);
        written += 1;
        steps += batch.picked.length;
      }

      const first = batches[0];
      toast.success(
        batches.length === 1
          ? `${steps} ${steps === 1 ? 'step' : 'steps'} added to "${first.gap.checklistName}".`
          : `${steps} steps added across ${batches.length} checklists.`,
      );
      setOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add those steps';
      toast.error(
        written > 0
          ? `${message} — ${steps} ${steps === 1 ? 'step' : 'steps'} went onto ${written} of ${batches.length} checklists first`
          : message,
      );
    } finally {
      setSaving(false);
      // Nothing to refetch: the checklists come from a live subscription, so
      // whatever landed stops being offered on the next snapshot, and a partial
      // failure leaves exactly the rest still on offer.
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
          <ListPlus className="h-3.5 w-3.5" />
          Add {total} standard {total === 1 ? 'step' : 'steps'}
        </Button>
      </DialogTrigger>

      {/* A column rather than the default grid: the list is the only part that
          should scroll, so Add stays on screen however long the gap is. */}
      <DialogContent className="gap-3 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Add the standard steps</DialogTitle>
          <DialogDescription className="text-xs">
            This checklist was copied from its template the day the project started, so the steps
            every engagement is supposed to have — the Slack channel, the welcome email, the
            kickoff call, the walkthrough videos at the end — never reached it. Pick what belongs
            here.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 space-y-4 px-1">
          {gaps.map((gap) => (
            <div key={gap.checklistId} className="space-y-2">
              {/* Named only when there is more than one: on a project with a
                  single checklist the name is noise above its own contents. */}
              {gaps.length > 1 && (
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="text-sm font-semibold">{gap.checklistName}</p>
                  <span className="text-[11px] text-muted-foreground">
                    {gap.missing.length} missing
                  </span>
                </div>
              )}

              {byPlacement(gap.missing).map((group) => (
                <div
                  key={group.placement}
                  className="overflow-hidden rounded-lg border bg-card"
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b bg-muted/30 px-2.5 py-1.5">
                    <p className="text-xs font-medium">{group.title}</p>
                    <span className="text-[10px] text-muted-foreground">
                      {PLACEMENT_HINT[group.placement]}
                    </span>
                  </div>
                  <div className="divide-y divide-border/60">
                    {group.missing.map((missing) => {
                      const key = choiceKey(gap.checklistId, missing);
                      return (
                        <BasicRow
                          key={key}
                          id={`basic-${key}`}
                          missing={missing}
                          checked={chosen.has(key)}
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
            {picked} of {total} chosen. Nothing already on the checklist is touched.
          </p>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2.5 text-xs"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 px-2.5 text-xs"
              disabled={saving || picked === 0}
              onClick={save}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ListPlus className="h-3.5 w-3.5" />
              )}
              {saving
                ? 'Adding…'
                : `Add ${picked === total ? 'all' : picked} to the checklist${gaps.length > 1 ? 's' : ''}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
