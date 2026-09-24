'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, Loader2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ClientPlanFile, ClientPlanStage } from '@/types';
import { cn } from '@/lib/utils';
import type { ResolvedStage } from '../../domain/client-plan';
import { PORTAL_STAGE_LABELS } from '../../domain/client-portal.types';
import { PlanFilesEditor } from './PlanFilesEditor';
import { formatStageDates } from './portal-format';

interface StageFormProps {
  stage: ClientPlanStage;
  onCancel: () => void;
  onSave: (patch: Partial<ClientPlanStage>) => Promise<void>;
}

function StageForm({ stage, onCancel, onSave }: StageFormProps) {
  const [title, setTitle] = useState(stage.title);
  const [startDate, setStartDate] = useState(stage.startDate ?? '');
  const [dueDate, setDueDate] = useState(stage.dueDate ?? '');
  const [deliverables, setDeliverables] = useState(stage.deliverables.join('\n'));
  const [saving, setSaving] = useState(false);

  const backwards = Boolean(startDate && dueDate && dueDate < startDate);
  const idPrefix = `stage-${stage.id}`;

  const submit = async () => {
    if (!title.trim() || backwards || saving) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        // Empty clears the date: the plan cleaner drops anything that is not a real day.
        startDate: startDate || undefined,
        dueDate: dueDate || undefined,
        deliverables: deliverables.split('\n').map((line) => line.trim()).filter(Boolean),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the stage');
      setSaving(false);
    }
  };

  return (
    <form
      className="space-y-3 rounded-lg border bg-muted/30 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-title`} className="text-xs text-muted-foreground">Stage name</Label>
        <Input id={`${idPrefix}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className="h-8 text-sm" autoFocus />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-start`} className="text-xs text-muted-foreground">Starts</Label>
          <Input id={`${idPrefix}-start`} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-due`} className="text-xs text-muted-foreground">Due</Label>
          <Input id={`${idPrefix}-due`} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-8 text-sm" />
        </div>
      </div>
      {backwards && <p className="text-xs text-destructive">The due date is before the start.</p>}
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-deliverables`} className="text-xs text-muted-foreground">
          What the client gets (one per line)
        </Label>
        <Textarea
          id={`${idPrefix}-deliverables`}
          value={deliverables}
          onChange={(e) => setDeliverables(e.target.value)}
          placeholder={'Homepage design\nInner page designs'}
          className="min-h-20 text-sm"
        />
      </div>
      <div className="flex justify-end gap-1.5">
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" size="sm" className="h-8 text-xs" disabled={!title.trim() || backwards || saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save stage
        </Button>
      </div>
    </form>
  );
}

interface PlanStageRowProps {
  index: number;
  count: number;
  resolved: ResolvedStage;
  now: Date;
  /** A plan still coming from the old timeline switches: shown, not edited. */
  readOnly?: boolean;
  editing?: boolean;
  onEdit?: () => void;
  onCancel?: () => void;
  onSave?: (patch: Partial<ClientPlanStage>) => Promise<void>;
  onFilesChange?: (files: ClientPlanFile[]) => Promise<void>;
  onMove?: (delta: -1 | 1) => void;
  onRemove?: () => void;
  busy?: boolean;
}

/** One stage of the plan in the Client tab: what the client sees, and the controls to change it. */
export function PlanStageRow({
  index,
  count,
  resolved,
  now,
  readOnly = false,
  editing = false,
  onEdit,
  onCancel,
  onSave,
  onFilesChange,
  onMove,
  onRemove,
  busy = false,
}: PlanStageRowProps) {
  const { stage, state, tracking, percent } = resolved;
  const dates = formatStageDates(stage.startDate, stage.dueDate, now);
  const stateLabel = state === 'current' && percent !== undefined ? `Now · ${percent}%` : PORTAL_STAGE_LABELS[state];

  return (
    <li className={cn('flex gap-3 py-3', state === 'current' && 'rounded-lg bg-primary/5 px-2 -mx-2')}>
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
          state === 'done' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
          state === 'current' && 'bg-primary text-primary-foreground',
          state === 'upcoming' && 'border text-muted-foreground',
        )}
      >
        {state === 'done' ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}
      </span>

      <div className="min-w-0 flex-1 space-y-2">
        {editing && onSave && onCancel ? (
          <StageForm stage={stage} onCancel={onCancel} onSave={onSave} />
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{stage.title}</p>
                <p className="text-xs text-muted-foreground">
                  {[
                    dates || 'No dates yet',
                    stateLabel,
                    tracking ? `${tracking.done} of ${tracking.total} checklist steps` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {!readOnly && (
                <div className="flex shrink-0 items-center">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} disabled={busy} aria-label={`Edit ${stage.title}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMove?.(-1)} disabled={busy || index === 0} aria-label={`Move ${stage.title} earlier`}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMove?.(1)} disabled={busy || index === count - 1} aria-label={`Move ${stage.title} later`}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={onRemove}
                    disabled={busy}
                    aria-label={`Remove ${stage.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {stage.deliverables.length > 0 ? (
              <ul className="space-y-0.5 text-sm">
                {stage.deliverables.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                    <span className="min-w-0">{line}</span>
                  </li>
                ))}
              </ul>
            ) : (
              !readOnly && <p className="text-xs text-muted-foreground">Nothing listed yet: what does the client get in this stage?</p>
            )}

            {readOnly ? (
              stage.files.length > 0 && <p className="text-xs text-muted-foreground">{stage.files.map((f) => f.title).join(' · ')}</p>
            ) : (
              onFilesChange && (
                <PlanFilesEditor files={stage.files} onChange={onFilesChange} addLabel="Add a file" disabled={busy} />
              )
            )}
          </>
        )}
      </div>
    </li>
  );
}
