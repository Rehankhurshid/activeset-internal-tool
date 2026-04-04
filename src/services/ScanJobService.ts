import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/constants';
import { projectsService } from '@/services/database';
import { pageScanner } from '@/services/PageScanner';
import { getScreenshotService } from '@/services/ScreenshotService';
import { AuditLogEntry, AuditService } from '@/services/AuditService';
import { changeLogService } from '@/services/ChangeLogService';
import { uploadScreenshot } from '@/services/ScreenshotStorageService';
import {
  compactAuditResult,
  computeBodyTextDiff,
  computeChangeStatus,
  computeFieldChanges,
  generateDiffPatch,
} from '@/lib/scan-utils';
import { ensureScanNotificationQueued } from '@/services/ScanNotificationQueueService';
import { AuditResult, ChangeLogEntry, ChangeStatus, FieldChange, Project, ProjectLink } from '@/types';

export type ScanJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ScanJobSummary {
  noChange: number;
  techChange: number;
  contentChanged: number;
  failed: number;
}

export interface ScanJob {
  scanId: string;
  projectId: string;
  projectName: string;
  status: ScanJobStatus;
  current: number;
  total: number;
  currentUrl: string;
  startedAt: string;
  updatedAt: string;
  scanCollections: boolean;
  captureScreenshots: boolean;
  targetLinkIds: string[];
  completedLinkIds: string[];
  summary: ScanJobSummary;
  completedAt?: string;
  error?: string;
  cancelRequested?: boolean;
  processingStartedAt?: string;
}

interface PendingWrite {
  auditLog?: AuditLogEntry;
  changeLogEntry?: Omit<ChangeLogEntry, 'id'>;
}

interface CreateScanJobInput {
  project: Project;
  linksToScan: ProjectLink[];
  scanCollections: boolean;
  captureScreenshots: boolean;
}

interface ProcessScanJobBatchResult {
  scanId: string;
  status: ScanJobStatus | 'skipped';
  current: number;
  total: number;
  error?: string;
}

const SCAN_JOBS_COLLECTION = COLLECTIONS.SCAN_JOBS;
const ACTIVE_SCAN_JOB_STATUSES: ScanJobStatus[] = ['queued', 'running'];
const PAGES_PER_BATCH = 10;
const PARALLEL_CONCURRENCY = 5;
const PROCESSING_LOCK_MS = 4 * 60 * 1000;

function getCollectionRef() {
  return collection(db, SCAN_JOBS_COLLECTION);
}

function getDocRef(scanId: string) {
  return doc(db, SCAN_JOBS_COLLECTION, scanId);
}

function nowIso(): string {
  return new Date().toISOString();
}

function defaultSummary(): ScanJobSummary {
  return {
    noChange: 0,
    techChange: 0,
    contentChanged: 0,
    failed: 0,
  };
}

function normalizeSummary(summary?: Partial<ScanJobSummary>): ScanJobSummary {
  return {
    noChange: summary?.noChange ?? 0,
    techChange: summary?.techChange ?? 0,
    contentChanged: summary?.contentChanged ?? 0,
    failed: summary?.failed ?? 0,
  };
}

function docToJob(
  scanId: string,
  data: Record<string, unknown> | undefined
): ScanJob | null {
  if (!data) return null;

  return {
    scanId,
    projectId: typeof data.projectId === 'string' ? data.projectId : '',
    projectName: typeof data.projectName === 'string' ? data.projectName : '',
    status: (typeof data.status === 'string' ? data.status : 'queued') as ScanJobStatus,
    current: typeof data.current === 'number' ? data.current : 0,
    total: typeof data.total === 'number' ? data.total : 0,
    currentUrl: typeof data.currentUrl === 'string' ? data.currentUrl : '',
    startedAt: typeof data.startedAt === 'string' ? data.startedAt : nowIso(),
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : nowIso(),
    scanCollections: Boolean(data.scanCollections),
    captureScreenshots: data.captureScreenshots !== false,
    targetLinkIds: Array.isArray(data.targetLinkIds)
      ? data.targetLinkIds.filter((value): value is string => typeof value === 'string')
      : [],
    completedLinkIds: Array.isArray(data.completedLinkIds)
      ? data.completedLinkIds.filter((value): value is string => typeof value === 'string')
      : [],
    summary: normalizeSummary(data.summary as Partial<ScanJobSummary> | undefined),
    completedAt: typeof data.completedAt === 'string' ? data.completedAt : undefined,
    error: typeof data.error === 'string' ? data.error : undefined,
    cancelRequested: data.cancelRequested === true,
    processingStartedAt: typeof data.processingStartedAt === 'string' ? data.processingStartedAt : undefined,
  };
}

