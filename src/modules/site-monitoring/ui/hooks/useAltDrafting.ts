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
 * Drafting alt text, for whichever screen is asking.
 *
 * The Audit tab works from scanned pages and the Webflow tab works from the
 * asset library. They are different questions and deserve different screens,
 * but there is no reason for two classifiers, two stores and two sets of
 * buttons — which is what there was, and one of them called Ollama on
 * localhost from a Vercel function and had never worked in production.
 *
 * So both call this. One queue, one draft store keyed by image fingerprint,
 * and a draft made on either side shows up on the other.
 */
export interface AltDrafting {
  /** Drafts by image fingerprint. */
  drafts: Map<string, AltSuggestionDoc>;
  /** The draft for one image URL, whichever screen found it. */
  draftFor: (src: string) => AltSuggestionDoc | undefined;
  /** A drafting job currently queued or running for this project. */
  job?: WorkerJobDoc;
  /** Machines currently able to take the work. */
  online: WorkerDoc[];
  /** Queue a drafting run. `srcs` narrows it to a selection. */
  draft: (input: { srcs?: string[]; scope?: 'missing' | 'all'; sources?: ('assets' | 'cms')[] }) => Promise<void>;
  busy: boolean;
}

export function useAltDrafting(
  projectId: string,
  projectName: string | undefined,
  userEmail: string,
  enabled = true,
): AltDrafting {
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
    () =>
      jobs.find(
        (entry) =>
          (entry.kind === 'webflow_alt' || entry.kind === 'alt_text') &&
          (entry.status === 'queued' || entry.status === 'running'),
      ),
    [jobs],
  );

  const draftFor = useCallback(
    (src: string) => drafts.get(imageFingerprint(src)),
    [drafts],
  );

  const draft = useCallback(
    async (input: { srcs?: string[]; scope?: 'missing' | 'all'; sources?: ('assets' | 'cms')[] }) => {
      setBusy(true);
      try {
        await workerRepository.enqueue({
          kind: 'webflow_alt',
          projectId,
          projectName,
          payload: { ...input, by: userEmail },
          requestedBy: userEmail,
        });
        toast.success(
          online.length > 0
            ? `Queued — ${online[0].workerId} picks it up within a few seconds`
            : 'Queued. It runs when a worker machine is next online — start one with `npm run worker run`.',
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not queue that');
      } finally {
        setBusy(false);
      }
    },
    [projectId, projectName, userEmail, online],
  );

  return { drafts, draftFor, job, online, draft, busy };
}
