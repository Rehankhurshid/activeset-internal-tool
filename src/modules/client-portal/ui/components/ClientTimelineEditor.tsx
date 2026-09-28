'use client';

import { useMemo, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Project, ProjectTimeline } from '@/types';
import { cn } from '@/lib/utils';
import { normalizePlanFiles, type ResolvedPlan } from '../../domain/client-plan';
import { stepState, timelineStages } from '../../domain/client-timeline';
import { clientPortalRepository } from '../../infrastructure/client-portal.repository';
import { PlanFilesEditor } from './PlanFilesEditor';
import { formatDateRange, formatStageDates } from './portal-format';

interface ClientTimelineEditorProps {
  project: Pick<Project, 'id' | 'clientTimeline'>;
  timeline: ProjectTimeline;
  /** The stages as the client sees them now, for each one's state. */
  resolved: ResolvedPlan | null;
  userEmail: string;
}

const STATE_LABEL = { done: 'Done', current: 'Now', upcoming: 'Coming up' } as const;

/**
 * The Timeline, as the client will read it. Phases and milestones are edited
 * on the Timeline tab; here the team decides which milestones the client sees
 * and which files go with each phase.
 */
export function ClientTimelineEditor({ project, timeline, resolved, userEmail }: ClientTimelineEditorProps) {
  const settings = project.clientTimeline;
  const hidden = useMemo(() => new Set(settings?.hiddenMilestoneIds ?? []), [settings?.hiddenMilestoneIds]);
  // Every milestone, hidden ones included, grouped the way the client's page groups them.
  const everything = useMemo(
    () => timelineStages(timeline, { ...settings, hiddenMilestoneIds: [] }),
    [timeline, settings],
  );
  const milestones = useMemo(() => new Map(timeline.milestones.map((m) => [m.id, m])), [timeline.milestones]);
  const [toggling, setToggling] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);

  const toggle = async (milestoneId: string, hide: boolean) => {
    setToggling(milestoneId);
    try {
      await clientPortalRepository.setMilestoneHidden(project.id, milestoneId, hide, userEmail);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change that');
    } finally {
      setToggling(null);
    }
  };

  const stateOf = (phaseId: string) => resolved?.stages.find((s) => s.stage.id === phaseId)?.state;

  return (
    <div className="space-y-4">
      <ol className="divide-y divide-border rounded-lg border">
        {everything.map(({ stage, steps }) => {
          const state = stateOf(stage.id);
          const shown = steps.filter((step) => !hidden.has(step.id)).length;
          return (
            <li key={stage.id} className="space-y-3 p-3 sm:p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="text-sm font-semibold">{stage.title}</h3>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {formatStageDates(stage.startDate, stage.dueDate, now)}
                  {state && ` · ${STATE_LABEL[state]}`}
                  {shown === 0 && ' · hidden from the client'}
                </p>
              </div>

              <ul className="space-y-0.5">
                {steps.map((step) => {
                  const isHidden = hidden.has(step.id);
                  const status = stepState(milestones.get(step.id)?.status);
                  return (
                    <li key={step.id} className="flex items-start gap-2 text-sm sm:items-center">
                      <button
                        type="button"
                        onClick={() => void toggle(step.id, !isHidden)}
                        disabled={toggling === step.id}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                        aria-label={isHidden ? `Show “${step.title}” to the client` : `Hide “${step.title}” from the client`}
                        title={isHidden ? 'Hidden from the client: click to show' : 'The client sees this: click to hide'}
                      >
                        {toggling === step.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : isHidden ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <span className={cn('min-w-0 flex-1 pt-0.5 sm:truncate sm:pt-0', isHidden && 'text-muted-foreground line-through')}>
                        {step.title}
                      </span>
                      <span className="shrink-0 pt-1 text-[11px] tabular-nums text-muted-foreground sm:pt-0">
                        {status === 'done' ? 'Done · ' : status === 'current' ? 'In progress · ' : ''}
                        {formatDateRange(step.startDate ?? '', step.endDate ?? step.startDate ?? '', now)}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <PlanFilesEditor
                files={normalizePlanFiles(settings?.phaseFiles?.[stage.id])}
                onChange={(files) => clientPortalRepository.setPhaseFiles(project.id, stage.id, files, userEmail)}
                addLabel={`Add a file to ${stage.title}`}
              />
            </li>
          );
        })}
      </ol>

      <div className="space-y-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Files for the whole project</h3>
        <PlanFilesEditor
          files={normalizePlanFiles(settings?.files)}
          onChange={(files) => clientPortalRepository.setTimelineFiles(project.id, files, userEmail)}
          addLabel="Add a project file"
        />
      </div>
    </div>
  );
}
