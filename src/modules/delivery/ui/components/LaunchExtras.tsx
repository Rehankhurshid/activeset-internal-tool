'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { AuditResult, Project, ProjectChecklist } from '@/types';
import { itemsWithRole, roleProgress } from '../../domain/delivery.arc';
import { buildLaunchReadiness, pageChecksFor, resolveAutoCheck } from '../../domain/delivery.progress';
import type { CheckStatus, ProjectPage, StackDefinition } from '../../domain/delivery.types';
import { deliveryRepository } from '../../infrastructure/delivery.repository';
import { STATUS_LABELS } from './CheckStatusControl';
import { LaunchReadinessCard } from './LaunchReadinessCard';
import { PageQcMatrix } from './PageQcMatrix';

/**
 * What a launch stage has beyond its items: the verdict, and the per-page QC.
 *
 * The verdict is derived from the work — pages built, this project's own launch
 * items, per-page QC — so there is deliberately no button here that declares a
 * site ready. It wraps the stage's items because it is read off them: the
 * verdict above the list it comes from, and the matrix of the same questions
 * asked per page below it.
 */

export interface LaunchExtrasProps {
  project: Project;
  stack: StackDefinition;
  /** Every checklist: readiness counts every launch stage, not only this one. */
  checklists: ProjectChecklist[];
  pages: ProjectPage[];
  /** Page id → the latest scan for that page, where one exists. */
  auditsByPageId: Record<string, AuditResult | undefined>;
  /** Shown so it is clear whose answers these are; answers themselves are shared. */
  userEmail?: string;
  /** The stage's own items, rendered between the verdict and the matrix. */
  children?: ReactNode;
}

export function LaunchExtras({
  project,
  stack,
  checklists,
  pages,
  auditsByPageId,
  userEmail,
  children,
}: LaunchExtrasProps) {
  // Answers written but not yet reflected by the subscription, so a click lands
  // immediately instead of waiting on a round trip.
  const [pageOverrides, setPageOverrides] = useState<Record<string, Record<string, CheckStatus>>>({});

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

  // This project's own per-page QC questions, not the stack's, once it has any.
  const pageChecks = useMemo(() => pageChecksFor(stack, project.delivery), [stack, project.delivery]);

  const launchItems = useMemo(() => itemsWithRole(checklists, 'launch'), [checklists]);
  const launchProgress = useMemo(() => roleProgress(checklists, 'launch'), [checklists]);

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

  return (
    <div className="space-y-3">
      <LaunchReadinessCard
        readiness={readiness}
        stackName={stack.name}
        userEmail={userEmail}
        launchChecklistUntagged={launchProgress.untagged}
      />

      {children}

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
