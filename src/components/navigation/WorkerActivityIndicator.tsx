'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Clock, Cpu, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { WorkingThumb, type Phase } from '@/components/webflow/WorkingThumb';
import { useAuth } from '@/modules/auth-access';
import {
  isWorkerOnline,
  workerRepository,
  type WorkerDoc,
  type WorkerJobDoc,
} from '@/modules/site-monitoring/infrastructure/worker.repository';

/**
 * What the worker machine is doing, in the navigation bar on every page.
 *
 * Progress used to live only inside the Webflow tab's Images section, so a
 * refresh or a click to another page lost sight of a run that takes hours.
 * This reads the job queue live from Firestore — nothing is held in the page,
 * so a refresh shows exactly the same thing — and names the project, the CMS
 * collection and the item being worked on, not just a percentage.
 *
 * Queued jobs can be cancelled from here, one at a time or all at once. A
 * running job is left to finish: stopping one half-way through a CMS write is
 * worse than letting it complete.
 */

const KIND_LABEL: Record<string, string> = {
  alt_apply: 'Save ALT',
  image_apply: 'Resize images',
  image_budget: 'Measure image sizes',
  alt_text: 'Draft ALT for pages',
  webflow_alt: 'Draft ALT for the library',
};

const PHASE_WORD: Record<Phase, string> = { describing: 'Reading', optimising: 'Shrinking' };

/** What a job is about, in the words the Images screen uses. */
function jobTitle(job: WorkerJobDoc): string {
  if (job.kind === 'library_group') {
    const group = job.payload?.group as { kind?: string; name?: string } | undefined;
    const steps = job.payload?.steps as { alt?: boolean; images?: boolean } | undefined;
    const name = group?.kind === 'assets' ? 'General assets' : (group?.name ?? 'CMS collection');
    const scope = job.payload?.srcs ? ` · ${(job.payload.srcs as unknown[]).length} picked` : '';
    const what = steps?.alt === false ? ' · images only' : steps?.images === false ? ' · ALT only' : '';
    return `${name}${scope}${what}`;
  }
  return KIND_LABEL[job.kind] ?? job.kind;
}

/** A readable name for the file when the job did not say which item it is. */
function fileLabel(src: string): string {
  try {
    return decodeURIComponent(new URL(src).pathname.split('/').pop() ?? '').replace(/^([0-9a-f]{24}_)+/i, '');
  } catch {
    return src;
  }
}

function openLink(job: WorkerJobDoc): string {
  const base = `/modules/project-links/${job.projectId}`;
  return job.kind === 'library_group' || job.kind === 'alt_apply' || job.kind === 'webflow_alt'
    ? `${base}?tab=webflow&section=images`
    : `${base}?tab=audit`;
}

