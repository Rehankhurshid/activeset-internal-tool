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
import { loadProjectAdmin } from '@/services/ScanJobService';
import { generateHealthReport } from '@/services/HealthReportGenerator';
import { sendAlertNotifications, sendScanCompletionNotification } from '@/services/NotificationService';
import { detectAnomalies } from '@/services/AnomalyDetector';
import { alertService } from '@/services/AlertService';
import { linksScannedSince, previousLinksFrom } from '@/lib/audit-previous';

export interface ScanNotificationSummary {
  noChange: number;
  techChange: number;
  contentChanged: number;
  failed: number;
}

export interface ScanNotificationJob {
  scanId: string;
  projectId: string;
  projectName: string;
  scannedPages: number;
  totalPages: number;
  summary: ScanNotificationSummary;
  /** When the scan job started; anomaly detection only looks at pages scanned since. */
  startedAt?: string;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  attempts: number;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  lastAttemptAt?: string;
  processingStartedAt?: string;
  error?: string;
}

interface QueueScanNotificationInput {
  scanId: string;
  projectId: string;
  projectName?: string;
  scannedPages: number;
  totalPages: number;
  summary?: Partial<ScanNotificationSummary>;
  startedAt?: string;
}

interface ProcessScanNotificationResult {
  scanId: string;
  status: 'sent' | 'failed' | 'skipped';
  error?: string;
}

const SCAN_NOTIFICATIONS_COLLECTION = COLLECTIONS.SCAN_NOTIFICATIONS;
const PROCESSING_LOCK_MS = 2 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 10;

function getCollectionRef() {
  return collection(db, SCAN_NOTIFICATIONS_COLLECTION);
}

function getDocRef(scanId: string) {
  return doc(db, SCAN_NOTIFICATIONS_COLLECTION, scanId);
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeSummary(summary?: Partial<ScanNotificationSummary>): ScanNotificationSummary {
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
): ScanNotificationJob | null {
  if (!data) return null;

  return {
    scanId,
    projectId: typeof data.projectId === 'string' ? data.projectId : '',
    projectName: typeof data.projectName === 'string' ? data.projectName : '',
    scannedPages: typeof data.scannedPages === 'number' ? data.scannedPages : 0,
    totalPages: typeof data.totalPages === 'number' ? data.totalPages : 0,
    summary: normalizeSummary(data.summary as Partial<ScanNotificationSummary> | undefined),
    status: (typeof data.status === 'string' ? data.status : 'pending') as ScanNotificationJob['status'],
    attempts: typeof data.attempts === 'number' ? data.attempts : 0,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : nowIso(),
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : nowIso(),
    sentAt: typeof data.sentAt === 'string' ? data.sentAt : undefined,
    lastAttemptAt: typeof data.lastAttemptAt === 'string' ? data.lastAttemptAt : undefined,
    processingStartedAt: typeof data.processingStartedAt === 'string' ? data.processingStartedAt : undefined,
    error: typeof data.error === 'string' ? data.error : undefined,
  };
}

function isProcessingLockExpired(job: ScanNotificationJob): boolean {
  if (job.status !== 'processing' || !job.processingStartedAt) return false;

  const startedAt = new Date(job.processingStartedAt).getTime();
  if (!Number.isFinite(startedAt)) return true;

  return Date.now() - startedAt > PROCESSING_LOCK_MS;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
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

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || 'https://app.activeset.co';
}

async function resolveProjectName(projectId: string, fallback?: string): Promise<string> {
  if (fallback?.trim()) return fallback;

  const project = await loadProjectAdmin(projectId);
  return project?.name || projectId;
}

export async function getScanNotificationJob(scanId: string): Promise<ScanNotificationJob | null> {
  const snapshot = await getDoc(getDocRef(scanId));
  if (!snapshot.exists()) return null;
  return docToJob(snapshot.id, snapshot.data());
}

export async function ensureScanNotificationQueued(
  input: QueueScanNotificationInput
): Promise<ScanNotificationJob> {
  console.log(`[scan-notify] Queueing notification for ${input.scanId} (project: ${input.projectName})`);
  const ref = getDocRef(input.scanId);
  const existing = await getScanNotificationJob(input.scanId);
  if (existing) {
    console.log(`[scan-notify] Notification already exists for ${input.scanId} (status: ${existing.status})`);
    return existing;
  }

  const projectName = await resolveProjectName(input.projectId, input.projectName);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists()) {
      const existing = docToJob(snapshot.id, snapshot.data());
      if (existing) return existing;
    }

    const createdAt = nowIso();
    const queuedJob: ScanNotificationJob = {
      scanId: input.scanId,
      projectId: input.projectId,
      projectName,
      scannedPages: input.scannedPages,
      totalPages: input.totalPages,
      summary: normalizeSummary(input.summary),
      ...(input.startedAt ? { startedAt: input.startedAt } : {}),
      status: 'pending',
      attempts: 0,
      createdAt,
      updatedAt: createdAt,
    };

    transaction.set(ref, queuedJob);
    return queuedJob;
  });
}

