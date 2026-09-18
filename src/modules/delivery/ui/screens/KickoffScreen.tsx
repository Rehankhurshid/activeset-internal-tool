'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Mail } from 'lucide-react';
import type { Project, ProjectChecklist } from '@/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { stageProgress } from '../../domain/delivery.checklist';
import type { StackDefinition } from '../../domain/delivery.types';
import { deliveryRepository } from '../../infrastructure/delivery.repository';
import { CallCadenceCard } from '../components/CallCadenceCard';
import { KickoffEmailDialog, type KickoffEmailDialogHandle } from '../components/KickoffEmailDialog';
import { StageChecklist } from '../components/StageChecklist';

/**
 * Kickoff, read from the project's own checklist.
 *
 * What kickoff means is not the same for every client — one needs brand assets
 * and a content audit, another needs a Webflow seat and nothing else — so the
 * steps are checklist sections tagged `kickoff`, edited on the project or in the
 * SOP template it came from. This screen is the place to work through them,
 * alongside the two things that are not checklist items: the call cadence, and
 * the welcome email draft.
 */

export interface KickoffScreenProps {
  project: Project;
  stack: StackDefinition;
  userEmail: string;
}

export function KickoffScreen({ project, stack, userEmail }: KickoffScreenProps) {
  const emailRef = useRef<KickoffEmailDialogHandle>(null);
  const [checklists, setChecklists] = useState<ProjectChecklist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    return deliveryRepository.subscribeToChecklists(project.id, (next) => {
      setChecklists(next);
      setLoading(false);
    });
  }, [project.id]);

  const progress = useMemo(() => stageProgress(checklists, 'kickoff'), [checklists]);
  const next = progress.outstanding[0];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Kickoff</h2>
          <p className="text-xs text-muted-foreground">
            {loading
              ? `${stack.name} build — reading this project's checklist…`
              : progress.untagged
                ? `From this project's own checklist — ${stack.name} build.`
                : next
                  ? `Next: ${next}`
                  : 'Everything tagged for kickoff is done.'}
          </p>
        </div>
        {!loading && !progress.untagged && (
          <div className="flex shrink-0 items-center gap-2">
            <p className="text-xs tabular-nums text-muted-foreground">
              {progress.done} of {progress.total} done
              {progress.skipped > 0 && <span className="ml-1.5">· {progress.skipped} skipped</span>}
            </p>
            {progress.outstanding.length > 0 && (
              // The draft's job is chasing exactly these items, so it is offered
              // where the count of them is.
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => emailRef.current?.open()}
              >
                <Mail className="h-3.5 w-3.5" />
                Draft the email
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <StageChecklist
            projectId={project.id}
            checklists={checklists}
            stage="kickoff"
            userEmail={userEmail}
            emptyHint="Kickoff is whatever has to happen before the build can start — the call, the assets, the access."
          />
        )}

        <div className="space-y-3">
          <CallCadenceCard projectId={project.id} delivery={project.delivery} />

          <section className="space-y-2 rounded-lg border bg-card p-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold">Welcome email</h3>
              <p className="text-xs text-muted-foreground">
                Drafted from the project, including whatever kickoff is still waiting on. You send
                it yourself.
              </p>
            </div>
            <KickoffEmailDialog
              ref={emailRef}
              project={project}
              userEmail={userEmail}
              outstanding={progress.outstanding}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
