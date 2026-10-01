import 'server-only';
import { db as adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { PortalAuthError, verifyPortalToken } from '@/lib/client-portal-tokens';
import { buildClientPortalView } from '@/modules/client-portal/domain/client-portal.projection';
import type { ClientPortalView } from '@/modules/client-portal/domain/client-portal.types';
import type { ProjectSheetRecord } from '@/modules/client-portal/domain/project-sheet.types';
import { snapshotOf } from '@/lib/project-sheet';
import { AGENCY_CLOSE, AGENCY_START, SOP_TEMPLATES } from '@/lib/sop-templates';
import type { Project, ProjectChecklist, ProjectMeeting, ProjectTimeline, SOPTemplate, Task } from '@/types';

/**
 * Server-side loader for the portal page: token → project (and its client plan)
 * + checklists + asks + the project sheet's snapshot, plus the timeline →
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

export function toTimeline(projectId: string, data: Record<string, unknown> | undefined): ProjectTimeline | null {
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

/**
 * The SOPs the checklists were made from, for the client-step labels a
 * checklist made before SOPs carried them does not have itself. Best effort: a
 * failed read costs those labels, never the client's page.
 */
export async function loadSourceTemplates(checklists: ProjectChecklist[]): Promise<Pick<SOPTemplate, 'id' | 'service' | 'sections'>[]> {
  const ids = [
    ...new Set(
      checklists.flatMap((c) => (c.templateIds?.length ? c.templateIds : c.templateId ? [c.templateId] : [])),
    ),
  ].filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length < 200);
  const builtIn = SOP_TEMPLATES.filter((t) => ids.includes(t.id));
  const custom = ids.filter((id) => !builtIn.some((t) => t.id === id)).slice(0, 10);
  if (custom.length === 0) return builtIn;
  try {
    const snaps = await adminDb.getAll(...custom.map((id) => adminDb.collection(COLLECTIONS.SOP_TEMPLATES).doc(id)));
    const found = snaps
      .filter((snap) => snap.exists)
      .map((snap) => {
        const data = snap.data() as Partial<SOPTemplate>;
        return { id: snap.id, service: data.service, sections: Array.isArray(data.sections) ? data.sections : [] };
      });
    return [...builtIn, ...found];
  } catch {
    return builtIn;
  }
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
  const [timelineSnap, asksSnap, checklistSnap, meetingSnap, sheetSnap] = await Promise.all([
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
    // The checklist the client's tracker follows, and where the stage awaiting
    // sign-off is found. Of its steps, only the ones its SOP labels for the
    // client reach the client, by that label: never an item title or a note.
    adminDb
      .collection(COLLECTIONS.PROJECT_CHECKLISTS)
      .where('projectId', '==', projectId)
      .limit(20)
      .get(),
    // Calls the team pressed Share on. Pending and hidden ones are never read
    // here, and the projection checks the status again.
    adminDb
      .collection(COLLECTIONS.PROJECTS)
      .doc(projectId)
      .collection(COLLECTIONS.PROJECT_MEETINGS)
      .where('status', '==', 'shared')
      .limit(200)
      .get(),
    // The project sheet's last snapshot. Read from Firestore, never from
    // Google: a client's page must not wait on, or fail with, the Sheets API.
    adminDb.collection(COLLECTIONS.PROJECT_SHEETS).doc(projectId).get(),
  ]);

  const project = toProject(projectId, raw);
  const timeline = toTimeline(projectId, timelineSnap.exists ? (timelineSnap.data() as Record<string, unknown>) : undefined);
  const tasks = asksSnap.docs.map((d) => toTask(d.id, d.data() as Record<string, unknown>));

  const checklists = checklistSnap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as unknown as ProjectChecklist,
  );

  const meetings = meetingSnap.docs.map((d) => ({ ...(d.data() as ProjectMeeting), id: d.id }));
  const sheet = snapshotOf(sheetSnap.exists ? (sheetSnap.data() as ProjectSheetRecord) : null);
  const templates = await loadSourceTemplates(checklists);

  return {
    view: buildClientPortalView({
      project,
      timeline,
      tasks,
      checklists,
      meetings,
      sheet,
      templates,
      agency: [AGENCY_START, AGENCY_CLOSE],
    }),
    projectId,
    tokenHash,
  };
}
