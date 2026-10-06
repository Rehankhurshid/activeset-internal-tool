import 'server-only';

import { db as adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { loadSourceTemplates, toTimeline } from '@/lib/client-portal';
import { snapshotOf } from '@/lib/project-sheet';
import { AGENCY_CLOSE, AGENCY_START } from '@/lib/sop-templates';
import { buildClientPortalView } from '@/modules/client-portal/domain/client-portal.projection';
import type { ProjectSheetRecord } from '@/modules/client-portal/domain/project-sheet.types';
import type {
  ChecklistItem,
  ChecklistSection,
  ClientStatus,
  Project,
  ProjectChecklist,
  Task,
  TaskPriority,
  TaskStatus,
  TimelineMilestone,
  TimelinePhase,
} from '@/types';

/**
 * What a project is up to, for the menu bar app (apps/menubar): the stage the
 * client's page shows, the checklist, the Timeline, open tasks and the project
 * sheet. The stage comes from `buildClientPortalView`, the function the client
 * page itself runs, so the two can never disagree.
 *
 * Four collection-wide reads per call whatever the number of projects, plus
 * the custom SOPs behind the checklists (`loadSourceTemplates`).
 */
export interface RaycastProjectSummary {
  clientStatus?: ClientStatus;
  clientStatusNote?: string;
  /** The stage the client's page shows now, and where its stages come from. */
  stage?: { title: string; index: number; count: number; percent?: number; dueDate?: string; source: string };
  /** "What we need from you" rows on the client's page. */
  asks?: number;
  clientUpdatedAt?: string;
  openRequests?: number;
  portalViews?: number;
  portalLastViewedAt?: string;
  checklist?: {
    done: number;
    total: number;
    inProgress: number;
    next: Array<{ title: string; status: string; owner?: string; priority?: string; week?: string; section?: string }>;
  };
  milestone?: { title: string; status: string; startDate: string; endDate: string; phase?: string };
  milestones?: { done: number; total: number };
  tasks?: {
    open: number;
    blocked: number;
    urgent: number;
    overdue: number;
    top: Array<{
      id: string;
      title: string;
      status: TaskStatus;
      priority: TaskPriority;
      dueDate?: string;
      assignee?: string;
      clickupUrl?: string;
    }>;
  };
  sheetUrl?: string;
  sheetTitle?: string;
  owner?: string;
  assignees?: string[];
  services?: string[];
}

const OPEN_TASK_STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'blocked'];
const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const TOP_TASKS = 8;
const NEXT_STEPS = 3;

