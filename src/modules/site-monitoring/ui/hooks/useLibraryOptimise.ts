'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { imageFingerprint } from '../../domain/audit-findings';
import {
  isWorkerOnline,
  workerRepository,
  type WorkerDoc,
  type WorkerJobDoc,
} from '../../infrastructure/worker.repository';
import {
  altSuggestionsRepository,
  type AltSuggestionDoc,
} from '../../infrastructure/alt-suggestions.repository';

/**
 * The Webflow tab's one hook for its one Images screen.
 *
 * It replaced two: one that drafted alt for site assets and saved it from the
 * browser, one that built a CLI command for CMS images and printed "web
 * preview only". Both screens now share this, which queues one job that does
 * everything safe for a selection and one job that applies alt text a person
 * has read. Nothing here writes to Webflow from the browser; the worker is the
 * single door.
 */

const LIBRARY_KINDS = new Set(['library_optimise', 'alt_apply', 'webflow_alt', 'image_apply']);

export interface LibraryOptimise {
  drafts: Map<string, AltSuggestionDoc>;
  draftFor: (src: string) => AltSuggestionDoc | undefined;
  /** Any library job queued or running for this project. */
  job?: WorkerJobDoc;
  /** The most recent finished one-shot, for the summary line. */
  lastRun?: WorkerJobDoc;
  online: WorkerDoc[];
  optimise: (srcs: string[], options?: { altScope?: 'missing' | 'all'; publish?: boolean }) => Promise<void>;
  applyAlt: (items: { fingerprint: string; src: string; alt: string }[], publish?: boolean) => Promise<void>;
  busy: boolean;
}

export function useLibraryOptimise(
  projectId: string,
  projectName: string | undefined,
  userEmail: string,
  enabled = true,
): LibraryOptimise {
  const [drafts, setDrafts] = useState<Map<string, AltSuggestionDoc>>(new Map());
  const [jobs, setJobs] = useState<WorkerJobDoc[]>([]);
  const [workers, setWorkers] = useState<WorkerDoc[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled || !projectId) return;
    const stop = [
      altSuggestionsRepository.subscribe(projectId, setDrafts),
      workerRepository.subscribeJobs(projectId, setJobs),
      workerRepository.subscribeWorkers(setWorkers),
    ];
    return () => stop.forEach((fn) => fn());
  }, [projectId, enabled]);

  const online = useMemo(() => workers.filter((worker) => isWorkerOnline(worker)), [workers]);

  const job = useMemo(
    () => jobs.find((entry) => LIBRARY_KINDS.has(entry.kind) && (entry.status === 'queued' || entry.status === 'running')),
    [jobs],
  );

  const lastRun = useMemo(
    () =>
      jobs
        .filter((entry) => entry.kind === 'library_optimise' && (entry.status === 'done' || entry.status === 'failed'))
        .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))[0],
    [jobs],
  );

  const draftFor = useCallback((src: string) => drafts.get(imageFingerprint(src)), [drafts]);

  const queued = useCallback(
    (count: number) =>
      toast.success(
        online.length > 0
          ? `Queued ${count} — ${online[0].workerId} picks it up within a few seconds`
          : `Queued ${count}. It runs when a worker machine is next online.`,
      ),
    [online],
  );

  const optimise = useCallback(
    async (srcs: string[], options: { altScope?: 'missing' | 'all'; publish?: boolean } = {}) => {
      if (srcs.length === 0) return void toast.error('Nothing selected');
      setBusy(true);
      try {
        await workerRepository.enqueue({
          kind: 'library_optimise',
          projectId,
          projectName,
          payload: { srcs, altScope: options.altScope ?? 'missing', publish: options.publish ?? false, by: userEmail },
          requestedBy: userEmail,
        });
        queued(srcs.length);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not queue that');
      } finally {
        setBusy(false);
      }
    },
    [projectId, projectName, userEmail, queued],
  );

  const applyAlt = useCallback(
    async (items: { fingerprint: string; src: string; alt: string }[], publish = false) => {
      if (items.length === 0) return void toast.error('Nothing to apply');
      setBusy(true);
      try {
        await workerRepository.enqueue({
          kind: 'alt_apply',
          projectId,
          projectName,
          payload: { fingerprints: items.map((item) => item.fingerprint), overrides: items, publish, by: userEmail },
          requestedBy: userEmail,
        });
        queued(items.length);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not queue that');
      } finally {
        setBusy(false);
      }
    },
    [projectId, projectName, userEmail, queued],
  );

  return { drafts, draftFor, job, lastRun, online, optimise, applyAlt, busy };
}
