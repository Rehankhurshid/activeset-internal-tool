'use client';

import { useMemo } from 'react';
import { Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Project, ProjectChecklist } from '@/types';
import type { ArcEntry } from '../../domain/delivery.arc';
import { roleProgress } from '../../domain/delivery.arc';
import type { ProjectPage, StackDefinition } from '../../domain/delivery.types';
import { KickoffExtras } from '../components/KickoffExtras';
import { LaunchExtras } from '../components/LaunchExtras';
import { buildAuditsByPageId, buildAutoVerdicts } from '../components/launch-scan';
import { StageChecklist } from '../components/StageChecklist';
import { TrackerSheetCard } from '../components/TrackerSheetCard';
import { DeliveryScreen } from './DeliveryScreen';

/**
 * One stage of the arc.
 *
 * Every stage is rendered here, whatever the SOP calls it: a title, its items,
 * how far it has got. A role adds to that — the cadence and the welcome draft at
 * kickoff, the page grid where the build happens, the readiness verdict at
 * launch — it never replaces it, because a stage the app happens to know
 * something about is still a list of work someone has to do.
 */

export interface StageScreenProps {
  project: Project;
  stack: StackDefinition;
  /** The stage to render: a section of the SOP, or the page grid. */
  stage: ArcEntry;
  /** How many stages the arc has, for "step 3 of 11". */
  stageCount: number;
  /** Every checklist on the project; role extras read across stages, not just this one. */
  checklists: ProjectChecklist[];
  pages: ProjectPage[];
  /** From `gateFor`. A closed stage still renders — it just says what it waits on. */
  gate: { open: boolean; waitingOn: string[] };
  userEmail: string;
}

export function StageScreen({
  project,
  stack,
  stage,
  stageCount,
  checklists,
  pages,
  gate,
  userEmail,
}: StageScreenProps) {
  const auditsByPageId = useMemo(() => buildAuditsByPageId(project, pages), [project, pages]);

  // Any item that names a scan check gets the hint, not only launch ones: the
  // derivation never depended on which stage the item sits in.
  const autoVerdicts = useMemo(
    () => buildAutoVerdicts(stage.kind === 'section' ? stage.items : [], pages, auditsByPageId),
    [stage, pages, auditsByPageId],
  );

  const kickoffOutstanding = useMemo(
    () => (stage.role === 'kickoff' ? roleProgress(checklists, 'kickoff').outstanding : []),
    [stage.role, checklists],
  );

  const progress = stage.kind === 'section' ? stage.progress : null;
  const next = progress?.outstanding[0];
  // Which SOP a stage came from only matters when there is more than one.
  const source = stage.kind === 'section' && checklists.length > 1 ? stage.checklistName : null;

  const list =
    stage.kind === 'section' ? (
      <StageChecklist
        projectId={project.id}
        stage={stage}
        userEmail={userEmail}
        autoVerdicts={autoVerdicts}
      />
    ) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <span aria-hidden>{stage.emoji || (stage.kind === 'pages' ? '🧱' : '📋')}</span>
            <span className="truncate">{stage.title}</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Step {stage.position} of {stageCount}
            {source && ` · ${source}`}
            {next && ` · Next: ${next}`}
            {stage.kind === 'pages' && ' · The build itself, a row per page'}
          </p>
        </div>

        {progress && progress.total > 0 && (
          <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {progress.done} of {progress.total} done
            {progress.skipped > 0 && <span className="ml-1.5">· {progress.skipped} skipped</span>}
          </p>
        )}
      </div>

      {/* Closed means "something earlier is holding this up", not "you may not
          work here". Nothing below is disabled — being told is enough. */}
      {!gate.open && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
          <Lock className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              Waiting on {gate.waitingOn.length === 1 ? 'an earlier item' : `${gate.waitingOn.length} earlier items`}:
            </span>{' '}
            {gate.waitingOn.slice(0, 3).join(', ')}
            {gate.waitingOn.length > 3 && `, and ${gate.waitingOn.length - 3} more`}. You can still
            work here — nothing is locked.
          </p>
        </div>
      )}

      {stage.role === 'launch' ? (
        <LaunchExtras
          project={project}
          stack={stack}
          checklists={checklists}
          pages={pages}
          auditsByPageId={auditsByPageId}
          userEmail={userEmail}
        >
          {list}
        </LaunchExtras>
      ) : stage.role === 'kickoff' ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          {list}
          <KickoffExtras
            project={project}
            userEmail={userEmail}
            outstanding={kickoffOutstanding}
          />
        </div>
      ) : stage.role === 'pages' ? (
        <div className="space-y-4">
          {list}
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Client tracker sheet
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TrackerSheetCard project={project} pageCount={pages.length} />
            </CardContent>
          </Card>
          <DeliveryScreen project={project} stack={stack} userEmail={userEmail} />
        </div>
      ) : (
        list
      )}
    </div>
  );
}
