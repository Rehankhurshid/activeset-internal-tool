'use client';

import { useEffect, useMemo, useState } from 'react';
import { Handshake, LayoutList, Rocket } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Project, ProjectChecklist } from '@/types';
import { stageProgress } from '../../domain/delivery.checklist';
import { buildPageProgress } from '../../domain/delivery.progress';
import { getStack } from '../../domain/stacks';
import type { ProjectPage } from '../../domain/delivery.types';
import { deliveryRepository } from '../../infrastructure/delivery.repository';
import { TrackerSheetCard } from '../components/TrackerSheetCard';
import { DeliveryScreen } from './DeliveryScreen';
import { KickoffScreen } from './KickoffScreen';
import { LaunchScreen } from './LaunchScreen';

type Stage = 'kickoff' | 'pages' | 'launch';

interface DeliveryTabProps {
  project: Project;
  userEmail: string;
}

const STAGES: { id: Stage; label: string; icon: typeof Handshake }[] = [
  { id: 'kickoff', label: 'Kickoff', icon: Handshake },
  { id: 'pages', label: 'Pages', icon: LayoutList },
  { id: 'launch', label: 'Launch', icon: Rocket },
];

/**
 * The website build, as one tab with three stages.
 *
 * Kickoff and Launch are views onto the project's own checklist — the sections
 * tagged for that stage — so what a project does can differ from the next one
 * without touching this code. Pages is the grid.
 *
 * The stage is chosen for you the first time, from where the work actually is.
 * After that it stays where you put it.
 */
export function DeliveryTab({ project, userEmail }: DeliveryTabProps) {
  const stack = useMemo(() => getStack(project.delivery?.stackId), [project.delivery?.stackId]);
  const [pages, setPages] = useState<ProjectPage[]>([]);
  const [checklists, setChecklists] = useState<ProjectChecklist[]>([]);
  const [stage, setStage] = useState<Stage | null>(null);

  useEffect(() => {
    if (!project.id) return;
    return deliveryRepository.subscribeToPages(project.id, setPages);
  }, [project.id]);

  useEffect(() => {
    if (!project.id) return;
    return deliveryRepository.subscribeToChecklists(project.id, setChecklists);
  }, [project.id]);

  const kickoff = useMemo(() => stageProgress(checklists, 'kickoff'), [checklists]);
  const launch = useMemo(() => stageProgress(checklists, 'launch'), [checklists]);
  const pageProgress = useMemo(() => buildPageProgress(stack, pages), [stack, pages]);

  // Pick the stage once. Re-deciding on every render would drag someone back
  // out of the stage they just opened.
  useEffect(() => {
    if (stage !== null) return;
    if (pages.length === 0 && !kickoff.untagged && !kickoff.complete) setStage('kickoff');
    else if (pageProgress.total > 0 && pageProgress.done === pageProgress.total) setStage('launch');
    else setStage('pages');
  }, [stage, pages.length, kickoff.untagged, kickoff.complete, pageProgress.total, pageProgress.done]);

  const current = stage ?? 'pages';

  // A stage with no checklist section tagged for it shows nothing rather than
  // "0/0", which would read as finished.
  const counts: Record<Stage, string | null> = {
    kickoff: kickoff.untagged || kickoff.complete ? null : `${kickoff.done}/${kickoff.total}`,
    pages: pages.length > 0 ? `${pageProgress.done}/${pageProgress.total}` : null,
    launch: launch.untagged ? null : launch.complete ? 'Ready' : `${launch.done}/${launch.total}`,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5" role="tablist">
          {STAGES.map(({ id, label, icon: Icon }) => {
            const active = current === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStage(id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {counts[id] && (
                  <Badge variant="secondary" className="h-4 px-1 font-mono text-[10px] tabular-nums">
                    {counts[id]}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">{stack.name} build</p>
      </div>

      {current === 'kickoff' && <KickoffScreen project={project} stack={stack} userEmail={userEmail} />}

      {current === 'pages' && (
        <div className="space-y-4">
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
      )}

      {current === 'launch' && <LaunchScreen project={project} stack={stack} userEmail={userEmail} />}
    </div>
  );
}
