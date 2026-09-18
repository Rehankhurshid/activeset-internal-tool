import 'server-only';
import { db as adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { PortalAuthError, verifyPortalToken } from '@/lib/client-portal-tokens';
import { buildClientPortalView } from '@/modules/client-portal/domain/client-portal.projection';
import type { ClientPortalView } from '@/modules/client-portal/domain/client-portal.types';
import type { ClientUpdate, Project, ProjectTimeline, Task } from '@/types';

/**
 * Server-side loader for the portal page: token → project + timeline + asks →
 * allow-listed view. Everything is read with firebase-admin; the page never
 * touches Firestore from the browser. The loader is strictly read-only: usage
 * is stamped by the view beacon, which knows the open is a real, counted one.
 */

export interface LoadedClientPortal {
  view: ClientPortalView;
  projectId: string;
  tokenHash: string;
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(0);
}

function toProject(id: string, data: Record<string, unknown>): Project {
  // The projection only reads allow-listed fields, so a shallow cast is enough;
  // dates are normalised because the Project type promises Date instances.
  return {
    ...(data as unknown as Project),
    id,
    links: Array.isArray(data.links) ? (data.links as Project['links']) : [],
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function toTimeline(projectId: string, data: Record<string, unknown> | undefined): ProjectTimeline | null {
  if (!data) return null;
  return {
    id: projectId,
    projectId,
    phases: Array.isArray(data.phases) ? (data.phases as ProjectTimeline['phases']) : [],
    milestones: Array.isArray(data.milestones) ? (data.milestones as ProjectTimeline['milestones']) : [],
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function toTask(id: string, data: Record<string, unknown>): Task {
  return {
    ...(data as unknown as Task),
    id,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/**
 * Returns null for any token that must not resolve (unknown, revoked, expired,
 * portal disabled) and rethrows infrastructure failures, so the page can show
 * "no longer active" vs "temporarily unavailable" correctly.
 */
export async function loadClientPortalByToken(token: unknown): Promise<LoadedClientPortal | null> {
  let verified;
  try {
    verified = await verifyPortalToken(token);
  } catch (err) {
    if (err instanceof PortalAuthError && err.status === 404) return null;
    throw err;
  }

  const { projectId, tokenHash, project: raw } = verified;
  const projectDoc = adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId);
  const [timelineSnap, asksSnap, updatesSnap] = await Promise.all([
    adminDb.collection(COLLECTIONS.PROJECT_TIMELINES).doc(projectId).get(),
    adminDb
      .collection(COLLECTIONS.TASKS)
      .where('projectId', '==', projectId)
      .where('needsClientInput', '==', true)
      // No small cap: the flag is never cleared on completed tasks, so the open
      // ones must not be pushed out of a page by finished ones. The status
      // filter happens in the projection.
      .limit(500)
      .get(),
    // Single-field orderBy on a subcollection: no composite index needed.
    projectDoc.collection(COLLECTIONS.CLIENT_UPDATES).orderBy('postedAt', 'desc').limit(20).get(),
  ]);

  const project = toProject(projectId, raw);
  const timeline = toTimeline(projectId, timelineSnap.exists ? (timelineSnap.data() as Record<string, unknown>) : undefined);
  const tasks = asksSnap.docs.map((d) => toTask(d.id, d.data() as Record<string, unknown>));
  const updates = updatesSnap.docs.map((d) => ({ ...(d.data() as ClientUpdate), id: d.id }));

  return {
    view: buildClientPortalView({ project, timeline, tasks, updates }),
    projectId,
    tokenHash,
  };
}
