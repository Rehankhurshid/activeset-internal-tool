'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { AutoCheckId, ProjectDeliveryState, StackCheck } from '../../domain/delivery.types';
import { deliveryRepository } from '../../infrastructure/delivery.repository';
import { AUTO_CHECK_DESCRIPTIONS, AUTO_CHECK_IDS, autoCheckIdOf } from './CheckStatusControl';

/**
 * The per-page QC questions, edited per project.
 *
 * These are the one part of delivery that cannot move into the project's own
 * checklist — that model has no page axis, so it cannot ask one question of
 * twenty-six pages — but a fixed list in TypeScript cannot be changed without a
 * deploy, and no two builds ask exactly the same things. So the stack only
 * supplies a starting set and this writes the project's own list over it.
 *
 * Two things are stated rather than hidden. Answers are keyed by check id, so a
 * rename keeps them and a removal leaves them on the page documents where they
 * stop being shown or counted — that is worth a warning with a number in it. And
 * a scan can only answer the signals the scanner actually computes, so the
 * automatic column offers those and nothing else: a made-up id would look
 * automatic and never resolve.
 */

/** The persisted shape, field for field the same as a stack's `StackCheck`. */
type SavedPageCheck = NonNullable<ProjectDeliveryState['pageChecks']>[number];

interface DraftRow {
  /** React identity, stable across renames and reorders. Not the check id. */
  key: string;
  /** Empty until saved for a row someone just added. */
  id: string;
  title: string;
  group: string;
  auto?: AutoCheckId;
  note?: string;
  /** Set when the note field is open but still empty. */
  noteOpen?: boolean;
}

const NO_AUTO = '__none__';
const DEFAULT_GROUP = 'General';

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `row_${keySeq}`;
}

function toDraft(checks: StackCheck[]): DraftRow[] {
  return checks.map((check) => ({
    key: nextKey(),
    id: check.id,
    title: check.title,
    group: check.group,
    auto: autoCheckIdOf(check),
    note: check.note,
    noteOpen: Boolean(check.note),
  }));
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return slug || 'check';
}

/**
 * A new check's id: readable, and never one that pages already carry answers
 * under. Reusing an id would silently adopt another question's answers.
 */
function makeCheckId(title: string, taken: Set<string>): string {
  const base = slugify(title);
  let id = `${base}_${Math.random().toString(36).slice(2, 6)}`;
  while (taken.has(id)) id = `${base}_${Math.random().toString(36).slice(2, 6)}`;
  taken.add(id);
  return id;
}

function signature(rows: DraftRow[]): string {
  return JSON.stringify(
    rows.map((row) => [row.id, row.title.trim(), row.group.trim(), row.auto ?? '', (row.note ?? '').trim()]),
  );
}

export interface PageChecksEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** The list in force right now — the project's saved one, or the stack default. */
  checks: StackCheck[];
  /** The stack's starting set, for resetting. */
  defaultChecks: StackCheck[];
  /** Named in the reset warning, e.g. "Webflow". */
  stackName: string;
  /** True once this project has its own saved list rather than following the stack. */
  saved: boolean;
  /** Check id → how many pages already carry an answer for it. */
  answeredCounts: Record<string, number>;
  /** Called with the saved list, so the screen can show it before Firestore echoes. */
  onSaved?: (checks: StackCheck[]) => void;
}

