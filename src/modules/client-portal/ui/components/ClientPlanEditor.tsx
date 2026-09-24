'use client';

import { useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/alert-dialog-confirm';
import type { ClientPlan, ClientPlanStage, Project, ProjectChecklist } from '@/types';
import { addDaysIso, isIsoDay, newPlanId, type LegacyPlan, type ResolvedPlan } from '../../domain/client-plan';
import { clientPortalRepository } from '../../infrastructure/client-portal.repository';
import { ClientPlanSetup } from './ClientPlanSetup';
import { PlanFilesEditor } from './PlanFilesEditor';
import { PlanStageRow } from './PlanStageRow';

interface ClientPlanEditorProps {
  project: Pick<Project, 'id'>;
  /** The saved plan, cleaned; null when the project has none yet. */
  plan: ClientPlan | null;
  /** What an old portal still shows when there is no saved plan. */
  legacy: LegacyPlan | null;
  /** `plan` (or `legacy`) resolved against the checklist. */
  resolved: ResolvedPlan | null;
  checklists: ProjectChecklist[];
  userEmail: string;
}

/** A new stage goes after the last one, a week long, and opens straight into editing. */
function blankStage(after: ClientPlanStage | undefined): ClientPlanStage {
  const stage: ClientPlanStage = { id: newPlanId('stg'), title: 'New stage', deliverables: [], files: [] };
  if (after?.dueDate && isIsoDay(after.dueDate)) {
    stage.startDate = addDaysIso(after.dueDate, 1);
    stage.dueDate = addDaysIso(after.dueDate, 7);
  }
  return stage;
}

/**
 * The plan the client sees, edited where the team reads it: every stage with
 * its dates, what the client gets, and its files. Every change saves on its
 * own, straight to the client's page.
 */
export function ClientPlanEditor({ project, plan, legacy, resolved, checklists, userEmail }: ClientPlanEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ClientPlanStage | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [adding, setAdding] = useState(false);
  const now = useMemo(() => new Date(), []);

  const run = async (stageId: string, work: () => Promise<void>, failure: string) => {
    setBusyId(stageId);
    try {
      await work();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : failure);
    } finally {
      setBusyId(null);
    }
  };

  if (!plan && !legacy) {
    return <ClientPlanSetup projectId={project.id} checklists={checklists} userEmail={userEmail} />;
  }

  if (!plan && legacy && resolved) {
    const keepLegacy = async () => {
      setKeeping(true);
      try {
        await clientPortalRepository.savePlan(project.id, legacy.plan, userEmail);
        await clientPortalRepository.updateClientFacing(project.id, { currentStageId: legacy.currentStageId ?? null }, userEmail);
        toast.success('Plan saved: edit it here from now on');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not save the plan');
      } finally {
        setKeeping(false);
      }
    };

    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          The client sees these stages today, carried over from the milestones and links that were switched on for them.
          Keep them to edit them here, or build a fresh plan from the checklist so the tracker follows it.
        </p>
        <ol className="divide-y">
          {resolved.stages.map((stage, index) => (
            <PlanStageRow key={stage.stage.id} index={index} count={resolved.stages.length} resolved={stage} now={now} readOnly />
          ))}
        </ol>
        {legacy.plan.files.length > 0 && (
          <p className="text-xs text-muted-foreground">Project files: {legacy.plan.files.map((f) => f.title).join(' · ')}</p>
        )}
        {rebuilding ? (
          <ClientPlanSetup projectId={project.id} checklists={checklists} userEmail={userEmail} onDone={() => setRebuilding(false)} />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" className="h-8 text-xs" onClick={() => void keepLegacy()} disabled={keeping}>
              {keeping && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Keep these stages
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setRebuilding(true)} disabled={keeping}>
              Build from the checklist instead
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (!plan || !resolved) return null;

  const addStage = async () => {
    const stage = blankStage(plan.stages[plan.stages.length - 1]);
    setAdding(true);
    try {
      await clientPortalRepository.addStage(project.id, stage, userEmail);
      setEditingId(stage.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add a stage');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4">
      {rebuilding && (
        <ClientPlanSetup
          projectId={project.id}
          checklists={checklists}
          userEmail={userEmail}
          existing={plan}
          onDone={() => setRebuilding(false)}
        />
      )}

      {resolved.stages.length === 0 ? (
        <p className="text-sm text-muted-foreground">No stages. Add one, or rebuild the plan from the checklist.</p>
      ) : (
        <ol className="divide-y">
          {resolved.stages.map((stage, index) => {
            const id = stage.stage.id;
            return (
              <PlanStageRow
                key={id}
                index={index}
                count={resolved.stages.length}
                resolved={stage}
                now={now}
                editing={editingId === id}
                busy={busyId === id}
                onEdit={() => setEditingId(id)}
                onCancel={() => setEditingId(null)}
                onSave={async (patch) => {
                  await clientPortalRepository.updateStage(project.id, id, patch, userEmail);
                  setEditingId(null);
                }}
                onFilesChange={(files) => clientPortalRepository.updateStage(project.id, id, { files }, userEmail)}
                onMove={(delta) =>
                  void run(id, () => clientPortalRepository.moveStage(project.id, id, delta, userEmail), 'Could not move the stage')
                }
                onRemove={() => setRemoving(stage.stage)}
              />
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => void addStage()} disabled={adding}>
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add a stage
        </Button>
        {!rebuilding && (
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => setRebuilding(true)}>
            <RefreshCw className="h-3.5 w-3.5" />
            Rebuild from the checklist
          </Button>
        )}
      </div>

      <div className="space-y-2 border-t pt-4">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Files for the whole project</h3>
          <p className="text-xs text-muted-foreground">
            Shown under “Files &amp; links”. Anything that belongs to one stage goes on that stage instead.
          </p>
        </div>
        <PlanFilesEditor
          files={plan.files}
          onChange={(files) => clientPortalRepository.setPlanFiles(project.id, files, userEmail)}
          addLabel="Add a project file"
        />
      </div>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove “${removing?.title ?? ''}”?`}
        description="The client stops seeing this stage, its dates, what it delivers and its files."
        confirmText="Remove stage"
        variant="destructive"
        onConfirm={() => {
          const stage = removing;
          setRemoving(null);
          if (stage) {
            void run(stage.id, () => clientPortalRepository.removeStage(project.id, stage.id, userEmail), 'Could not remove the stage');
          }
        }}
      />
    </div>
  );
}
