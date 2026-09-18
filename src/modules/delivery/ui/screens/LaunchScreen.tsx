'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { AuditResult, Project, ProjectChecklist } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { itemsForStage, stageProgress } from '../../domain/delivery.checklist';
import {
  buildLaunchReadiness,
  pageChecksFor,
  resolveAutoCheck,
} from '../../domain/delivery.progress';
import type {
  AutoCheckVerdict,
  CheckStatus,
  ProjectPage,
  StackDefinition,
} from '../../domain/delivery.types';
import { deliveryRepository, normalizePagePath } from '../../infrastructure/delivery.repository';
import { LaunchReadinessCard } from '../components/LaunchReadinessCard';
import { PageQcMatrix } from '../components/PageQcMatrix';
import { StageChecklist } from '../components/StageChecklist';
import { STATUS_LABELS } from '../components/CheckStatusControl';

/**
 * Launch: is this site ready to go live, and if not, what is in the way.
 *
 * The verdict is derived from the work — pages built, the project's own launch
 * checklist, per-page QC — so there is deliberately no button here that declares
 * a site ready. What counts as ready differs per project, which is why the
 * site-wide half of it is checklist sections tagged `launch` rather than a list
 * in this code. Scan data answers what it can; everything else is a judgement
 * call, and a person's judgement always beats the crawler's.
 */

export interface LaunchScreenProps {
  project: Project;
  stack: StackDefinition;
  /** Shown so it is clear whose answers these are; answers themselves are shared. */
  userEmail?: string;
}

/** Page checks resolved per page need the scan for that page, matched by path. */
function buildAuditsByPageId(
  project: Project,
  pages: ProjectPage[],
): Record<string, AuditResult | undefined> {
  const byPath = new Map<string, { audit: AuditResult; auto: boolean }>();
  for (const link of project.links ?? []) {
    if (!link.url || !link.auditResult) continue;
    const path = normalizePagePath(link.url);
    const auto = link.source === 'auto';
    const existing = byPath.get(path);
    // Discovered links are the scanned ones; a manual link only stands in when
    // nothing discovered covers that path.
    if (!existing || (auto && !existing.auto)) byPath.set(path, { audit: link.auditResult, auto });
  }

  const result: Record<string, AuditResult | undefined> = {};
  for (const page of pages) {
    result[page.id] = byPath.get(normalizePagePath(page.path))?.audit;
  }
  return result;
}

/**
 * What the page scans make of each launch checklist item that names one.
 *
 * A launch item is asked of the whole site, so the pages are read together: one
 * page that would fail is enough to say the site would, and a site where nothing
 * has been scanned gets no verdict at all rather than a reassuring pass. This is
 * a hint beside the item — nothing here answers it, because the person ticking
 * it is the one signing the launch off.
 */
function buildAutoVerdicts(
  items: { id: string; autoCheck?: Parameters<typeof resolveAutoCheck>[0] }[],
  pages: ProjectPage[],
  auditsByPageId: Record<string, AuditResult | undefined>,
): Record<string, AutoCheckVerdict> {
  const verdicts: Record<string, AutoCheckVerdict> = {};
  const scanned = pages.filter((page) => auditsByPageId[page.id]);
  if (scanned.length === 0) return verdicts;

  for (const item of items) {
    if (!item.autoCheck) continue;
    let answered = 0;
    let failing = 0;
    for (const page of scanned) {
      const verdict = resolveAutoCheck(item.autoCheck, auditsByPageId[page.id]);
      if (verdict === 'unknown') continue;
      answered += 1;
      if (verdict === 'fail') failing += 1;
    }
    if (answered === 0) continue;
    verdicts[item.id] = failing > 0 ? 'fail' : 'pass';
  }
  return verdicts;
}