function isActiveScanJob(job: ScanJob): boolean {
  return ACTIVE_SCAN_JOB_STATUSES.includes(job.status);
}

function isProcessingExpired(job: ScanJob): boolean {
  if (!job.processingStartedAt) return true;

  const startedAt = new Date(job.processingStartedAt).getTime();
  if (!Number.isFinite(startedAt)) return true;

  return Date.now() - startedAt > PROCESSING_LOCK_MS;
}

function updateSummaryForChange(summary: ScanJobSummary, changeStatus: ChangeStatus): ScanJobSummary {
  const next = { ...summary };

  if (changeStatus === 'NO_CHANGE') next.noChange += 1;
  else if (changeStatus === 'TECH_CHANGE_ONLY') next.techChange += 1;
  else if (changeStatus === 'CONTENT_CHANGED') next.contentChanged += 1;
  else if (changeStatus === 'SCAN_FAILED') next.failed += 1;

  return next;
}

function removeUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => removeUndefined(item)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (value !== undefined) {
        result[key] = removeUndefined(value);
      }
    }
    return result as T;
  }
  return obj;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function getSuccessfulScanCount(job: Pick<ScanJob, 'current' | 'summary'>): number {
  return Math.max(0, job.current - job.summary.failed);
}

async function updateJobDocument(scanId: string, updates: Record<string, unknown>): Promise<void> {
  await setDoc(getDocRef(scanId), updates, { merge: true });
}

async function claimScanJob(scanId: string): Promise<ScanJob | null> {
  const ref = getDocRef(scanId);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return null;

    const job = docToJob(snapshot.id, snapshot.data());
    if (!job || !isActiveScanJob(job)) return null;
    if (job.cancelRequested || job.status === 'cancelled') return null;
    if (job.processingStartedAt && !isProcessingExpired(job)) return null;

    const updatedAt = nowIso();
    const claimedJob: ScanJob = {
      ...job,
      status: 'running',
      processingStartedAt: updatedAt,
      updatedAt,
      error: undefined,
    };

    transaction.set(ref, {
      status: claimedJob.status,
      processingStartedAt: claimedJob.processingStartedAt,
      updatedAt: claimedJob.updatedAt,
      error: null,
    }, { merge: true });

    return claimedJob;
  });
}

async function heartbeatScanJob(scanId: string, currentUrl: string): Promise<void> {
  const updatedAt = nowIso();
  await updateJobDocument(scanId, {
    status: 'running',
    currentUrl,
    processingStartedAt: updatedAt,
    updatedAt,
  });
}

async function recordCompletedLinks(
  scanId: string,
  linkIds: string[],
  summary: ScanJobSummary
): Promise<ScanJob | null> {
  if (linkIds.length === 0) return getScanJob(scanId);

  const ref = getDocRef(scanId);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return null;

    const job = docToJob(snapshot.id, snapshot.data());
    if (!job) return null;

    const completedLinkIds = [...job.completedLinkIds];
    for (const linkId of linkIds) {
      if (!completedLinkIds.includes(linkId)) {
        completedLinkIds.push(linkId);
      }
    }

    const current = Math.min(completedLinkIds.length, job.total);
    const updatedAt = nowIso();

    const nextJob: ScanJob = {
      ...job,
      completedLinkIds,
      current,
      currentUrl: '',
      summary,
      updatedAt,
      processingStartedAt: updatedAt,
      status: job.status === 'cancelled' ? 'cancelled' : job.status,
    };

    transaction.set(ref, {
      completedLinkIds: nextJob.completedLinkIds,
      current: nextJob.current,
      currentUrl: '',
      summary: nextJob.summary,
      updatedAt: nextJob.updatedAt,
      processingStartedAt: nextJob.processingStartedAt,
    }, { merge: true });

    return nextJob;
  });
}

