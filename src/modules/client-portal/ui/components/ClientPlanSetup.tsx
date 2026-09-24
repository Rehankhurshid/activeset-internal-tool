'use client';

import { useMemo, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { todayIso } from '@/lib/review-status';
import type { ClientPlan, ProjectChecklist } from '@/types';
import { CLIENT_STAGE_DEFAULTS, checklistSections, draftClientPlan, planStageKinds } from '../../domain/client-plan';
import { clientPortalRepository } from '../../infrastructure/client-portal.repository';

interface ClientPlanSetupProps {
  projectId: string;
  checklists: ProjectChecklist[];
  userEmail: string;
  /** The plan being rebuilt, if there is one. */
  existing?: ClientPlan | null;
  onDone?: () => void;
}

/**
 * A rebuild re-dates every stage and follows the checklist again, but keeps
 * what the team wrote: the name, "what you get" and files of every stage that
 * is still there, and the project's own files. Stages added by hand go, because
 * nothing says where they would now belong.
 */
function keepWhatTheTeamWrote(draft: ClientPlan, existing: ClientPlan): ClientPlan {
  return {
    ...draft,
    files: existing.files,
    stages: draft.stages.map((stage) => {
      const before = existing.stages.find((old) => old.kind && old.kind === stage.kind);
      return before ? { ...stage, title: before.title, deliverables: before.deliverables, files: before.files } : stage;
    }),
  };
}

/**
 * Makes the plan from the project's own checklist: one stage per part of the
 * SOP a client would recognise, dated back to back from the start date. With
 * no checklist it uses the standard stages, and the tracker can only move when
 * the team moves it.
 */
export function ClientPlanSetup({ projectId, checklists, userEmail, existing, onDone }: ClientPlanSetupProps) {
  const rebuild = Boolean(existing);
  const [startDate, setStartDate] = useState(() => todayIso());
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);

  const sections = useMemo(() => checklistSections(checklists), [checklists]);
  const kinds = useMemo(() => planStageKinds(sections), [sections]);
  const fromChecklist = sections.length > 0;
  const backwards = Boolean(endDate && startDate && endDate < startDate);

  const create = async () => {
    if (saving || backwards) return;
    setSaving(true);
    try {
      const draft = draftClientPlan(sections, {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        templateId: checklists[0]?.templateId,
      });
      const plan = existing ? keepWhatTheTeamWrote(draft, existing) : draft;
      await clientPortalRepository.savePlan(projectId, plan, userEmail);
      // Back to following the checklist: a stage pinned on the old plan means nothing now.
      await clientPortalRepository.updateClientFacing(projectId, { currentStageId: null }, userEmail);
      toast.success(rebuild ? 'Plan rebuilt from the checklist' : 'Client plan created');
      onDone?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the plan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-3">
      <div className="space-y-1">
        <p className="text-sm">
          {fromChecklist
            ? 'Built from this project’s checklist, so ticking it moves the client’s tracker:'
            : 'No checklist yet, so this starts with the standard stages. Add a checklist and rebuild to make the tracker follow it:'}
        </p>
        <p className="text-sm font-medium">{kinds.map((kind) => CLIENT_STAGE_DEFAULTS[kind].title).join(' → ')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`plan-start-${projectId}`} className="text-xs text-muted-foreground">Start date</Label>
          <Input id={`plan-start-${projectId}`} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`plan-end-${projectId}`} className="text-xs text-muted-foreground">Target end date (optional)</Label>
          <Input id={`plan-end-${projectId}`} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 text-sm" />
        </div>
      </div>
      {backwards && <p className="text-xs text-destructive">The end date is before the start.</p>}
      <p className="text-[11px] text-muted-foreground">
        Each stage gets a default length; a target end date stretches or squeezes them to fit. Every date is editable afterwards.
        {rebuild && ' Rebuilding keeps the names, what-you-get lines and files of stages that are still there; stages you added by hand are dropped.'}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" className="h-8 text-xs" onClick={() => void create()} disabled={saving || backwards}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {rebuild ? 'Rebuild the plan' : 'Create the plan'}
        </Button>
        {onDone && rebuild && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onDone} disabled={saving}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
