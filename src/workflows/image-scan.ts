import { FatalError, getWorkflowMetadata } from 'workflow';
import { pageScanner } from '@/services/PageScanner';
import { projectsService } from '@/services/database';
import type { ImageScanJob } from '@/types';

export interface ImageScanPageRef {
  linkId: string;
  url: string;
}

interface PageScanOutcome {
  linkId: string;
  url: string;
  before: number;
  after: number;
  resolved: number;
  skipped?: boolean;
  error?: string;
}

/**
 * Step: scan a single page server-side and persist its ALT results.
 * Returns before/after missing-ALT counts so the workflow can summarize.
 */
async function scanPageAndPersist(
  projectId: string,
  page: ImageScanPageRef
): Promise<PageScanOutcome> {
  'use step';

  if (!page.url) {
    return { linkId: page.linkId, url: page.url, before: 0, after: 0, resolved: 0, skipped: true };
  }

  // Read "before" count from the current link snapshot.
  const project = await projectsService.getProject(projectId);
  if (!project) {
    // Project was deleted mid-scan — don't retry forever.
    throw new FatalError(`Project ${projectId} no longer exists`);
  }
  const link = project.links.find((l) => l.id === page.linkId);
  if (!link) {
    return {
      linkId: page.linkId,
      url: page.url,
      before: 0,
      after: 0,
      resolved: 0,
      skipped: true,
      error: 'link-removed',
    };
  }

  const before =
    (link.auditResult?.categories?.seo as { imagesWithoutAlt?: number } | undefined)
      ?.imagesWithoutAlt ?? 0;

  const result = await pageScanner.scanImagesOnly(page.url);

  await projectsService.saveImageAltResults(projectId, page.linkId, {
    totalImages: result.totalImages,
    uniqueMissingAltCount: result.uniqueMissingAltCount,
    images: result.images,
    checkedAt: result.checkedAt,
  });

  const after = result.uniqueMissingAltCount;
  return {
    linkId: page.linkId,
    url: page.url,
    before,
    after,
    resolved: Math.max(0, before - after),
  };
}

/**
 * Step: heartbeat the persisted ImageScanJob so every subscribed tab sees
 * progress and stale detection works if the run crashes.
 */
async function heartbeatJob(
  projectId: string,
  job: ImageScanJob
): Promise<void> {
  'use step';
  try {
    await projectsService.setImageScanJob(projectId, job);
  } catch (error) {
    // Heartbeat failures shouldn't kill the workflow — progress just won't
    // advance in the UI for this tick. Log and move on.
    console.error('[imageScanWorkflow] Heartbeat failed:', error);
  }
}

/**
 * Step: clear the persisted job on completion or failure.
 */
async function clearJob(projectId: string): Promise<void> {
  'use step';
  try {
    await projectsService.setImageScanJob(projectId, null);
  } catch (error) {
    console.error('[imageScanWorkflow] Clear job failed:', error);
  }
}

/**
 * Durable bulk image-ALT scan. Survives tab closes, refreshes, and function
 * restarts. Each page scan is a retryable step; progress heartbeats are
 * persisted to Firestore so any tab subscribed to the project sees live
 * progress.
 */
export async function imageScanWorkflow(
  projectId: string,
  pages: ImageScanPageRef[]
): Promise<{
  total: number;
  completed: number;
  resolvedCount: number;
  failedCount: number;
}> {
  'use workflow';

  const total = pages.length;
  const startedAt = new Date().toISOString();
  const blockSize = 5;
  const runId = getWorkflowMetadata().workflowRunId;

  let completed = 0;
  let resolvedCount = 0;
  let failedCount = 0;

  await heartbeatJob(projectId, {
    status: 'running',
    startedAt,
    lastUpdatedAt: new Date().toISOString(),
    total,
    completed: 0,
    currentUrl: '',
    resolvedCount: 0,
    failedCount: 0,
    runId,
  });

  for (let start = 0; start < pages.length; start += blockSize) {
    const block = pages.slice(start, start + blockSize);

    // Scan block pages sequentially within the workflow — step parallelism
    // across a workflow function requires Promise.all which is supported,
    // so let the runtime fan them out.
    const outcomes = await Promise.all(
      block.map((page) => scanPageAndPersist(projectId, page).catch((error): PageScanOutcome => ({
        linkId: page.linkId,
        url: page.url,
        before: 0,
        after: 0,
        resolved: 0,
        error: error instanceof Error ? error.message : String(error),
      })))
    );

    for (const outcome of outcomes) {
      completed += 1;
      if (outcome.error) failedCount += 1;
      else resolvedCount += outcome.resolved;
    }

    await heartbeatJob(projectId, {
      status: 'running',
      startedAt,
      lastUpdatedAt: new Date().toISOString(),
      total,
      completed,
      currentUrl: block[block.length - 1]?.url || '',
      resolvedCount,
      failedCount,
      runId,
    });
  }

  await clearJob(projectId);

  return { total, completed, resolvedCount, failedCount };
}
