import type { AuditResult, PreviousAuditSummary, ProjectLink } from '@/types';

/**
 * Anomaly detection compares this scan against the one before it. The daily
 * cron used to do that by holding a copy of every project's audits in memory
 * while it waited, up to twelve minutes, for the scan to finish — and gave up
 * on any project that took longer. Each audit now carries the few numbers the
 * detectors read from the previous scan, so the comparison can run whenever a
 * scan completes, with nothing held across the wait.
 */

export function previousSummaryOf(audit: AuditResult | undefined): PreviousAuditSummary | undefined {
  if (!audit?.lastRun) return undefined;
  return {
    lastRun: audit.lastRun,
    score: audit.score ?? 0,
    changeStatus: audit.changeStatus,
    title: audit.contentSnapshot?.title ?? '',
    h1: audit.contentSnapshot?.h1 ?? '',
    metaDescription: audit.contentSnapshot?.metaDescription ?? '',
    wordCount: audit.contentSnapshot?.wordCount ?? 0,
  };
}

/**
 * The links as they were before their latest scan, rebuilt from the stored
 * summaries, in the shape `detectAnomalies` expects. Links with no previous
 * scan are left out, which is what the detectors want: nothing to compare.
 */
export function previousLinksFrom(links: ProjectLink[]): ProjectLink[] {
  const out: ProjectLink[] = [];
  for (const link of links) {
    const previous = link.auditResult?.previous;
    if (!previous) continue;
    out.push({
      ...link,
      auditResult: {
        score: previous.score,
        summary: '',
        canDeploy: true,
        changeStatus: previous.changeStatus,
        lastRun: previous.lastRun,
        contentSnapshot: {
          title: previous.title,
          h1: previous.h1,
          metaDescription: previous.metaDescription,
          wordCount: previous.wordCount,
          headings: [],
        },
      } as unknown as AuditResult,
    });
  }
  return out;
}

/** Links whose newest scan happened at or after `sinceIso`. */
export function linksScannedSince(links: ProjectLink[], sinceIso: string | undefined): ProjectLink[] {
  if (!sinceIso) return links;
  const since = new Date(sinceIso).getTime();
  if (!Number.isFinite(since)) return links;
  return links.filter((link) => {
    const ran = link.auditResult?.lastRun ? new Date(link.auditResult.lastRun).getTime() : NaN;
    return Number.isFinite(ran) && ran >= since;
  });
}
