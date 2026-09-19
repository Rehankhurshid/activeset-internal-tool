'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Project, ProjectChecklist } from '@/types';
import {
  arcProgress,
  currentStageKey,
  deliveryArc,
  gateFor,
  sectionStagesOf,
} from '../../domain/delivery.arc';
import { buildPageProgress } from '../../domain/delivery.progress';
import { getStack } from '../../domain/stacks';
import type { ProjectPage } from '../../domain/delivery.types';
import { deliveryRepository } from '../../infrastructure/delivery.repository';
import { AddAgencyBasics } from '../components/AddAgencyBasics';
import { StageRail } from '../components/StageRail';
import { TemplateImprovements } from '../components/TemplateImprovements';
import { StageScreen } from './StageScreen';

interface DeliveryTabProps {
  project: Project;
  userEmail: string;
}

/**
 * The project's whole delivery arc, as one tab.
 *
 * The stages are the sections of the project's own SOP checklist, in their own
 * order, plus the page grid. Nothing about the arc is written here — this picks
 * one stage off the rail and hands it to {@link StageScreen}. That is what makes
 * a Webflow build's eleven steps and a brand project's nine work the same way,
 * and it is why steps 2 through 6 of the SOP, which used to appear nowhere in
 * Delivery, now do.
 *
 * The stage is chosen for you the first time, from where the work actually is.
 * After that it stays where you put it.
 */
export function DeliveryTab({ project, userEmail }: DeliveryTabProps) {
  const stack = useMemo(() => getStack(project.delivery?.stackId), [project.delivery?.stackId]);
  const [pages, setPages] = useState<ProjectPage[]>([]);
  const [checklists, setChecklists] = useState<ProjectChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!project.id) return;
    return deliveryRepository.subscribeToPages(project.id, setPages);
  }, [project.id]);

  useEffect(() => {
    if (!project.id) return;
    setLoading(true);
    return deliveryRepository.subscribeToChecklists(project.id, (next) => {
      setChecklists(next);
      setLoading(false);
    });
  }, [project.id]);

  const arc = useMemo(() => deliveryArc(checklists), [checklists]);
  const progress = useMemo(() => arcProgress(checklists), [checklists]);
  const pageProgress = useMemo(() => buildPageProgress(stack, pages), [stack, pages]);

  const gates = useMemo(() => {
    const open: Record<string, boolean> = {};
    for (const entry of arc) open[entry.key] = gateFor(arc, entry.key).open;
    return open;
  }, [arc]);

  // Pick the stage once the arc is real. Re-deciding on every render would drag
  // someone back out of the stage they just opened.
  useEffect(() => {
    if (selected !== null || loading) return;
    setSelected(currentStageKey(arc) ?? null);
  }, [selected, loading, arc]);

  // A stage can disappear under you — someone renames or deletes the section on
  // the Checklist tab — so the arc, not the selection, decides what is shown.
  // The arc can also be empty: today only for a project with no checklist whose
  // stack has no page axis, but that is a fact about `deliveryArc`'s default
  // rather than a guarantee, and guessing wrong here is a blank crash.
  const active = arc.find((entry) => entry.key === selected) ?? arc[0] ?? null;
  const gate = useMemo(
    () => (active ? gateFor(arc, active.key) : { open: true, waitingOn: [] }),
    [arc, active],
  );

  const sectionCount = useMemo(() => sectionStagesOf(arc).length, [arc]);
  const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {progress.total > 0 ? (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-sm font-semibold tabular-nums">
                {progress.done} of {progress.total}
              </span>
              <span className="text-xs text-muted-foreground">
                tasks done across {sectionCount} {sectionCount === 1 ? 'stage' : 'stages'}
                {progress.skipped > 0 && ` · ${progress.skipped} skipped`}
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              No tasks yet — the arc comes from this project&apos;s checklist.
            </span>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Two offers that both cross the project/SOP line, and both render
                nothing most of the time. This one comes down: the agency's own
                routine, onto a checklist that was deep-copied before those steps
                existed and so will never see them otherwise. */}
            <AddAgencyBasics checklists={checklists} />
            {/* And this one goes up, unless this project's checklists have
                drifted from the SOPs they were copied from. The way back to the
                template belongs here rather than on a stage: what a project
                learned is rarely confined to the stage you happen to be in. */}
            <TemplateImprovements checklists={checklists} />
            <p className="text-xs text-muted-foreground">{stack.name} build</p>
          </div>
        </div>

        {progress.total > 0 && (
          <div
            className="h-1 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Delivery progress"
          >
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>

      {active && (
        <StageRail
          arc={arc}
          activeKey={active.key}
          onSelect={setSelected}
          openByKey={gates}
          pagesProgress={pages.length > 0 ? pageProgress : null}
        />
      )}

      {/* Without a checklist there is no arc, only the page grid. Say so once,
          here, rather than letting every stage explain its own absence. */}
      {sectionCount === 0 && (
        <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center">
          <ListChecks className="mx-auto h-6 w-6 text-muted-foreground" />
          <h3 className="mt-2 text-sm font-semibold">This project has no checklist yet</h3>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Delivery reads its stages from the project&apos;s SOP checklist, so until there is one
            the only stage here is the page grid. Add a checklist — or pick the SOP template this
            project follows — and every step of it shows up on the rail above.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-3 h-8 px-2.5 text-xs">
            {/* A plain link: the Checklist tab is chosen from the URL on load. */}
            <a href={`/modules/project-links/${project.id}?tab=checklist`}>
              <ListChecks className="h-3.5 w-3.5" />
              Add a checklist
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </a>
          </Button>
        </div>
      )}

      {active && (
        <StageScreen
          project={project}
          stack={stack}
          stage={active}
          stageCount={arc.length}
          checklists={checklists}
          pages={pages}
          gate={gate}
          userEmail={userEmail}
        />
      )}
    </div>
  );
}
