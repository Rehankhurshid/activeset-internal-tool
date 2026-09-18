'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { AuditResult, Project } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { buildLaunchReadiness, resolveAutoCheck } from '../../domain/delivery.progress';
import type {
  CheckStatus,
  ProjectPage,
  StackDefinition,
} from '../../domain/delivery.types';
import { deliveryRepository, normalizePagePath } from '../../infrastructure/delivery.repository';
import { LaunchReadinessCard } from '../components/LaunchReadinessCard';
import { PageQcMatrix } from '../components/PageQcMatrix';
import { SiteChecklist } from '../components/SiteChecklist';
import { STATUS_LABELS } from '../components/CheckStatusControl';

/**
 * Launch: is this site ready to go live, and if not, what is in the way.
 *
 * The verdict is derived from the work — pages built, site checks, per-page QC —
 * so there is deliberately no button here that declares a site ready. Scan data
 * the app already has answers the checks it can answer; everything else is a
 * judgement call, and a person's judgement always beats the crawler's.
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
 * What the page scans suggest about a site-wide check.
 *
 * Site checks are never *answered* from scan data — `buildLaunchReadiness`
 * resolves them with no audit, and a number that disagreed with the checklist
 * below it would be worse than no number. This is a hint, shown under the check,
 * so the person answering knows where to look.
 */
function buildSiteScanHints(
  stack: StackDefinition,
  pages: ProjectPage[],
  auditsByPageId: Record<string, AuditResult | undefined>,
): Record<string, string> {
  const hints: Record<string, string> = {};
  const scanned = pages.filter((page) => auditsByPageId[page.id]);
  if (scanned.length === 0) return hints;

  for (const check of stack.checks) {
    if (check.scope !== 'site' || !check.auto) continue;
    let failing = 0;
    let answered = 0;
    for (const page of scanned) {
      const verdict = resolveAutoCheck(check.auto, auditsByPageId[page.id]);
      if (verdict === 'unknown') continue;
      answered += 1;
      if (verdict === 'fail') failing += 1;
    }
    if (answered === 0) continue;
    hints[check.id] =
      failing === 0
        ? `Last scan: clear on all ${answered} scanned ${answered === 1 ? 'page' : 'pages'}.`
        : `Last scan: ${failing} of ${answered} scanned ${answered === 1 ? 'page' : 'pages'} would fail this.`;
  }
  return hints;
}

export function LaunchScreen({ project, stack, userEmail }: LaunchScreenProps) {
  const [pages, setPages] = useState<ProjectPage[]>([]);
  const [loading, setLoading] = useState(true);

  // Answers written but not yet reflected by the subscription, so a click lands
  // immediately instead of waiting on a round trip.
  const [siteOverrides, setSiteOverrides] = useState<Record<string, CheckStatus>>({});
  const [pageOverrides, setPageOverrides] = useState<Record<string, Record<string, CheckStatus>>>({});

  useEffect(() => {
    setLoading(true);
    const unsubscribe = deliveryRepository.subscribeToPages(project.id, (next) => {
      setPages(next);
      setLoading(false);
    });
    return unsubscribe;
  }, [project.id]);

  const serverSiteChecks = useMemo(
    () => project.delivery?.siteChecks ?? {},
    [project.delivery?.siteChecks],
  );

  // Drop an optimistic answer once the real data agrees, so a later change by
  // someone else is not masked by a stale local value.
  useEffect(() => {
    setSiteOverrides((prev) => {
      const next: Record<string, CheckStatus> = {};
      let changed = false;
      for (const [checkId, status] of Object.entries(prev)) {
        if (serverSiteChecks[checkId] === status) changed = true;
        else next[checkId] = status;
      }
      return changed ? next : prev;
    });
  }, [serverSiteChecks]);

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

  const siteAnswers = useMemo(
    () => ({ ...serverSiteChecks, ...siteOverrides }),
    [serverSiteChecks, siteOverrides],
  );

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

  const readiness = useMemo(
    () =>
      buildLaunchReadiness({
        stack,
        pages: mergedPages,
        delivery: { ...project.delivery, siteChecks: siteAnswers },
        auditsByPageId,
      }),
    [stack, mergedPages, project.delivery, siteAnswers, auditsByPageId],
  );

  const siteHints = useMemo(
    () => buildSiteScanHints(stack, mergedPages, auditsByPageId),
    [stack, mergedPages, auditsByPageId],
  );

  const handleSiteCheck = useCallback(
    async (checkId: string, status: CheckStatus) => {
      const previous = serverSiteChecks[checkId];
      setSiteOverrides((prev) => ({ ...prev, [checkId]: status }));
      try {
        await deliveryRepository.setSiteCheck(project.id, checkId, status);
      } catch {
        setSiteOverrides((prev) => {
          const next = { ...prev };
          if (previous === undefined) delete next[checkId];
          else next[checkId] = previous;
          return next;
        });
        toast.error('Could not save that check');
      }
    },
    [project.id, serverSiteChecks],
  );

  const handlePageCheck = useCallback(
    async (pageId: string, checkId: string, status: CheckStatus) => {
      const page = pages.find((candidate) => candidate.id === pageId);
      const previous = page?.qc?.[checkId];

      // Answering against the scan is allowed and is the point — it is just
      // worth saying out loud, because the disagreement is now on the record.
      const check = stack.checks.find((candidate) => candidate.id === checkId);
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
    [project.id, pages, stack, auditsByPageId],
  );

  if (loading) {
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
      <LaunchReadinessCard readiness={readiness} stackName={stack.name} userEmail={userEmail} />
      <SiteChecklist
        stack={stack}
        answers={siteAnswers}
        hints={siteHints}
        onChange={handleSiteCheck}
      />
      <PageQcMatrix
        stack={stack}
        pages={mergedPages}
        auditsByPageId={auditsByPageId}
        onChange={handlePageCheck}
      />
    </div>
  );
}
