'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  isWorkerOnline,
  workerRepository,
  type WorkerDoc,
  type WorkerJobDoc,
} from '../../infrastructure/worker.repository';

/**
 * Optimising images, for whichever screen is asking.
 *
 * The sibling of `useAltDrafting`, and for the same reason. The Webflow tab's
 * Compress used to build a CLI command you pasted into a terminal, and that
 * command re-encoded at unchanged dimensions; the Audit tab's Weight tab could
 * measure the right width and then only tell you about it. Both now queue the
 * same `image_apply` job, so there is one pipeline — archive to Bunny,
 * re-encode perceptually losslessly, upload, repoint every CMS field that used
 * the old file — and two screens asking different questions of it.
 *
 * The difference between them is knowledge, not capability: a measured image
 * is resized to its display width, and one nobody has measured is re-encoded
 * at its own dimensions.
 */
export interface ImageOptimising {
  /** A queued or running optimisation for this project. */
  job?: WorkerJobDoc;
  /** Machines currently able to take the work. */
  online: WorkerDoc[];
  /** Queue an optimisation for these image URLs. */
  run: (srcs: string[], publish?: boolean) => Promise<void>;
  busy: boolean;
}

export function useImageOptimising(
  projectId: string,
  projectName: string | undefined,
  userEmail: string,
  enabled = true,
): ImageOptimising {
  const [jobs, setJobs] = useState<WorkerJobDoc[]>([]);
  const [workers, setWorkers] = useState<WorkerDoc[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled || !projectId) return;
    const stop = [
      workerRepository.subscribeJobs(projectId, setJobs),
      workerRepository.subscribeWorkers(setWorkers),
    ];
    return () => stop.forEach((fn) => fn());
  }, [projectId, enabled]);

  const online = useMemo(() => workers.filter((worker) => isWorkerOnline(worker)), [workers]);

  const job = useMemo(
    () =>
      jobs.find(
        (entry) => entry.kind === 'image_apply' && (entry.status === 'queued' || entry.status === 'running'),
      ),
    [jobs],
  );

  const run = useCallback(
    async (srcs: string[], publish = false) => {
      if (srcs.length === 0) {
        toast.error('Nothing selected');
        return;
      }
      setBusy(true);
      try {
        await workerRepository.enqueue({
          kind: 'image_apply',
          projectId,
          projectName,
          payload: { srcs, publish, by: userEmail },
          requestedBy: userEmail,
        });
        toast.success(
          online.length > 0
            ? `Queued ${srcs.length} — ${online[0].workerId} picks it up within a few seconds`
            : 'Queued. It runs when a worker machine is next online.',
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not queue that');
      } finally {
        setBusy(false);
      }
    },
    [projectId, projectName, userEmail, online],
  );

  return { job, online, run, busy };
}
