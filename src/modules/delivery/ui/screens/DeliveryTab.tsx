'use client';

import { useEffect, useMemo, useState } from 'react';
import { Handshake, LayoutList, Rocket } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Project } from '@/types';
import { buildKickoffState, buildLaunchReadiness, type KickoffContext } from '../../domain/delivery.progress';
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
 * Kickoff, pages and launch are sequential and each is the whole screen while
 * it is the live one, so they share a tab rather than taking three. Three more
 * top-level tabs would also crowd the project bar past the nine that the number
 * keys reach.
 *
 * The stage is chosen for you the first time: whatever the project is actually
 * at. After that it stays where you put it.
 */
export function DeliveryTab({ project, userEmail }: DeliveryTabProps) {
  const stack = useMemo(() => getStack(project.delivery?.stackId), [project.delivery?.stackId]);
  const [pages, setPages] = useState<ProjectPage[]>([]);
  const [stage, setStage] = useState<Stage | null>(null);

  useEffect(() => {
    if (!project.id) return;
    return deliveryRepository.subscribeToPages(project.id, setPages);
  }, [project.id]);

  // What the app already knows about kickoff, so steps it can answer are not
  // also asked of a person.
  const kickoffContext: KickoffContext = useMemo(
    () => ({ hasTrackerSheet: Boolean(project.delivery?.trackerSheetId), pageCount: pages.length }),
    [project.delivery?.trackerSheetId, pages.length],
  );
  const kickoff = useMemo(
    () => buildKickoffState(stack, project.delivery, kickoffContext),
    [stack, project.delivery, kickoffContext],
  );
  const readiness = useMemo(
    () => buildLaunchReadiness({ stack, pages, delivery: project.delivery }),
    [stack, pages, project.delivery],
  );

  // Pick the stage once, from where the work actually is. Re-deciding on every
  // render would drag someone back out of the stage they just opened.
  useEffect(() => {
    if (stage !== null) return;
    if (!kickoff.readyToBuild && pages.length === 0) setStage('kickoff');
    else if (readiness.pages.total > 0 && readiness.pages.done === readiness.pages.total) setStage('launch');
    else setStage('pages');
  }, [stage, kickoff.readyToBuild, pages.length, readiness.pages.total, readiness.pages.done]);

  const current = stage ?? 'pages';

  const counts: Record<Stage, string | null> = {
    kickoff: kickoff.complete ? null : `${kickoff.done}/${kickoff.total}`,
    pages: pages.length > 0 ? `${readiness.pages.done}/${readiness.pages.total}` : null,
    launch: readiness.ready ? 'Ready' : null,
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
                  active
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {counts[id] && (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px] font-mono tabular-nums">
                    {counts[id]}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          {stack.name} build
          {!stack.checks.length && ' · no checklist defined for this stack yet'}
        </p>
      </div>

      {current === 'kickoff' && (
        <KickoffScreen
          project={project}
          stack={stack}
          userEmail={userEmail}
          context={kickoffContext}
          onGoToPages={() => setStage('pages')}
        />
      )}

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