export function WorkerActivityIndicator() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<WorkerJobDoc[]>([]);
  const [workers, setWorkers] = useState<WorkerDoc[]>([]);
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const stop = [workerRepository.subscribeActiveJobs(setJobs), workerRepository.subscribeWorkers(setWorkers)];
    return () => stop.forEach((fn) => fn());
  }, [user]);

  const running = useMemo(() => jobs.filter((job) => job.status === 'running'), [jobs]);
  const queued = useMemo(() => jobs.filter((job) => job.status === 'queued'), [jobs]);
  const online = workers.filter((worker) => isWorkerOnline(worker));
  const machine = online[0] ?? workers[0];

  const cancel = async (ids: string[]) => {
    setCancelling((previous) => new Set([...previous, ...ids]));
    const by = user?.email ?? 'someone';
    let done = 0;
    for (const id of ids) {
      if (await workerRepository.cancelQueued(id, by).catch(() => false)) done += 1;
    }
    setCancelling((previous) => new Set([...previous].filter((id) => !ids.includes(id))));
    toast.success(done === 1 ? 'Cancelled' : `Cancelled ${done}`);
  };

  if (!user) return null;

  const now = running[0];
  const nowPhase = (now?.currentPhase ?? undefined) as Phase | undefined;
  const nowLabel = now?.currentLabel ?? (now?.currentSrc ? fileLabel(now.currentSrc) : undefined);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={now ? 'secondary' : 'ghost'}
          size="sm"
          className="relative h-9 max-w-[320px] gap-2 px-2.5"
          aria-label="Worker activity"
        >
          {now?.currentSrc && nowPhase ? (
            <WorkingThumb src={now.currentSrc} phase={nowPhase} size="sm" />
          ) : now ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : queued.length ? (
            <Clock className="h-4 w-4" />
          ) : (
            <span className="relative">
              <Cpu className="h-4 w-4" />
              <span
                className={`absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full ${
                  online.length ? 'bg-green-500' : 'bg-muted-foreground/50'
                }`}
              />
            </span>
          )}
          <span className="hidden min-w-0 truncate text-xs lg:inline">
            {now
              ? `${jobTitle(now)}${nowLabel ? ` — ${nowLabel}` : ''}`
              : queued.length
                ? `${queued.length} queued`
                : (machine?.workerId ?? 'Worker')}
          </span>
          {now && typeof now.fraction === 'number' && (
            <span className="hidden text-[11px] tabular-nums text-muted-foreground lg:inline">
              {Math.round(now.fraction * 100)}%
            </span>
          )}
          {queued.length > 0 && now && (
            <Badge variant="outline" className="h-5 min-w-5 px-1 text-[10px] tabular-nums">
              +{queued.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[400px] p-0">
        <div className="border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3">
          <DropdownMenuLabel className="flex items-center justify-between p-0 text-sm">
            <span className="font-semibold">Worker activity</span>
            <span className="flex items-center gap-1.5 text-[11px] font-normal text-muted-foreground">
              <span className={`h-1.5 w-1.5 rounded-full ${online.length ? 'bg-green-500' : 'bg-muted-foreground/50'}`} />
              {machine ? `${machine.workerId} ${online.length ? 'online' : 'offline'}` : 'No worker'}
              {machine?.paused ? ' · paused' : ''}
            </span>
          </DropdownMenuLabel>
        </div>

        {running.length === 0 && queued.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing running or queued.</p>
        )}

        {running.map((job) => {
          const phase = (job.currentPhase ?? undefined) as Phase | undefined;
          const label = job.currentLabel ?? (job.currentSrc ? fileLabel(job.currentSrc) : undefined);
          return (
            <div key={job.id} className="space-y-2.5 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs text-muted-foreground">{job.projectName ?? 'Project'}</p>
                  <p className="truncate text-sm font-medium">{jobTitle(job)}</p>
                </div>
                <Button asChild variant="outline" size="sm" className="h-7 shrink-0 px-2 text-xs">
                  <Link href={openLink(job)}>Open</Link>
                </Button>
              </div>
              {job.currentSrc && phase ? (
                <div className="flex items-center gap-3">
                  <WorkingThumb src={job.currentSrc} phase={phase} size="md" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-primary">{PHASE_WORD[phase]}</p>
                    <p className="truncate text-sm" title={label}>
                      {label}
                    </p>
                  </div>
                </div>
              ) : null}
              <div className="space-y-1">
                <Progress value={Math.round((job.fraction ?? 0) * 100)} className="h-1.5" />
                <p className="truncate text-[11px] text-muted-foreground tabular-nums">
                  {job.progress ?? 'Starting'} · {Math.round((job.fraction ?? 0) * 100)}%
                </p>
              </div>
            </div>
          );
        })}

        {queued.length > 0 && (
          <>
            {running.length > 0 && <DropdownMenuSeparator className="my-0" />}
            <div className="flex items-center justify-between px-4 pb-1 pt-3">
              <span className="text-xs font-medium">Queued · {queued.length}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-destructive"
                onClick={() => cancel(queued.map((job) => job.id))}
                disabled={cancelling.size > 0}
              >
                Cancel all
              </Button>
            </div>
            <ul className="max-h-[280px] overflow-y-auto pb-2">
              {queued.map((job) => (
                <li key={job.id} className="flex items-center gap-2 px-4 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs">
                      {jobTitle(job)}
                      {(job.priority ?? 0) >= 10 && (
                        <Badge variant="outline" className="ml-1.5 h-4 px-1 text-[9px]">
                          goes first
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">{job.projectName ?? 'Project'}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 shrink-0 p-0"
                    onClick={() => cancel([job.id])}
                    disabled={cancelling.has(job.id)}
                    aria-label={`Cancel ${jobTitle(job)}`}
                  >
                    {cancelling.has(job.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