export function LaunchScreen({ project, stack, userEmail }: LaunchScreenProps) {
  const [pages, setPages] = useState<ProjectPage[]>([]);
  const [checklists, setChecklists] = useState<ProjectChecklist[]>([]);
  const [loadingPages, setLoadingPages] = useState(true);
  const [loadingChecklists, setLoadingChecklists] = useState(true);

  // Answers written but not yet reflected by the subscription, so a click lands
  // immediately instead of waiting on a round trip.
  const [pageOverrides, setPageOverrides] = useState<Record<string, Record<string, CheckStatus>>>({});

  useEffect(() => {
    setLoadingPages(true);
    return deliveryRepository.subscribeToPages(project.id, (next) => {
      setPages(next);
      setLoadingPages(false);
    });
  }, [project.id]);

  useEffect(() => {
    setLoadingChecklists(true);
    return deliveryRepository.subscribeToChecklists(project.id, (next) => {
      setChecklists(next);
      setLoadingChecklists(false);
    });
  }, [project.id]);

  // Drop an optimistic answer once the real data agrees, so a later change by
  // someone else is not masked by a stale local value.
  useEffect(() => {
    setPageOverrides((prev) => {
      const next: Record<string, Record<string, CheckStatus>> = {};
      let dropped = 0;
      for (const [pageId, answers] of Object.entries(prev)) {
        const page = pages.find((candidate) => candidate.id === pageId);
        const remaining: Record<string, CheckStatus> = {};
        for (const [checkId, status] of Object.entries(answers)) {
          if (page?.qc?.[checkId] === status) dropped += 1;
          else remaining[checkId] = status;
        }
        if (Object.keys(remaining).length > 0) next[pageId] = remaining;
      }
      return dropped > 0 ? next : prev;
    });
  }, [pages]);

  const mergedPages = useMemo(
    () =>
      pages.map((page) => {
        const overrides = pageOverrides[page.id];
        return overrides ? { ...page, qc: { ...page.qc, ...overrides } } : page;
      }),
    [pages, pageOverrides],
  );

  const auditsByPageId = useMemo(
    () => buildAuditsByPageId(project, mergedPages),
    [project, mergedPages],
  );

  // This project's own per-page QC questions, not the stack's, once it has any.
  const pageChecks = useMemo(() => pageChecksFor(stack, project.delivery), [stack, project.delivery]);

  const launchItems = useMemo(() => itemsForStage(checklists, 'launch'), [checklists]);
  const launchProgress = useMemo(() => stageProgress(checklists, 'launch'), [checklists]);

  const readiness = useMemo(
    () =>
      buildLaunchReadiness(
        {
          pages: mergedPages,
          pageChecks,
          launchChecklistItems: launchItems,
          auditsByPageId,
        },
        stack.disciplines,
      ),
    [mergedPages, pageChecks, launchItems, auditsByPageId, stack.disciplines],
  );

  const autoVerdicts = useMemo(
    () => buildAutoVerdicts(launchItems, mergedPages, auditsByPageId),
    [launchItems, mergedPages, auditsByPageId],
  );

  const handlePageCheck = useCallback(
    async (pageId: string, checkId: string, status: CheckStatus) => {
      const page = pages.find((candidate) => candidate.id === pageId);
      const previous = page?.qc?.[checkId];

      // Answering against the scan is allowed and is the point — it is just
      // worth saying out loud, because the disagreement is now on the record.
      const check = pageChecks.find((candidate) => candidate.id === checkId);
      if (check?.auto && status !== 'pending') {
        const verdict = resolveAutoCheck(check.auto, auditsByPageId[pageId]);
        const scanStatus: CheckStatus | undefined =
          verdict === 'pass' ? 'passed' : verdict === 'fail' ? 'failed' : undefined;
        if (scanStatus && scanStatus !== status) {
          toast.info(
            `Marked ${STATUS_LABELS[status]} — the last scan says ${STATUS_LABELS[scanStatus]}. Your answer wins, and the scan result stays on the row.`,
          );
        }
      }

      setPageOverrides((prev) => ({
        ...prev,
        [pageId]: { ...prev[pageId], [checkId]: status },
      }));

      try {
        await deliveryRepository.setPageCheck(project.id, pageId, checkId, status);
      } catch {
        setPageOverrides((prev) => {
          const answers = { ...prev[pageId] };
          if (previous === undefined) delete answers[checkId];
          else answers[checkId] = previous;
          const next = { ...prev };
          if (Object.keys(answers).length > 0) next[pageId] = answers;
          else delete next[pageId];
          return next;
        });
        toast.error('Could not save that check');
      }
    },
    [project.id, pages, pageChecks, auditsByPageId],
  );

  if (loadingPages || loadingChecklists) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <LaunchReadinessCard
        readiness={readiness}
        stackName={stack.name}
        userEmail={userEmail}
        launchChecklistUntagged={launchProgress.untagged}
      />

      <StageChecklist
        projectId={project.id}
        checklists={checklists}
        stage="launch"
        userEmail={userEmail}
        emptyHint="The launch stage is the site-wide list: the things checked once before going live, not once per page."
        autoVerdicts={autoVerdicts}
      />

      <PageQcMatrix
        projectId={project.id}
        checks={pageChecks}
        defaultChecks={stack.defaultPageChecks}
        stackName={stack.name}
        checksAreSaved={Boolean(project.delivery?.pageChecks?.length)}
        pages={mergedPages}
        auditsByPageId={auditsByPageId}
        onChange={handlePageCheck}
      />
    </div>
  );
}
