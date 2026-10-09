import 'server-only';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { getBaseUrl } from '@/lib/base-url';
import { isTeamMember } from '@/lib/team';
import {
  devWorkOutstanding,
  resolveDevOwnerEmail,
  shouldSendDevNudge,
} from '@/modules/delivery/domain/delivery.dev';
import type { ChecklistSection, Project, ProjectStatus } from '@/types';
import type { ProjectPage } from '@/modules/delivery/domain/delivery.types';

export interface DevNudgeCandidate {
  projectId: string;
  projectName: string;
  devEmail: string;
  deliveryUrl: string;
  daysSinceActivity: number | null;
}

export async function gatherDevDeliveryNudges(now = new Date()): Promise<DevNudgeCandidate[] | null> {
  if (!hasFirebaseAdminCredentials) return null;

  const baseUrl = getBaseUrl();
  const [projectSnap, checklistSnap, pageSnaps] = await Promise.all([
    adminDb.collection(COLLECTIONS.PROJECTS).limit(400).get(),
    adminDb.collection(COLLECTIONS.PROJECT_CHECKLISTS).limit(800).get(),
    adminDb.collectionGroup(COLLECTIONS.PROJECT_PAGES).limit(5000).get(),
  ]);

  const sectionsByProject = new Map<string, ChecklistSection[]>();
  for (const doc of checklistSnap.docs) {
    const data = doc.data() as { projectId?: string; sections?: ChecklistSection[] };
    if (!data.projectId) continue;
    sectionsByProject.set(data.projectId, [
      ...(sectionsByProject.get(data.projectId) ?? []),
      ...(data.sections ?? []),
    ]);
  }

  const pagesByProject = new Map<string, ProjectPage[]>();
  for (const doc of pageSnaps.docs) {
    const projectId = doc.ref.parent.parent?.id;
    if (!projectId) continue;
    pagesByProject.set(projectId, [
      ...(pagesByProject.get(projectId) ?? []),
      { ...(doc.data() as ProjectPage), id: doc.id },
    ]);
  }

  const dormant = new Set<ProjectStatus>(['closed', 'paid', 'paused']);
  const out: DevNudgeCandidate[] = [];

  for (const doc of projectSnap.docs) {
    const data = doc.data() as Project;
    const status = (data.status ?? 'current') as ProjectStatus;
    if (dormant.has(status)) continue;

    const sections = sectionsByProject.get(doc.id) ?? [];
    const pages = pagesByProject.get(doc.id) ?? [];
    if (!devWorkOutstanding(pages, sections)) continue;

    const devEmail = resolveDevOwnerEmail(data, pages, sections);
    if (!devEmail || !isTeamMember(devEmail)) continue;

    const lastActivity = data.delivery?.lastDevActivityAt ?? data.clientFacing?.lastUpdateAt;
    const lastNudge = data.delivery?.lastDevNudgeAt;

    if (!shouldSendDevNudge(lastNudge, lastActivity, now)) continue;

    out.push({
      projectId: doc.id,
      projectName: data.name ?? 'Untitled project',
      devEmail,
      deliveryUrl: `${baseUrl}/modules/project-links/${doc.id}?tab=delivery`,
      daysSinceActivity: lastActivity ? Math.floor((now.getTime() - Date.parse(lastActivity)) / 86_400_000) : null,
    });
  }

  return out;
}

export async function markDevNudgeSent(projectId: string, at = new Date()): Promise<void> {
  await adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId).update({
    'delivery.lastDevNudgeAt': at.toISOString(),
  });
}
