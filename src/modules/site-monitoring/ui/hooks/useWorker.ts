'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  isWorkerOnline,
  workerRepository,
  type WeightFindingDoc,
  type WorkerDoc,
  type WorkerJobDoc,
  type WorkerJobKind,
} from '../../infrastructure/worker.repository';

/**
 * Queue work for the always-on machine and watch it happen.
 *
 * Everything here is a live subscription, because the interesting moment is
 * the one where a job that was queued on a phone starts running on a PC in
 * another room.
 */
export function useWorker(projectId: string, projectName?: string, enabled = true) {
  const [jobs, setJobs] = useState<WorkerJobDoc[]>([]);
  const [workers, setWorkers] = useState<WorkerDoc[]>([]);
  const [weight, setWeight] = useState<WeightFindingDoc[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled || !projectId) return;
    const stop = [
      workerRepository.subscribeJobs(projectId, setJobs),
      workerRepository.subscribeWorkers(setWorkers),
      workerRepository.subscribeWeight(projectId, setWeight),
    ];
    return () => stop.forEach((fn) => fn());
  }, [projectId, projectName, enabled]);

  // Online is a function of elapsed time, so it has to be re-evaluated even
  // when nothing arrives — otherwise a worker that dies stays green forever.
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [enabled]);

  const online = useMemo(() => workers.filter((worker) => isWorkerOnline(worker, now)), [workers, now]);

  const activeJob = useMemo(
    () => jobs.find((job) => job.status === 'running') ?? jobs.find((job) => job.status === 'queued'),
    [jobs],
  );

  const lastDone = useCallback(
    (kind: WorkerJobKind) => jobs.find((job) => job.kind === kind && job.status === 'done'),
    [jobs],
  );

  const enqueue = useCallback(
    async (kind: WorkerJobKind, payload?: Record<string, unknown>, requestedBy?: string) => {
      try {
        await workerRepository.enqueue({ kind, projectId, projectName, payload, requestedBy });
        toast.success(
          online.length > 0
            ? `Queued — ${online[0].workerId} will pick it up within a few seconds`
            : 'Queued. It will run when the worker machine is next on.',
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not queue that');
        throw error;
      }
    },
    [projectId, projectName, online],
  );

  return { jobs, workers, online, weight, activeJob, lastDone, enqueue };
}