async function releaseScanJobAfterBatch(
  scanId: string,
  summary: ScanJobSummary
): Promise<ScanJob | null> {
  const ref = getDocRef(scanId);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return null;

    const job = docToJob(snapshot.id, snapshot.data());
    if (!job) return null;

    const current = Math.min(job.completedLinkIds.length, job.total);
    const updatedAt = nowIso();
    const isCompleted = current >= job.total;
    const isCancelled = job.cancelRequested || job.status === 'cancelled';

    const nextJob: ScanJob = {
      ...job,
      current,
      currentUrl: '',
      summary,
      updatedAt,
      processingStartedAt: undefined,
      status: isCancelled ? 'cancelled' : isCompleted ? 'completed' : 'running',
      completedAt: isCancelled || isCompleted ? updatedAt : job.completedAt,
    };

    transaction.set(ref, removeUndefined({
      current: nextJob.current,
      currentUrl: nextJob.currentUrl,
      summary: nextJob.summary,
      updatedAt: nextJob.updatedAt,
      processingStartedAt: null,
      status: nextJob.status,
      completedAt: nextJob.completedAt,
    }), { merge: true });

    return nextJob;
  });
}

async function markScanJobFailed(scanId: string, error: string): Promise<void> {
  const updatedAt = nowIso();
  await updateJobDocument(scanId, {
    status: 'failed',
    error,
    updatedAt,
    completedAt: updatedAt,
    currentUrl: '',
    processingStartedAt: null,
  });
}

function sortJobsByStartedAtDesc(jobs: ScanJob[]): ScanJob[] {
  return [...jobs].sort((a, b) => {
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });
}

