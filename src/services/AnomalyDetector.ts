import { ProjectLink } from '@/types';
import { CreateSiteAlertInput, AlertType, AlertSeverity, AffectedPage } from '@/types/alerts';

/**
 * Anomaly Detector — analyzes scan results by comparing current vs previous
 * audit data on project links. Called after daily cron scans complete.
 */

interface AnomalyContext {
  projectId: string;
  projectName: string;
  /** Links with their CURRENT (post-scan) auditResult */
  currentLinks: ProjectLink[];
  /** Snapshot of links BEFORE the scan ran (previous auditResults) */
  previousLinks: ProjectLink[];
}

function createAlert(
  ctx: AnomalyContext,
  type: AlertType,
  severity: AlertSeverity,
  title: string,
  message: string,
  affectedPages: AffectedPage[]
): CreateSiteAlertInput {
  return {
    projectId: ctx.projectId,
    projectName: ctx.projectName,
    type,
    severity,
    title,
    message,
    affectedPages,
    read: false,
    dismissed: false,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Detect gibberish / garbage content.
 * Triggers when word count drops >60% from previous scan.
 */
function detectGibberishContent(ctx: AnomalyContext): CreateSiteAlertInput[] {
  const alerts: CreateSiteAlertInput[] = [];
  const affected: AffectedPage[] = [];

  for (const current of ctx.currentLinks) {
    if (current.source !== 'auto' || !current.auditResult?.contentSnapshot) continue;

    const prev = ctx.previousLinks.find((l) => l.id === current.id);
    if (!prev?.auditResult?.contentSnapshot) continue;

    const prevWords = prev.auditResult.contentSnapshot.wordCount;
    const currWords = current.auditResult.contentSnapshot.wordCount;

    // Only trigger if previous had substantial content
    if (prevWords < 50) continue;

    const dropPercent = ((prevWords - currWords) / prevWords) * 100;

    if (dropPercent > 60) {
      affected.push({
        url: current.url,
        title: current.title,
        detail: `Word count dropped from ${prevWords} to ${currWords} (${Math.round(dropPercent)}% drop)`,
      });
    }
  }

  if (affected.length > 0) {
    alerts.push(
      createAlert(
        ctx,
        'gibberish_content',
        'critical',
        `Gibberish content detected on ${affected.length} page(s)`,
        `Significant word count drops detected, suggesting pages may have been overwritten with garbage or broken content. This could indicate a bad deployment or CMS issue.`,
        affected
      )
    );
  }

  return alerts;
}

/**
 * Detect content degradation — audit score dropped >20 points.
 */
function detectContentDegradation(ctx: AnomalyContext): CreateSiteAlertInput[] {
  const alerts: CreateSiteAlertInput[] = [];
  const affected: AffectedPage[] = [];

  for (const current of ctx.currentLinks) {
    if (current.source !== 'auto' || !current.auditResult) continue;

    const prev = ctx.previousLinks.find((l) => l.id === current.id);
    if (!prev?.auditResult) continue;

    const scoreDrop = prev.auditResult.score - current.auditResult.score;

    if (scoreDrop > 20) {
      affected.push({
        url: current.url,
        title: current.title,
        detail: `Score dropped from ${prev.auditResult.score} to ${current.auditResult.score} (-${scoreDrop})`,
      });
    }
  }

  if (affected.length > 0) {
    alerts.push(
      createAlert(
        ctx,
        'content_degradation',
        'warning',
        `Content quality degraded on ${affected.length} page(s)`,
        `Audit scores dropped significantly. Review these pages for content issues.`,
        affected
      )
    );
  }

  return alerts;
}

/**
 * Detect mass changes — >50% of pages changed in a single scan.
 * Minimum threshold: 5 changed pages to avoid false positives on small projects.
 */
function detectMassChanges(ctx: AnomalyContext): CreateSiteAlertInput[] {
  const autoLinks = ctx.currentLinks.filter((l) => l.source === 'auto' && l.auditResult);
  if (autoLinks.length < 10) return []; // Too few pages to judge

  const changedLinks = autoLinks.filter(
    (l) => l.auditResult?.changeStatus === 'CONTENT_CHANGED'
  );

  const changeRatio = changedLinks.length / autoLinks.length;

  if (changedLinks.length >= 5 && changeRatio > 0.5) {
    return [
      createAlert(
        ctx,
        'mass_changes',
        'warning',
        `Mass content changes: ${changedLinks.length}/${autoLinks.length} pages changed`,
        `Over ${Math.round(changeRatio * 100)}% of pages changed in a single scan. This could indicate a deployment or bulk CMS update. Review to ensure changes are intentional.`,
        changedLinks.map((l) => ({
          url: l.url,
          title: l.title,
        }))
      ),
    ];
  }

  return [];
}

/**
 * Detect scan failures — pages that failed to scan.
 */
function detectScanFailures(ctx: AnomalyContext): CreateSiteAlertInput[] {
  const failedLinks = ctx.currentLinks.filter(
    (l) => l.source === 'auto' && l.auditResult?.changeStatus === 'SCAN_FAILED'
  );

  if (failedLinks.length === 0) return [];

  const severity: AlertSeverity = failedLinks.length > 3 ? 'critical' : 'warning';

  return [
    createAlert(
      ctx,
      'scan_failed',
      severity,
      `${failedLinks.length} page(s) failed to scan`,
      `These pages could not be scanned. They may be returning errors, timing out, or the URLs may have changed.`,
      failedLinks.map((l) => ({
        url: l.url,
        title: l.title,
        detail: l.auditResult?.summary || 'Scan failed',
      }))
    ),
  ];
}

/**
 * Detect SEO regressions — meta data that previously existed is now missing.
 */
function detectSEORegressions(ctx: AnomalyContext): CreateSiteAlertInput[] {
  const alerts: CreateSiteAlertInput[] = [];
  const affected: AffectedPage[] = [];

  for (const current of ctx.currentLinks) {
    if (current.source !== 'auto' || !current.auditResult?.contentSnapshot) continue;

    const prev = ctx.previousLinks.find((l) => l.id === current.id);
    if (!prev?.auditResult?.contentSnapshot) continue;

    const regressions: string[] = [];

    // Title was present, now missing
    if (prev.auditResult.contentSnapshot.title && !current.auditResult.contentSnapshot.title) {
      regressions.push('Title tag removed');
    }

    // Meta description was present, now missing
    if (prev.auditResult.contentSnapshot.metaDescription && !current.auditResult.contentSnapshot.metaDescription) {
      regressions.push('Meta description removed');
    }

    // H1 was present, now missing
    if (prev.auditResult.contentSnapshot.h1 && !current.auditResult.contentSnapshot.h1) {
      regressions.push('H1 heading removed');
    }

    if (regressions.length > 0) {
      affected.push({
        url: current.url,
        title: current.title,
        detail: regressions.join(', '),
      });
    }
  }

  if (affected.length > 0) {
    alerts.push(
      createAlert(
        ctx,
        'seo_regression',
        'warning',
        `SEO elements removed from ${affected.length} page(s)`,
        `Previously present SEO metadata (titles, descriptions, H1s) has been removed. This could hurt search rankings.`,
        affected
      )
    );
  }

  return alerts;
}

/**
 * Detect significant word count drops on individual pages (>40% drop).
 */
function detectWordCountDrops(ctx: AnomalyContext): CreateSiteAlertInput[] {
  const affected: AffectedPage[] = [];

  for (const current of ctx.currentLinks) {
    if (current.source !== 'auto' || !current.auditResult?.contentSnapshot) continue;

    const prev = ctx.previousLinks.find((l) => l.id === current.id);
    if (!prev?.auditResult?.contentSnapshot) continue;

    const prevWords = prev.auditResult.contentSnapshot.wordCount;
    const currWords = current.auditResult.contentSnapshot.wordCount;

    if (prevWords < 30) continue; // Skip low-content pages

    const dropPercent = ((prevWords - currWords) / prevWords) * 100;

    // 40-60% drop is a word count warning (>60% is caught by gibberish detector as critical)
    if (dropPercent > 40 && dropPercent <= 60) {
      affected.push({
        url: current.url,
        title: current.title,
        detail: `Word count: ${prevWords} → ${currWords} (${Math.round(dropPercent)}% drop)`,
      });
    }
  }

  if (affected.length === 0) return [];

  return [
    createAlert(
      {
        projectId: ctx.projectId,
        projectName: ctx.projectName,
        currentLinks: ctx.currentLinks,
        previousLinks: ctx.previousLinks,
      },
      'word_count_drop',
      'warning',
      `Word count dropped on ${affected.length} page(s)`,
      `Significant content reduction detected. Content may have been accidentally removed.`,
      affected
    ),
  ];
}

/**
 * Main entry point: run all anomaly detectors and return combined alerts.
 */
export function detectAnomalies(
  projectId: string,
  projectName: string,
  currentLinks: ProjectLink[],
  previousLinks: ProjectLink[]
): CreateSiteAlertInput[] {
  const ctx: AnomalyContext = { projectId, projectName, currentLinks, previousLinks };

  const allAlerts: CreateSiteAlertInput[] = [
    ...detectGibberishContent(ctx),
    ...detectContentDegradation(ctx),
    ...detectMassChanges(ctx),
    ...detectScanFailures(ctx),
    ...detectSEORegressions(ctx),
    ...detectWordCountDrops(ctx),
  ];

  return allAlerts;
}
