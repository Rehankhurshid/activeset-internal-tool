/**
 * In-memory progress store for bulk scan operations
 * Tracks scan progress keyed by scanId for polling-based progress updates
 */

export interface ScanProgress {
  scanId: string;
  projectId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  current: number;
  total: number;
  currentUrl: string;
  startedAt: string;
  scanCollections: boolean;
  targetLinkIds: string[];
  completedLinkIds: string[];
  completedAt?: string;
  error?: string;
  cancelRequested?: boolean; // Flag to signal cancellation to the running scan
  summary?: {
    noChange: number;
    techChange: number;
    contentChanged: number;
    failed: number;
  };
}

// Use global to persist across hot reloads in development
// In production, this is just a regular module-level Map
declare global {
  // eslint-disable-next-line no-var
  var scanProgressStore: Map<string, ScanProgress> | undefined;
}

// In-memory store - Map keyed by scanId
// Attach to global in development to survive hot reloads
const progressStore: Map<string, ScanProgress> = 
  globalThis.scanProgressStore ?? new Map<string, ScanProgress>();

// Persist to global in development
if (process.env.NODE_ENV !== 'production') {
  globalThis.scanProgressStore = progressStore;
}

// Auto-cleanup timeout (10 minutes after completion)
const CLEANUP_DELAY_MS = 10 * 60 * 1000;

/**
 * Generate a unique scan ID
 */
export function generateScanId(): string {
  return `scan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Initialize a new scan progress entry
 */
export function initScanProgress(
  scanId: string,
  projectId: string,
  total: number,
  options?: {
    scanCollections?: boolean;
    targetLinkIds?: string[];
  }
): ScanProgress {
  const progress: ScanProgress = {
    scanId,
    projectId,
    status: 'running',
    current: 0,
    total,
    currentUrl: '',
    startedAt: new Date().toISOString(),
    scanCollections: options?.scanCollections ?? false,
    targetLinkIds: options?.targetLinkIds ?? [],
    completedLinkIds: [],
  };
  
  progressStore.set(scanId, progress);
  return progress;
}

/**
 * Update scan progress for a specific scan
 */
export function updateScanProgress(
  scanId: string,
  updates: Partial<Pick<ScanProgress, 'current' | 'currentUrl' | 'status' | 'error' | 'summary' | 'completedAt'>>
): ScanProgress | null {
  const progress = progressStore.get(scanId);
  if (!progress) return null;
  
  const nextCurrent = updates.current === undefined
    ? progress.current
    : Math.max(0, Math.min(updates.current, progress.total));
  const updated = { ...progress, ...updates, current: nextCurrent };
  progressStore.set(scanId, updated);
  
  // Schedule cleanup if completed or failed
  if (updates.status === 'completed' || updates.status === 'failed') {
    updated.completedAt = new Date().toISOString();
    progressStore.set(scanId, updated);
    
    setTimeout(() => {
      progressStore.delete(scanId);
    }, CLEANUP_DELAY_MS);
  }
  
  return updated;
}

/**
 * Mark a page as completed for a scan.
 * Uses link IDs to guarantee each page contributes at most once to current progress.
 */
export function markScanPageCompleted(scanId: string, linkId: string): ScanProgress | null {
  const progress = progressStore.get(scanId);
  if (!progress) return null;

  if (!progress.completedLinkIds.includes(linkId)) {
    progress.completedLinkIds.push(linkId);
  }

  progress.current = Math.min(progress.completedLinkIds.length, progress.total);
  progressStore.set(scanId, progress);
  return progress;
}

/**
 * Get current progress for a scan
 */
export function getScanProgress(scanId: string): ScanProgress | null {
  return progressStore.get(scanId) || null;
}

/**
 * Check if a scan exists and is running
 */
export function isScanRunning(scanId: string): boolean {
  const progress = progressStore.get(scanId);
  return progress?.status === 'running';
}

/**
 * Get all running scans for a project (useful for preventing duplicate scans)
 */
export function getRunningScansForProject(projectId: string): ScanProgress[] {
  const running: ScanProgress[] = [];
  progressStore.forEach((progress) => {
    if (progress.projectId === projectId && progress.status === 'running') {
      running.push(progress);
    }
  });
  return running;
}

/**
 * Get all scans in the store (for debugging)
 */
export function getAllScans(): ScanProgress[] {
  return Array.from(progressStore.values());
}

/**
 * Request cancellation of a scan
 * The running scan should check isScanCancelled() periodically
 */
export function requestScanCancel(scanId: string): boolean {
  const progress = progressStore.get(scanId);
  if (!progress || progress.status !== 'running') {
    return false;
  }
  
  progress.cancelRequested = true;
  progressStore.set(scanId, progress);
  console.log(`[ScanProgress] Cancel requested for scan: ${scanId}`);
  return true;
}

/**
 * Check if a scan has been cancelled
 * The running scan loop should call this and stop if true
 */
export function isScanCancelled(scanId: string): boolean {
  const progress = progressStore.get(scanId);
  return progress?.cancelRequested === true;
}

/**
 * Mark a scan as cancelled (called by the scan loop when it stops)
 */
export function markScanCancelled(scanId: string): ScanProgress | null {
  const progress = progressStore.get(scanId);
  if (!progress) return null;
  
  progress.status = 'cancelled';
  progress.completedAt = new Date().toISOString();
  progressStore.set(scanId, progress);
  
  // Schedule cleanup
  setTimeout(() => {
    progressStore.delete(scanId);
  }, CLEANUP_DELAY_MS);
  
  console.log(`[ScanProgress] Scan cancelled: ${scanId}`);
  return progress;
}
