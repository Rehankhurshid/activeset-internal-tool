/**
 * In-memory progress store for bulk scan operations
 * Tracks scan progress keyed by scanId for polling-based progress updates
 */

export interface ScanProgress {
  scanId: string;
  projectId: string;
  status: 'running' | 'completed' | 'failed';
  current: number;
  total: number;
  currentUrl: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
  summary?: {
    noChange: number;
    techChange: number;
    contentChanged: number;
    failed: number;
  };
}

// In-memory store - Map keyed by scanId
const progressStore = new Map<string, ScanProgress>();

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
export function initScanProgress(scanId: string, projectId: string, total: number): ScanProgress {
  const progress: ScanProgress = {
    scanId,
    projectId,
    status: 'running',
    current: 0,
    total,
    currentUrl: '',
    startedAt: new Date().toISOString(),
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
  
  const updated = { ...progress, ...updates };
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