export function generateScanJobId(): string {
  return `scan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function calculateScanPercentage(job: Pick<ScanJob, 'current' | 'total'>): number {
  return job.total > 0 ? Math.round((job.current / job.total) * 100) : 0;
}

export function shouldKickScanJob(job: ScanJob): boolean {
  if (job.status === 'queued') return true;
  if (job.status !== 'running') return false;
  return !job.processingStartedAt || isProcessingExpired(job);
}

export async function getScanJob(scanId: string): Promise<ScanJob | null> {
  const snapshot = await getDoc(getDocRef(scanId));
  if (!snapshot.exists()) return null;
  return docToJob(snapshot.id, snapshot.data());
}

export async function createScanJob(input: CreateScanJobInput): Promise<ScanJob> {
  const startedAt = nowIso();
  const scanId = generateScanJobId();
  const job: ScanJob = {
    scanId,
    projectId: input.project.id,
    projectName: input.project.name,
    status: 'queued',
    current: 0,
    total: input.linksToScan.length,
    currentUrl: '',
    startedAt,
    updatedAt: startedAt,
    scanCollections: input.scanCollections,
    captureScreenshots: input.captureScreenshots,
    targetLinkIds: input.linksToScan.map((link) => link.id),
    completedLinkIds: [],
    summary: defaultSummary(),
  };

  await setDoc(getDocRef(scanId), job);
  return job;
}

export async function getActiveScanJobsForProject(projectId: string): Promise<ScanJob[]> {
  const snapshot = await getDocs(query(
    getCollectionRef(),
    where('projectId', '==', projectId),
    limit(25)
  ));

  const jobs = snapshot.docs
    .map((docSnap) => docToJob(docSnap.id, docSnap.data()))
    .filter((job): job is ScanJob => Boolean(job))
    .filter(isActiveScanJob);

  return sortJobsByStartedAtDesc(jobs);
}

export async function getAllActiveScanJobs(): Promise<ScanJob[]> {
  const [queuedSnapshot, runningSnapshot] = await Promise.all([
    getDocs(query(getCollectionRef(), where('status', '==', 'queued'), limit(50))),
    getDocs(query(getCollectionRef(), where('status', '==', 'running'), limit(50))),
  ]);

  const jobs = [...queuedSnapshot.docs, ...runningSnapshot.docs]
    .map((docSnap) => docToJob(docSnap.id, docSnap.data()))
    .filter((job): job is ScanJob => Boolean(job));

  return sortJobsByStartedAtDesc(jobs);
}

export async function getRunnableScanJobs(limitCount: number = 10): Promise<ScanJob[]> {
  const jobs = await getAllActiveScanJobs();
  return jobs.filter(shouldKickScanJob).slice(0, limitCount);
}

export async function cancelScanJob(scanId: string): Promise<ScanJob | null> {
  const ref = getDocRef(scanId);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return null;

    const job = docToJob(snapshot.id, snapshot.data());
    if (!job) return null;
    if (!isActiveScanJob(job)) return job;

    const updatedAt = nowIso();
    const cancelledJob: ScanJob = {
      ...job,
      status: 'cancelled',
      cancelRequested: true,
      updatedAt,
      completedAt: updatedAt,
      currentUrl: '',
      processingStartedAt: undefined,
    };

    transaction.set(ref, {
      status: cancelledJob.status,
      cancelRequested: true,
      updatedAt: cancelledJob.updatedAt,
      completedAt: cancelledJob.completedAt,
      currentUrl: '',
      processingStartedAt: null,
    }, { merge: true });

    return cancelledJob;
  });
}

export async function processScanJobBatch(scanId: string): Promise<ProcessScanJobBatchResult> {
  const claimedJob = await claimScanJob(scanId);
  if (!claimedJob) {
    const job = await getScanJob(scanId);
    return {
      scanId,
      status: job?.status || 'skipped',
      current: job?.current || 0,
      total: job?.total || 0,
    };
  }

  try {
    const project = await projectsService.getProject(claimedJob.projectId);
    if (!project) {
      throw new Error(`Project not found: ${claimedJob.projectId}`);
    }

    let projectLinks = [...project.links];
    let summary = normalizeSummary(claimedJob.summary);
    let shouldPersistProjectLinks = false;
    const completedBatchLinkIds: string[] = [];
    const remainingTargetIds = claimedJob.targetLinkIds
      .filter((linkId) => !claimedJob.completedLinkIds.includes(linkId))
      .slice(0, PAGES_PER_BATCH);

    if (remainingTargetIds.length === 0) {
      const finalJob = await releaseScanJobAfterBatch(scanId, summary);
      if (finalJob?.status === 'completed') {
        await ensureScanNotificationQueued({
          scanId: finalJob.scanId,
          projectId: finalJob.projectId,
          projectName: finalJob.projectName,
          scannedPages: getSuccessfulScanCount(finalJob),
          totalPages: finalJob.total,
          summary: finalJob.summary,
        });
      }

      return {
        scanId,
        status: finalJob?.status || 'completed',
        current: finalJob?.current || claimedJob.current,
        total: finalJob?.total || claimedJob.total,
      };
    }

    // Check for cancellation once at batch start
    await heartbeatScanJob(scanId, '');

    // Process pages in parallel with concurrency limit
    const processPage = async (linkId: string) => {
      const linkIndex = projectLinks.findIndex((link) => link.id === linkId);
      const link = linkIndex >= 0 ? projectLinks[linkIndex] : null;

      if (!link) {
        return { linkId, status: 'SCAN_FAILED' as ChangeStatus };
      }

      try {
        const { changeStatus, updatedLink, pendingWrite } = await scanSinglePage(
          project.id,
          link,
          claimedJob.captureScreenshots
        );
        projectLinks[linkIndex] = updatedLink;
        shouldPersistProjectLinks = true;

        // Save audit log and changelog in parallel
        const writePromises: Promise<unknown>[] = [];
        if (pendingWrite.auditLog) {
          writePromises.push(AuditService.saveAuditLog(pendingWrite.auditLog));
        }
        if (pendingWrite.changeLogEntry) {
          writePromises.push(changeLogService.saveEntry(pendingWrite.changeLogEntry));
        }
        if (writePromises.length > 0) {
          await Promise.all(writePromises);
        }

        return { linkId, status: changeStatus };
      } catch (error) {
        console.error(`[scan-jobs] Failed to scan ${link.url}:`, error);

        const failedAt = nowIso();
        const existingAudit = projectLinks[linkIndex]?.auditResult;
        if (existingAudit) {
          const failedAudit: AuditResult = {
            ...existingAudit,
            changeStatus: 'SCAN_FAILED',
            lastRun: failedAt,
            summary: `Scan failed: ${getErrorMessage(error)}`,
          };

          projectLinks[linkIndex] = {
            ...projectLinks[linkIndex],
            auditResult: compactAuditResult(failedAudit),
          };
          shouldPersistProjectLinks = true;
        }

        return { linkId, status: 'SCAN_FAILED' as ChangeStatus };
      }
    };

    // Run in parallel chunks of PARALLEL_CONCURRENCY
    for (let i = 0; i < remainingTargetIds.length; i += PARALLEL_CONCURRENCY) {
      // Check cancellation between chunks
      if (i > 0) {
        const latestJob = await getScanJob(scanId);
        if (!latestJob || latestJob.status === 'cancelled' || latestJob.cancelRequested) {
          if (shouldPersistProjectLinks) {
            await projectsService.updateProjectLinks(project.id, projectLinks);
          }
          if (completedBatchLinkIds.length > 0) {
            await recordCompletedLinks(scanId, completedBatchLinkIds, summary);
          }
          const cancelledJob = await releaseScanJobAfterBatch(scanId, summary);
          return {
            scanId,
            status: cancelledJob?.status || 'cancelled',
            current: cancelledJob?.current || 0,
            total: cancelledJob?.total || claimedJob.total,
          };
        }
        await heartbeatScanJob(scanId, `batch chunk ${i}/${remainingTargetIds.length}`);
      }

      const chunk = remainingTargetIds.slice(i, i + PARALLEL_CONCURRENCY);
      const results = await Promise.allSettled(chunk.map(processPage));

      for (const result of results) {
        if (result.status === 'fulfilled') {
          completedBatchLinkIds.push(result.value.linkId);
          summary = updateSummaryForChange(summary, result.value.status);
        } else {
          summary = { ...summary, failed: summary.failed + 1 };
        }
      }
    }

    if (shouldPersistProjectLinks) {
      await projectsService.updateProjectLinks(project.id, projectLinks);
    }
    if (completedBatchLinkIds.length > 0) {
      await recordCompletedLinks(scanId, completedBatchLinkIds, summary);
    }

    const finalJob = await releaseScanJobAfterBatch(scanId, summary);

    if (finalJob?.status === 'completed') {
      await ensureScanNotificationQueued({
        scanId: finalJob.scanId,
        projectId: finalJob.projectId,
        projectName: finalJob.projectName,
        scannedPages: getSuccessfulScanCount(finalJob),
        totalPages: finalJob.total,
        summary: finalJob.summary,
      });
    }

    return {
      scanId,
      status: finalJob?.status || 'running',
      current: finalJob?.current || 0,
      total: finalJob?.total || claimedJob.total,
    };
  } catch (error) {
    const message = getErrorMessage(error);
    await markScanJobFailed(scanId, message);

    const failedJob = await getScanJob(scanId);
    return {
      scanId,
      status: 'failed',
      current: failedJob?.current || 0,
      total: failedJob?.total || 0,
      error: message,
    };
  }
}

async function scanSinglePage(
  projectId: string,
  link: ProjectLink,
  captureScreenshots: boolean
): Promise<{ score: number; changeStatus: ChangeStatus; updatedLink: ProjectLink; pendingWrite: PendingWrite }> {
  const prevResult = link.auditResult;

  // Prefetch changelog history and audit log in parallel with page scan
  const [scanResult, latestChangeLog, prevAuditLog] = await Promise.all([
    pageScanner.scan(link.url),
    changeLogService.getLatestEntry(link.id),
    prevResult ? AuditService.getLatestAuditLog(projectId, link.id) : Promise.resolve(null),
  ]);

  const changeStatus = computeChangeStatus(
    scanResult.fullHash,
    scanResult.contentHash,
    prevResult?.fullHash,
    prevResult?.contentHash
  );

  let diffPatch: string | undefined;
  let fieldChanges: FieldChange[] = [];
  let diffSummary: string | undefined;

  if (changeStatus === 'CONTENT_CHANGED' || changeStatus === 'TECH_CHANGE_ONLY') {
    try {
      if (changeStatus === 'CONTENT_CHANGED' && prevAuditLog?.htmlSource) {
        diffPatch = generateDiffPatch(prevAuditLog.htmlSource, scanResult.htmlSource || '') || undefined;

        const bodyDiff = computeBodyTextDiff(prevAuditLog.htmlSource, scanResult.htmlSource);
        const prevSnapshot = prevResult?.contentSnapshot;
        if (prevSnapshot) {
          fieldChanges = computeFieldChanges(scanResult.contentSnapshot, prevSnapshot);

          if (bodyDiff) {
            fieldChanges = fieldChanges.filter((change) => change.field !== 'bodyText');
            fieldChanges.push(bodyDiff);
          }

          if (fieldChanges.length > 0) {
            diffSummary = fieldChanges.map((change) =>
              `${change.changeType === 'modified' ? 'Updated' : change.changeType === 'added' ? 'Added' : 'Removed'} ${change.field}`
            ).join(', ');
          }
        }
      }
    } catch (error) {
      console.error('[scan-jobs] Error generating diff/changes:', error);
    }
  }

  const lastRunTimestamp = nowIso();
  const isFirstScan = !prevResult;
  const hasNoScreenshot = !prevResult?.screenshotUrl && !prevResult?.screenshot;
  const shouldCaptureScreenshot =
    captureScreenshots && (isFirstScan || hasNoScreenshot || changeStatus === 'CONTENT_CHANGED');
  const storedScreenshotUrl = prevResult?.screenshotUrl || prevResult?.screenshot;

  let screenshotUrl: string | undefined;
  let previousScreenshotUrl: string | undefined;

  if (shouldCaptureScreenshot) {
    try {
      const screenshotService = getScreenshotService();
      const screenshotResult = await screenshotService.captureScreenshot(link.url, {
        width: 1280,
        height: 800,
      });

      screenshotUrl = await uploadScreenshot(
        projectId,
        link.id,
        screenshotResult.screenshot,
        lastRunTimestamp
      );

      if (!isFirstScan && storedScreenshotUrl) {
        previousScreenshotUrl = storedScreenshotUrl;
      }
    } catch (error) {
      console.warn(`[scan-jobs] Screenshot capture/upload failed for ${link.url}:`, error);
    }
  } else {
    screenshotUrl = storedScreenshotUrl;
    previousScreenshotUrl = prevResult?.previousScreenshotUrl;
  }

  const auditResult = removeUndefined({
    score: scanResult.score,
    summary: diffSummary || (changeStatus === 'NO_CHANGE' ? 'No changes detected.' : 'Changes detected.'),
    canDeploy: scanResult.canDeploy,
    fullHash: scanResult.fullHash,
    contentHash: scanResult.contentHash,
    changeStatus,
    lastRun: lastRunTimestamp,
    contentSnapshot: scanResult.contentSnapshot,
    categories: scanResult.categories,
    screenshotUrl,
    previousScreenshotUrl,
    screenshotCapturedAt: screenshotUrl ? lastRunTimestamp : undefined,
  });

  const updatedLink: ProjectLink = {
    ...link,
    title: scanResult.contentSnapshot.title || link.title,
    auditResult: compactAuditResult(auditResult),
  };

  const pendingWrite: PendingWrite = {};

  if (changeStatus !== 'NO_CHANGE') {
    const auditLogData: AuditLogEntry = {
      projectId,
      linkId: link.id,
      url: link.url,
      timestamp: lastRunTimestamp,
      fullHash: scanResult.fullHash,
      contentHash: scanResult.contentHash,
      htmlSource: scanResult.htmlSource,
    };
    if (diffPatch) auditLogData.diffPatch = diffPatch;
    if (shouldCaptureScreenshot && screenshotUrl) {
      auditLogData.screenshotUrl = screenshotUrl;
    }

    pendingWrite.auditLog = auditLogData;
  }

  const hasHistory = !!latestChangeLog;

  if ((changeStatus !== 'NO_CHANGE' && changeStatus !== 'SCAN_FAILED') || !hasHistory) {
    const entryType: 'FIRST_SCAN' | 'CONTENT_CHANGED' | 'TECH_CHANGE_ONLY' = !hasHistory
      ? 'FIRST_SCAN'
      : (changeStatus as 'CONTENT_CHANGED' | 'TECH_CHANGE_ONLY');

    pendingWrite.changeLogEntry = removeUndefined<Omit<ChangeLogEntry, 'id'>>({
      projectId,
      linkId: link.id,
      url: link.url,
      timestamp: lastRunTimestamp,
      changeType: entryType,
      fieldChanges,
      summary: diffSummary || (entryType === 'FIRST_SCAN' ? 'Initial history snapshot' : 'Changes detected'),
      contentSnapshot: scanResult.contentSnapshot,
      fullHash: scanResult.fullHash,
      contentHash: scanResult.contentHash,
      auditScore: scanResult.score,
    });
  }

  return { score: scanResult.score, changeStatus, updatedLink, pendingWrite };
}
