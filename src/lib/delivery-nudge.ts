import 'server-only';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { getBaseUrl } from '@/lib/base-url';
import { isTeamMember } from '@/lib/team';
import { daysBetweenIso, todayIso } from '@/lib/review-status';
import { buildDigest, type NudgeDigest, type NudgeItem, type NudgeProject } from '@/modules/delivery/domain/delivery.nudge';
import type { ChecklistSection, ProjectStatus } from '@/types';

/**
 * Gathering the day's chasing out of Firestore.
 *
 * Reading is all this does. Who to chase and who to leave alone is decided in
 * `@/modules/delivery/domain/delivery.nudge`, which is pure and tested — the
 * rules about stopping are the part worth getting right, and they should not
 * need a database to check.
 *
 * One read per collection rather than per project. A morning job that fans out
 * a query per project is fine at ten projects and a problem at two hundred, and
 * this runs unattended where nobody will notice it getting slow.
 */

const MAX_PROJECTS = 400;
const MAX_CHECKLISTS = 800;

function toDaysOverdue(dueDate: string | undefined, today: string): number | undefined {
  if (!dueDate) return undefined;
  const day = dueDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  return daysBetweenIso(day, today);
}

/**
 * Only dated steps take part, the same rule the Slack nudge follows.
 *
 * A Webflow SOP is seventy-odd steps. Chasing the undated ones would put most
 * of a project in somebody's inbox every morning and teach them to archive it
 * unread, which costs more than the steps are worth.
 */
function stepsFor(
  sections: ChecklistSection[],
  projectId: string,
  today: string,
  baseUrl: string,
): { assignee: string; item: NudgeItem }[] {
  const out: { assignee: string; item: NudgeItem }[] = [];

  for (const section of sections ?? []) {
    for (const item of section.items ?? []) {
      if (item.status === 'completed' || item.status === 'skipped') continue;

      const assignee = item.assignee?.toLowerCase().trim();
      if (!assignee || !isTeamMember(assignee)) continue;
      if (!item.dueDate) continue;

      out.push({
        assignee,
        item: {
          title: item.title,
          source: 'step',
          stage: section.title,
          dueDate: item.dueDate,
          daysOverdue: toDaysOverdue(item.dueDate, today),
          url: `${baseUrl}/modules/project-links/${projectId}?tab=delivery`,
        },
      });
    }
  }

  return out;
}

/** Every stage settled: nothing left that is neither done nor deliberately skipped. */
function arcCompleteFrom(sections: ChecklistSection[]): boolean {
  const items = (sections ?? []).flatMap((s) => s.items ?? []);
  if (items.length === 0) return false;
  return items.every((i) => i.status === 'completed' || i.status === 'skipped');
}

export interface GatheredNudges {
  digest: NudgeDigest;
  baseUrl: string;
}

export async function gatherDeliveryNudges(now = new Date()): Promise<GatheredNudges | null> {
  if (!hasFirebaseAdminCredentials) return null;

  const today = todayIso(now);
  const baseUrl = getBaseUrl();

  const [projectSnap, checklistSnap, taskSnap] = await Promise.all([
    adminDb.collection(COLLECTIONS.PROJECTS).limit(MAX_PROJECTS).get(),
    adminDb.collection(COLLECTIONS.PROJECT_CHECKLISTS).limit(MAX_CHECKLISTS).get(),
    adminDb.collection(COLLECTIONS.TASKS).where('status', '!=', 'done').get(),
  ]);

  // Checklists and tasks bucketed by project, so each project is assembled from
  // memory rather than another round trip.
  const sectionsByProject = new Map<string, ChecklistSection[]>();
  for (const doc of checklistSnap.docs) {
    const data = doc.data() as { projectId?: string; sections?: ChecklistSection[] };
    if (!data.projectId) continue;
    sectionsByProject.set(data.projectId, [
      ...(sectionsByProject.get(data.projectId) ?? []),
      ...(data.sections ?? []),
    ]);
  }

  const tasksByProject = new Map<string, { assignee: string; item: NudgeItem }[]>();
  for (const doc of taskSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const projectId = (data.projectId as string) ?? '';
    if (!projectId) continue;

    const assignee = (data.assignee as string | undefined)?.toLowerCase().trim();
    if (!assignee || !isTeamMember(assignee)) continue;

    const dueDate = data.dueDate as string | undefined;
    // Undated tasks are left to the Slack nudge, which has a staleness rule for
    // them. Mail is a worse place for "this has been open a while".
    if (!dueDate) continue;

    tasksByProject.set(projectId, [
      ...(tasksByProject.get(projectId) ?? []),
      {
        assignee,
        item: {
          title: (data.title as string) ?? 'Untitled',
          source: 'task',
          dueDate,
          daysOverdue: toDaysOverdue(dueDate, today),
          url: (data.clickupUrl as string | undefined) ?? `${baseUrl}/modules/project-links/${projectId}?tab=tasks`,
        },
      },
    ]);
  }

  const projects: NudgeProject[] = projectSnap.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const sections = sectionsByProject.get(doc.id) ?? [];

    return {
      projectId: doc.id,
      projectName: (data.name as string) ?? 'Untitled project',
      status: ((data.status as ProjectStatus) ?? 'current'),
      arcComplete: arcCompleteFrom(sections),
      items: [
        ...stepsFor(sections, doc.id, today, baseUrl),
        ...(tasksByProject.get(doc.id) ?? []),
      ],
    };
  });

  return { digest: buildDigest(projects), baseUrl };
}