export function PageChecksEditor({
  open,
  onOpenChange,
  projectId,
  checks,
  defaultChecks,
  stackName,
  saved,
  answeredCounts,
  onSaved,
}: PageChecksEditorProps) {
  const [rows, setRows] = useState<DraftRow[]>(() => toDraft(checks));
  const [baseline, setBaseline] = useState<string>(() => signature(toDraft(checks)));
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Opening the dialog starts from whatever is in force; closing it throws the
  // draft away, so Cancel really does cancel.
  useEffect(() => {
    if (!open) return;
    const draft = toDraft(checks);
    setRows(draft);
    setBaseline(signature(draft));
    setConfirmRemove(null);
    setConfirmReset(false);
    setFocusKey(null);
    setError(null);
    // `checks` is the list as of opening; re-syncing mid-edit would eat typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const groupNames = useMemo(() => {
    const names = new Set<string>();
    for (const row of rows) if (row.group.trim()) names.add(row.group.trim());
    for (const check of defaultChecks) names.add(check.group);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [rows, defaultChecks]);

  const dirty = signature(rows) !== baseline;
  const removedWithAnswers = useMemo(() => {
    const live = new Set(rows.map((row) => row.id).filter(Boolean));
    return Object.entries(answeredCounts).filter(([id, count]) => count > 0 && !live.has(id));
  }, [rows, answeredCounts]);

  const patch = (key: string, next: Partial<DraftRow>) => {
    setError(null);
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...next } : row)));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    setError(null);
    setRows((prev) => {
      const next = [...prev];
      const [row] = next.splice(index, 1);
      next.splice(target, 0, row);
      return next;
    });
  };

  const remove = (key: string) => {
    setConfirmRemove(null);
    setError(null);
    setRows((prev) => prev.filter((row) => row.key !== key));
  };

  const addRow = () => {
    const key = nextKey();
    setError(null);
    setRows((prev) => [
      ...prev,
      { key, id: '', title: '', group: prev[prev.length - 1]?.group ?? DEFAULT_GROUP },
    ]);
    setFocusKey(key);
  };

  const applyDefaults = () => {
    setConfirmReset(false);
    setError(null);
    setRows(toDraft(defaultChecks));
  };

  const save = async () => {
    const trimmed = rows.map((row) => ({ ...row, title: row.title.trim(), group: row.group.trim() }));
    if (trimmed.some((row) => !row.title)) {
      setError('Every check needs a title.');
      return;
    }
    if (trimmed.length === 0) {
      // An empty saved list is indistinguishable from never having saved one, so
      // it would quietly bring the stack default back rather than clearing QC.
      setError(
        `An empty list cannot be saved — the project would fall straight back to the ${stackName} default. Mark checks as not required on the pages instead.`,
      );
      return;
    }

    // Ids pages already answered under are off limits for anything new, along
    // with everything currently in the list and in the stack default.
    const taken = new Set<string>([
      ...Object.keys(answeredCounts),
      ...checks.map((check) => check.id),
      ...defaultChecks.map((check) => check.id),
      ...trimmed.map((row) => row.id).filter(Boolean),
    ]);

    const resolved = trimmed.map((row) => ({
      ...row,
      id: row.id || makeCheckId(row.title, taken),
    }));

    // Firestore rejects `undefined`, so optional fields are omitted, not blanked.
    const payload: SavedPageCheck[] = resolved.map((row, order) => ({
      id: row.id,
      title: row.title,
      group: row.group || DEFAULT_GROUP,
      order,
      ...(row.auto ? { auto: row.auto } : {}),
      ...(row.note?.trim() ? { note: row.note.trim() } : {}),
    }));

    setSaving(true);
    try {
      await deliveryRepository.setPageChecks(projectId, payload);
      onSaved?.(payload);
      toast.success('Page checks saved');
      onOpenChange(false);
    } catch (err) {
      // Nothing was written, so the draft is left exactly as it is and can be
      // saved again — the dialog stays open rather than losing the edit.
      toast.error(err instanceof Error ? err.message : 'Could not save the page checks');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (saving ? undefined : onOpenChange(next))}>
      <DialogContent className="gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">Page checks</DialogTitle>
          <DialogDescription className="text-xs">
            The QC questions asked of every page on this project. Renaming a check keeps the answers
            already given — they are stored against the check, not its wording.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 space-y-3 px-1">
          <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            {saved
              ? `This project has its own list. The ${stackName} starting set no longer applies to it.`
              : `This project is still on the ${stackName} starting set — nothing is saved against it yet. Saving any edit here stores this whole list on the project, and it stops following the stack.`}
          </p>

          <div className="space-y-1.5">
            {rows.map((row, index) => {
              const answered = row.id ? (answeredCounts[row.id] ?? 0) : 0;
              const confirming = confirmRemove === row.key;
              return (
                <div
                  key={row.key}
                  className={cn(
                    'rounded-md border p-1.5',
                    confirming && 'border-destructive/50 bg-destructive/5',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <div className="flex flex-col">
                      <button
                        type="button"
                        aria-label={`Move ${row.title || 'check'} up`}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                        className="flex h-3.5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                      >
                        <ArrowUp className="size-3" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${row.title || 'check'} down`}
                        disabled={index === rows.length - 1}
                        onClick={() => move(index, 1)}
                        className="flex h-3.5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                      >
                        <ArrowDown className="size-3" />
                      </button>
                    </div>

                    <Input
                      value={row.title}
                      autoFocus={row.key === focusKey}
                      aria-label="Check title"
                      placeholder="What is being checked on every page"
                      onChange={(event) => patch(row.key, { title: event.target.value })}
                      className="h-8 flex-1 text-sm"
                    />

                    <Input
                      value={row.group}
                      aria-label="Group"
                      list="page-check-groups"
                      placeholder="Group"
                      onChange={(event) => patch(row.key, { group: event.target.value })}
                      className="h-8 w-28 text-sm"
                    />

                    <Select
                      value={row.auto ?? NO_AUTO}
                      onValueChange={(value) =>
                        patch(row.key, { auto: value === NO_AUTO ? undefined : (value as AutoCheckId) })
                      }
                    >
                      <SelectTrigger size="sm" className="w-[9.5rem] text-xs" aria-label="Answered by a scan">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_AUTO} className="text-xs">
                          A person answers
                        </SelectItem>
                        {AUTO_CHECK_IDS.map((id) => (
                          <SelectItem key={id} value={id} className="text-xs">
                            Scan: {AUTO_CHECK_DESCRIPTIONS[id]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <button
                      type="button"
                      aria-label={`Remove ${row.title || 'check'}`}
                      onClick={() => (answered > 0 ? setConfirmRemove(row.key) : remove(row.key))}
                      className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>

                  <div className="mt-1 flex items-center gap-2 pl-7">
                    {answered > 0 && (
                      <Badge
                        variant="outline"
                        className="h-5 px-1.5 text-[10px] font-normal text-muted-foreground"
                      >
                        answered on {answered} {answered === 1 ? 'page' : 'pages'}
                      </Badge>
                    )}
                    {row.auto && (
                      <span className="text-[10px] text-muted-foreground">
                        A scan answers this; a person&rsquo;s answer still wins.
                      </span>
                    )}
                    {!row.noteOpen && (
                      <button
                        type="button"
                        onClick={() => patch(row.key, { noteOpen: true })}
                        className="ml-auto text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        Add a note
                      </button>
                    )}
                  </div>

                  {row.noteOpen && (
                    <Input
                      value={row.note ?? ''}
                      aria-label="Note"
                      placeholder="Note shown beside the check, e.g. only for pages with a form"
                      onChange={(event) => patch(row.key, { note: event.target.value })}
                      className="mt-1 h-7 w-full text-xs"
                    />
                  )}

                  {confirming && (
                    <div className="mt-1.5 rounded-md bg-background/60 px-2 py-1.5 text-xs">
                      <p>
                        <span className="font-medium">{answered}</span>{' '}
                        {answered === 1 ? 'page has' : 'pages have'} already answered this. Removing it
                        leaves those answers on the pages, but they stop being shown and stop counting
                        towards launch readiness. Adding the check back later gives it a new id, so the
                        old answers do not come back.
                      </p>
                      <div className="mt-1.5 flex gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          className="h-7 text-xs"
                          onClick={() => remove(row.key)}
                        >
                          Remove anyway
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => setConfirmRemove(null)}
                        >
                          Keep it
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {rows.length === 0 && (
              <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                No checks. Add one, or reset to the {stackName} starting set.
              </p>
            )}
          </div>

          <datalist id="page-check-groups">
            {groupNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={addRow}>
              <Plus className="size-3.5" />
              Add a check
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => setConfirmReset(true)}
              disabled={confirmReset}
            >
              <RotateCcw className="size-3.5" />
              Reset to the {stackName} default
            </Button>
          </div>

          {confirmReset && (
            <div className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-xs">
              <p>
                This replaces the {rows.length} {rows.length === 1 ? 'check' : 'checks'} in this list with
                the {defaultChecks.length} the {stackName} stack starts from. Anything you added or
                renamed goes; answers given under a check that is not in the default stop being shown.
                Nothing is written until you save.
              </p>
              <div className="mt-1.5 flex gap-1.5">
                <Button type="button" size="sm" className="h-7 text-xs" onClick={applyDefaults}>
                  Load the default
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setConfirmReset(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {removedWithAnswers.length > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Saving this list drops {removedWithAnswers.length}{' '}
              {removedWithAnswers.length === 1 ? 'check' : 'checks'} that{' '}
              {removedWithAnswers.length === 1 ? 'has' : 'have'} already been answered, across{' '}
              {removedWithAnswers.reduce((total, [, count]) => total + count, 0)} page answers. Those
              answers stay on the page documents but stop being shown and stop counting.
            </p>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            onClick={save}
            disabled={saving || !dirty}
          >
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            Save checks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
