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
 * The Images screen's one hook: optimise a group, see how each group is doing.
 *
 * A group is the site's general assets or one CMS collection, and each gets
 * its own worker job — so each section of the screen has its own progress,
 * its own result and its own failure, and "Optimise everything" is just every
 * group queued in order. Nothing here writes to Webflow from the browser; a
 * hand-edited ALT goes through the worker like everything else.
 */

export type LibraryGroupRef = { kind: 'assets' } | { kind: 'collection'; collectionId: string; name?: string };

/** Mirrors `groupKey` in the worker's library-group handler. */
export const libraryGroupKey = (group: LibraryGroupRef) =>
  group.kind === 'assets' ? 'assets' : group.collectionId;

const keyOf = (job: WorkerJobDoc) => {
  const group = job.payload?.group as LibraryGroupRef | undefined;
  return group ? libraryGroupKey(group) : undefined;
};

/** A draft the classifier stands behind. Mirrors `isConfident` in the worker. */
export const isConfidentDraft = (draft: Pick<AltSuggestionDoc, 'needsReview' | 'certainty'>) =>
  !draft.needsReview && draft.certainty !== 'low';

export interface LibraryOptimise {
  drafts: Map<string, AltSuggestionDoc>;
  draftFor: (src: string) => AltSuggestionDoc | undefined;
  online: WorkerDoc[];
  /** The queued or running job for a group. */
  activeFor: (key: string) => WorkerJobDoc | undefined;
  /** The last finished job for a group, for its result line. */
  lastFor: (key: string) => WorkerJobDoc | undefined;
  optimise: (groups: LibraryGroupRef[], publish: boolean) => Promise<void>;
  /** Write one hand-checked or hand-edited ALT, through the worker. */
  saveAlt: (item: { fingerprint: string; src: string; alt: string }) => Promise<void>;
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

  const { active, last } = useMemo(() => {
    const active = new Map<string, WorkerJobDoc>();
    const last = new Map<string, WorkerJobDoc>();
    // Newest first, so the first job seen for a group is its latest.
    for (const job of jobs) {
      if (job.kind !== 'library_group') continue;
      const key = keyOf(job);
      if (!key) continue;
      if (job.status === 'queued' || job.status === 'running') {
        if (!active.has(key)) active.set(key, job);
      } else if (!last.has(key)) {
        last.set(key, job);
      }
    }
    return { active, last };
  }, [jobs]);

  const draftFor = useCallback((src: string) => drafts.get(imageFingerprint(src)), [drafts]);

  const optimise = useCallback(
    async (groups: LibraryGroupRef[], publish: boolean) => {
      const todo = groups.filter((group) => !active.has(libraryGroupKey(group)));
      if (todo.length === 0) return void toast.message('Already queued');
      setBusy(true);
      try {
        // In order: general assets first, then collections as listed.
        for (const group of todo) {
          await workerRepository.enqueue({
            kind: 'library_group',
            projectId,
            projectName,
            payload: { group, publish, by: userEmail },
            requestedBy: userEmail,
          });
        }
        toast.success(
          online.length > 0
            ? `Queued ${todo.length === 1 ? 'it' : `${todo.length} groups`} — ${online[0].workerId} is on it`
            : 'Queued. It starts when a worker machine is next online.',
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not queue that');
      } finally {
        setBusy(false);
      }
    },
    [active, projectId, projectName, userEmail, online],
  );

  const saveAlt = useCallback(
    async (item: { fingerprint: string; src: string; alt: string }) => {
      try {
        await workerRepository.enqueue({
          kind: 'alt_apply',
          projectId,
          projectName,
          payload: { fingerprints: [item.fingerprint], overrides: [item], by: userEmail },
          requestedBy: userEmail,
        });
        toast.success('Saving — it lands in Webflow in a few seconds');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not save that');
      }
    },
    [projectId, projectName, userEmail],
  );

  return {
    drafts,
    draftFor,
    online,
    activeFor: (key) => active.get(key),
    lastFor: (key) => last.get(key),
    optimise,
    saveAlt,
    busy,
  };
}