type TaskRow = {
  id: string;
  projectId?: string;
  needsClientInput?: boolean;
  title?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string;
  assignee?: string;
  clickupUrl?: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function byOrder<T extends { order?: number }>(a: T, b: T): number {
  return (a.order ?? 0) - (b.order ?? 0);
}

function summarizeChecklists(docs: Array<{ sections?: ChecklistSection[] }>): RaycastProjectSummary['checklist'] {
  let done = 0;
  let total = 0;
  let inProgress = 0;
  const open: Array<{ item: ChecklistItem; section: string }> = [];
  for (const doc of docs) {
    for (const section of [...(doc.sections ?? [])].sort(byOrder)) {
      for (const item of [...(section.items ?? [])].sort(byOrder)) {
        if (item.status === 'skipped') continue;
        total += 1;
        if (item.status === 'completed') done += 1;
        else {
          if (item.status === 'in_progress') inProgress += 1;
          open.push({ item, section: section.title });
        }
      }
    }
  }
  if (total === 0) return undefined;
  // Steps already under way first, then in checklist order.
  const next = [...open]
    .sort((a, b) => Number(b.item.status === 'in_progress') - Number(a.item.status === 'in_progress'))
    .slice(0, NEXT_STEPS)
    .map(({ item, section }) => ({
      title: item.title,
      status: item.status,
      owner: item.owner,
      priority: item.priority,
      week: item.week,
      section,
    }));
  return { done, total, inProgress, next };
}

function summarizeTimeline(doc: { phases?: TimelinePhase[]; milestones?: TimelineMilestone[] } | undefined) {
  const milestones = doc?.milestones ?? [];
  if (milestones.length === 0) return {};
  const phases = new Map((doc?.phases ?? []).map((p) => [p.id, p.title]));
  const open = milestones
    .filter((m) => m.status !== 'completed')
    .sort((a, b) => {
      const active = Number(b.status === 'in_progress') - Number(a.status === 'in_progress');
      return active || (a.startDate ?? '').localeCompare(b.startDate ?? '') || byOrder(a, b);
    });
  const next = open[0];
  return {
    milestones: { done: milestones.length - open.length, total: milestones.length },
    milestone: next
      ? {
          title: next.title,
          status: next.status,
          startDate: next.startDate,
          endDate: next.endDate,
          phase: next.phaseId ? phases.get(next.phaseId) : undefined,
        }
      : undefined,
  };
}

function summarizeTasks(rows: TaskRow[]): RaycastProjectSummary['tasks'] {
  if (rows.length === 0) return undefined;
  const today = todayIso();
  const sorted = [...rows].sort((a, b) => {
    const blocked = Number(b.status === 'blocked') - Number(a.status === 'blocked');
    if (blocked) return blocked;
    const pri = PRIORITY_RANK[a.priority ?? 'medium'] - PRIORITY_RANK[b.priority ?? 'medium'];
    if (pri) return pri;
    return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
  });
  return {
    open: rows.length,
    blocked: rows.filter((t) => t.status === 'blocked').length,
    urgent: rows.filter((t) => t.priority === 'urgent' || t.priority === 'high').length,
    overdue: rows.filter((t) => t.dueDate && t.dueDate < today).length,
    top: sorted.slice(0, TOP_TASKS).map((t) => ({
      id: t.id,
      title: t.title ?? 'Untitled task',
      status: t.status ?? 'todo',
      priority: t.priority ?? 'medium',
      dueDate: t.dueDate,
      assignee: t.assignee,
      clickupUrl: t.clickupUrl,
    })),
  };
}

function groupBy<T>(rows: T[], key: (row: T) => string | undefined): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (!k) continue;
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

export async function loadRaycastProjectSummaries(projects: Project[]): Promise<Map<string, RaycastProjectSummary>> {
  const [taskSnap, checklistSnap, timelineSnap, sheetSnap] = await Promise.all([
    adminDb
      .collection(COLLECTIONS.TASKS)
      .where('status', 'in', OPEN_TASK_STATUSES)
      .select('projectId', 'title', 'status', 'priority', 'dueDate', 'assignee', 'clickupUrl', 'needsClientInput')
      .get(),
    adminDb.collection(COLLECTIONS.PROJECT_CHECKLISTS).get(),
    adminDb.collection(COLLECTIONS.PROJECT_TIMELINES).get(),
    adminDb.collection(COLLECTIONS.PROJECT_SHEETS).get(),
  ]);

  const tasks = groupBy(
    taskSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TaskRow, 'id'>) })),
    (t) => t.projectId,
  );
  const checklists = groupBy(
    checklistSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as ProjectChecklist),
    (c) => c.projectId,
  );
  const timelines = new Map(
    timelineSnap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const projectId = typeof data.projectId === 'string' ? data.projectId : d.id;
      return [projectId, toTimeline(projectId, data)] as const;
    }),
  );
  const sheets = new Map(
    sheetSnap.docs.map((d) => {
      const data = d.data() as ProjectSheetRecord;
      return [data.projectId ?? d.id, data] as const;
    }),
  );

  const entries = await Promise.all(
    projects.map(async (project): Promise<[string, RaycastProjectSummary]> => {
      const facing = project.clientFacing;
      const sheet = sheets.get(project.id);
      const projectChecklists = checklists.get(project.id) ?? [];
      const projectTasks = tasks.get(project.id) ?? [];
      const timeline = timelines.get(project.id) ?? null;

      let stage: RaycastProjectSummary['stage'];
      let asks: number | undefined;
      try {
        const view = buildClientPortalView({
          project,
          timeline,
          tasks: projectTasks as unknown as Task[],
          checklists: projectChecklists,
          sheet: snapshotOf(sheet ?? null),
          templates: await loadSourceTemplates(projectChecklists),
          agency: [AGENCY_START, AGENCY_CLOSE],
        });
        asks = view.asks.length || undefined;
        if (view.stages.length > 0) {
          const index = view.currentStageIndex;
          const current = index !== undefined ? view.stages[index] : undefined;
          stage = {
            title: current?.title ?? 'Every stage done',
            index: index ?? view.stages.length,
            count: view.stages.length,
            percent: current?.percent,
            dueDate: current?.dueDate,
            source: view.planSource,
          };
        }
      } catch (error) {
        console.error(`[raycast-summary] portal view failed for ${project.id}`, error);
      }

      return [
        project.id,
        {
          clientStatus: facing?.status,
          clientStatusNote: facing?.statusNote,
          stage,
          asks,
          clientUpdatedAt: facing?.lastUpdateAt,
          openRequests: facing?.openRequestCount,
          portalViews: facing?.viewCount,
          portalLastViewedAt: facing?.lastViewedAt,
          checklist: summarizeChecklists(projectChecklists),
          ...summarizeTimeline(timeline ?? undefined),
          tasks: summarizeTasks(projectTasks),
          sheetUrl: sheet?.url,
          sheetTitle: sheet?.title,
          owner: project.reviewOwnerEmail,
          assignees: project.assigneeEmails?.length ? project.assigneeEmails : undefined,
          services: project.services?.length ? project.services : undefined,
        },
      ];
    }),
  );
  return new Map(entries);
}