async function claimQueuedScanNotification(scanId: string): Promise<ScanNotificationJob | null> {
  const ref = getDocRef(scanId);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return null;

    const job = docToJob(snapshot.id, snapshot.data());
    if (!job) return null;

    if (job.status === 'sent') return null;
    if (job.status === 'processing' && !isProcessingLockExpired(job)) return null;

    const updatedAt = nowIso();
    const claimedJob: ScanNotificationJob = {
      ...job,
      status: 'processing',
      attempts: job.attempts + 1,
      lastAttemptAt: updatedAt,
      processingStartedAt: updatedAt,
      updatedAt,
      error: undefined,
    };

    transaction.set(ref, removeUndefined({
      ...claimedJob,
      error: null,
    }));

    return claimedJob;
  });
}

async function markQueuedNotificationSent(scanId: string): Promise<void> {
  const updatedAt = nowIso();
  await setDoc(
    getDocRef(scanId),
    {
      status: 'sent',
      updatedAt,
      sentAt: updatedAt,
      processingStartedAt: null,
      error: null,
    },
    { merge: true }
  );
}

async function markQueuedNotificationFailed(scanId: string, error: string): Promise<void> {
  await setDoc(
    getDocRef(scanId),
    {
      status: 'failed',
      updatedAt: nowIso(),
      processingStartedAt: null,
      error,
    },
    { merge: true }
  );
}

async function listProcessableScanNotifications(
  batchSize: number = DEFAULT_BATCH_SIZE
): Promise<ScanNotificationJob[]> {
  // One read, not three. This drain is called on a one-minute timer as a
  // crash-recovery fallback, so at idle its queries are paid every minute to
  // find an empty queue. A single `in` over the three statuses returns the
  // same documents; the limit is widened to match the three separate caps it
  // replaces, and the slice at the end still enforces `batchSize`.
  const snapshot = await getDocs(
    query(
      getCollectionRef(),
      where('status', 'in', ['pending', 'failed', 'processing']),
      limit(batchSize * 3)
    )
  );

  const jobs = snapshot.docs
    .map((docSnap) => docToJob(docSnap.id, docSnap.data()))
    .filter((job): job is ScanNotificationJob => Boolean(job))
    .filter((job) => job.status !== 'processing' || isProcessingLockExpired(job))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const uniqueJobs = new Map<string, ScanNotificationJob>();
  for (const job of jobs) {
    if (!uniqueJobs.has(job.scanId)) {
      uniqueJobs.set(job.scanId, job);
    }
  }

  const result = Array.from(uniqueJobs.values()).slice(0, batchSize);
  console.log(`[scan-notify] Found ${result.length} processable notifications (pending/failed/expired)`);
  return result;
}

export async function processQueuedScanNotification(
  scanId: string
): Promise<ProcessScanNotificationResult> {
  console.log(`[scan-notify] Processing notification for ${scanId}`);

  const claimedJob = await claimQueuedScanNotification(scanId);
  if (!claimedJob) {
    console.log(`[scan-notify] Skipped ${scanId} — could not claim (already sent or missing)`);
    return { scanId, status: 'skipped' };
  }

  console.log(`[scan-notify] Claimed ${scanId} for project ${claimedJob.projectName} (attempt ${claimedJob.attempts})`);

  try {
    const project = await loadProjectAdmin(claimedJob.projectId);
    if (!project) {
      throw new Error(`Project not found for notification: ${claimedJob.projectId}`);
    }

    const report = generateHealthReport([project]);
    const projectHealth = report.projects[0] || null;

    // Anomalies: this scan against the one before it, for the pages this job
    // actually scanned. Runs here, at completion, so it no longer depends on a
    // cron waiting around for the scan to finish.
    try {
      const scanned = linksScannedSince(
        project.links.filter((l) => l.source === 'auto'),
        claimedJob.startedAt
      );
      const anomalies = detectAnomalies(project.id, project.name, scanned, previousLinksFrom(scanned));
      if (anomalies.length > 0) {
        console.log(`[scan-notify] ${anomalies.length} anomalies for ${project.name}`);
        await alertService.createAlerts(anomalies);
        await sendAlertNotifications(anomalies, {
          projectId: project.id,
          projectName: project.name,
          baseUrl: getBaseUrl(),
        });
      }
    } catch (error) {
      console.error(`[scan-notify] Anomaly detection failed for ${scanId}:`, error);
    }

    console.log(`[scan-notify] Sending Slack/Email for ${scanId} (project: ${project.name})`);

    await sendScanCompletionNotification(
      {
        projectId: claimedJob.projectId,
        projectName: project.name || claimedJob.projectName,
        baseUrl: getBaseUrl(),
        scannedPages: claimedJob.scannedPages,
        totalPages: claimedJob.totalPages,
        summary: claimedJob.summary,
      },
      projectHealth
    );

    console.log(`[scan-notify] Successfully sent notification for ${scanId}`);
    await markQueuedNotificationSent(scanId);
    return { scanId, status: 'sent' };
  } catch (error) {
    const message = getErrorMessage(error);
    console.error(`[scan-notify] Failed to send notification for ${scanId}:`, message);
    await markQueuedNotificationFailed(scanId, message);
    return { scanId, status: 'failed', error: message };
  }
}

export async function processPendingScanNotifications(
  batchSize: number = DEFAULT_BATCH_SIZE
): Promise<{
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  results: ProcessScanNotificationResult[];
}> {
  const jobs = await listProcessableScanNotifications(batchSize);
  const results: ProcessScanNotificationResult[] = [];

  for (const job of jobs) {
    results.push(await processQueuedScanNotification(job.scanId));
  }

  return {
    processed: results.length,
    sent: results.filter((result) => result.status === 'sent').length,
    failed: results.filter((result) => result.status === 'failed').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
    results,
  };
}
