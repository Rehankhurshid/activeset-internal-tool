import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { db as adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { ensureJob } from '@/lib/worker/queue';
import { autoOptimiseJobId } from '@/modules/site-monitoring/domain/auto-optimise';
import type { Project } from '@/types';

/**
 * Hourly: for every project with "Auto-optimise new images" on, ask the worker
 * to look for images it has never seen (a `library_sweep` job).
 *
 * One job per project under a fixed id, so a worker that is off for a day
 * finds one waiting check per project, not 24. The work itself — reading
 * Webflow, describing, re-encoding — happens on the worker; this only queues.
 */

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const snapshot = await adminDb
      .collection(COLLECTIONS.PROJECTS)
      .where('autoOptimiseImages.enabled', '==', true)
      .get();

    const queued: string[] = [];
    const waiting: string[] = [];
    for (const doc of snapshot.docs) {
      const project = doc.data() as Project;
      if (!project.webflowConfig?.siteId) continue;
      const added = await ensureJob(autoOptimiseJobId(doc.id), {
        kind: 'library_sweep',
        projectId: doc.id,
        projectName: project.name,
        payload: { by: 'auto-optimise' },
        requestedBy: 'auto-optimise',
        // Behind anything a person asked for, including bulk runs.
        priority: -1,
      });
      (added ? queued : waiting).push(project.name ?? doc.id);
    }

    return NextResponse.json({ success: true, timestamp: new Date().toISOString(), queued, waiting });
  } catch (error) {
    console.error('[cron/auto-optimise] Failed:', error);
    return NextResponse.json(
      { error: 'Failed to queue auto-optimise', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
