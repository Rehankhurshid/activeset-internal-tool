/**
 * "Auto-optimise new images": one hourly `library_sweep` job per project,
 * always under this id, so the cron can tell a check is still waiting and the
 * Images screen can read the last one without searching the queue.
 */
export const autoOptimiseJobId = (projectId: string) => `auto-images-${projectId}`;
