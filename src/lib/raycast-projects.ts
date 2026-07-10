import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { nextStreak, todayIso } from '@/lib/review-status';
import type {
  CreateProjectLinkInput,
  Project,
  ProjectLink,
  ProjectStatus,
  ProjectTag,
  Task,
  TaskCategory,
  TaskPriority,
  TaskSource,
  TaskStatus,
  UpdateProjectLinkInput,
} from '@/types';

const LINK_AUDITS_SUBCOLLECTION = 'link_audits';
const PROJECT_STATUSES = new Set<ProjectStatus>(['current', 'paused', 'closed', 'paid']);
const PROJECT_TAGS = new Set<ProjectTag>(['retainer', 'one_time', 'subscription', 'maintenance', 'consulting']);
const TASK_STATUSES = new Set<TaskStatus>(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked']);
const TASK_PRIORITIES = new Set<TaskPriority>(['low', 'medium', 'high', 'urgent']);
const TASK_CATEGORIES = new Set<TaskCategory>(['fix', 'feature', 'copy', 'design', 'bug', 'content', 'other']);
const TASK_SOURCES = new Set<TaskSource>(['manual', 'paste', 'slack', 'email', 'clickup']);

export interface RaycastProjectPayload {
  id: string;
  name: string;
  status: ProjectStatus;
  tags: ProjectTag[];
  client?: string;
  logoUrl?: string;
  sitemapUrl?: string;
  webflowConfig?: Project['webflowConfig'];
  clickupListId?: string;
  clickupListName?: string;
  proposalId?: string;
  disableAuditBadge?: boolean;
  disableDropdown?: boolean;
  lastReviewDate?: string;
  lastReviewedAt?: string;
  lastReviewedBy?: string;
  reviewStreak?: number;
  createdAt?: string;
  updatedAt?: string;
  links: ProjectLink[];
  stats: {
    manualLinks: number;
    autoLinks: number;
    scannedPages: number;
    averageAuditScore: number | null;
    blockers: number;
    contentChanges: number;
    failedScans: number;
    openTasks?: number;
  };
}

export interface RaycastTaskPayload extends Omit<Task, 'createdAt' | 'updatedAt' | 'completedAt' | 'clickupSyncedAt' | 'clickupSyncFailedAt'> {
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  clickupSyncedAt?: string;
  clickupSyncFailedAt?: string;
}

function assertAdminConfigured(): void {
  if (!hasFirebaseAdminCredentials) {
    throw new Error('Server auth is not configured');
  }
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function asDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof value === 'object') {
    const maybeDate = value as { toDate?: () => Date };
    if (typeof maybeDate.toDate === 'function') return maybeDate.toDate();
  }
  return undefined;
}

function iso(value: unknown): string | undefined {
  return asDate(value)?.toISOString();
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as T;
  if (value !== null && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, stripUndefined(item)]),
    ) as T;
  }
  return value;
}

function stripAuditResultsFromLinks(links: ProjectLink[]): ProjectLink[] {
  return links.map((link) => {
    if (!link.auditResult) return link;
    const { auditResult: _auditResult, ...rest } = link;
    return rest;
  });
}

function projectFromDoc(id: string, data: Record<string, unknown>): Project {
  return {
    id,
    ...data,
    status: (data.status as ProjectStatus | undefined) ?? 'current',
    tags: (data.tags as ProjectTag[] | undefined) ?? [],
    links: (data.links as ProjectLink[] | undefined) ?? [],
    createdAt: asDate(data.createdAt) ?? new Date(),
    updatedAt: asDate(data.updatedAt) ?? new Date(),
  } as Project;
}

async function mergeAuditResults(projectId: string, links: ProjectLink[]): Promise<ProjectLink[]> {
  const snap = await adminDb
    .collection(COLLECTIONS.PROJECTS)
    .doc(projectId)
    .collection(LINK_AUDITS_SUBCOLLECTION)
    .get();
  if (snap.empty) return links;

  const audits = new Map(snap.docs.map((doc) => [doc.id, doc.data() as ProjectLink['auditResult']]));
  return links.map((link) => {
    const audit = audits.get(link.id);
    return audit ? { ...link, auditResult: audit } : link;
  });
}

export async function loadRaycastProject(projectId: string): Promise<Project | null> {
  assertAdminConfigured();
  const snap = await adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId).get();
  if (!snap.exists) return null;
  const project = projectFromDoc(snap.id, snap.data() ?? {});
  project.links = await mergeAuditResults(project.id, project.links);
  return project;
}

export async function loadRaycastProjects(
  opts: { includeAuditResults?: boolean } = {},
): Promise<Project[]> {
  assertAdminConfigured();
  const snap = await adminDb.collection(COLLECTIONS.PROJECTS).get();
  const projects = await Promise.all(
    snap.docs.map(async (doc) => {
      const project = projectFromDoc(doc.id, doc.data() ?? {});
      if (opts.includeAuditResults !== false) {
        project.links = await mergeAuditResults(project.id, project.links);
      }
      return project;
    }),
  );
  return projects.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export function serializeRaycastProject(project: Project, opts: { includeLinks?: boolean; openTasks?: number } = {}): RaycastProjectPayload {
  const links = project.links ?? [];
  const manualLinks = links.filter((link) => link.source !== 'auto');
  const autoLinks = links.filter((link) => link.source === 'auto');
  const audits = autoLinks.map((link) => link.auditResult).filter(Boolean);
  const scores = audits
    .map((audit) => audit?.score)
    .filter((score): score is number => typeof score === 'number');
  const blockers = audits.filter((audit) => audit?.canDeploy === false).length;
  const contentChanges = audits.filter((audit) => audit?.changeStatus === 'CONTENT_CHANGED').length;
  const failedScans = audits.filter((audit) => audit?.changeStatus === 'SCAN_FAILED').length;

  return stripUndefined({
    id: project.id,
    name: project.name,
    status: project.status ?? 'current',
    tags: project.tags ?? [],
    client: project.client,
    logoUrl: project.logoUrl,
    sitemapUrl: project.sitemapUrl,
    webflowConfig: project.webflowConfig,
    clickupListId: project.clickupListId,
    clickupListName: project.clickupListName,
    proposalId: project.proposalId,
    disableAuditBadge: project.disableAuditBadge,
    disableDropdown: project.disableDropdown,
    lastReviewDate: project.lastReviewDate,
    lastReviewedAt: project.lastReviewedAt,
    lastReviewedBy: project.lastReviewedBy,
    reviewStreak: project.reviewStreak,
    createdAt: project.createdAt?.toISOString?.(),
    updatedAt: project.updatedAt?.toISOString?.(),
    links: opts.includeLinks === false ? [] : links,
    stats: {
      manualLinks: manualLinks.length,
      autoLinks: autoLinks.length,
      scannedPages: audits.length,
      averageAuditScore: scores.length > 0 ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
      blockers,
      contentChanges,
      failedScans,
      openTasks: opts.openTasks,
    },
  });
}

export async function createRaycastProject(userId: string, name: string): Promise<string> {
  assertAdminConfigured();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Project name is required');

  const now = Timestamp.now();
  const ref = await adminDb.collection(COLLECTIONS.PROJECTS).add({
    name: trimmed,
    userId,
    status: 'current' satisfies ProjectStatus,
    tags: [] satisfies ProjectTag[],
    links: [],
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function updateRaycastProject(
  projectId: string,
  patch: {
    name?: string;
    client?: string | null;
    status?: ProjectStatus;
    tags?: ProjectTag[];
    sitemapUrl?: string | null;
    disableAuditBadge?: boolean;
    disableDropdown?: boolean;
  },
): Promise<void> {
  assertAdminConfigured();
  const update: Record<string, unknown> = { updatedAt: Timestamp.now() };

  if ('name' in patch) {
    const name = patch.name?.trim();
    if (!name) throw new Error('Project name is required');
    update.name = name;
  }
  if ('client' in patch) {
    const client = patch.client?.trim();
    update.client = client ? client : FieldValue.delete();
  }
  if ('status' in patch) {
    if (!patch.status || !PROJECT_STATUSES.has(patch.status)) throw new Error('Invalid project status');
    update.status = patch.status;
  }
  if ('tags' in patch) {
    const tags = patch.tags ?? [];
    if (!tags.every((tag) => PROJECT_TAGS.has(tag))) throw new Error('Invalid project tag');
    update.tags = tags;
  }
  if ('sitemapUrl' in patch) {
    const sitemapUrl = patch.sitemapUrl?.trim();
    update.sitemapUrl = sitemapUrl ? sitemapUrl : FieldValue.delete();
  }
  if ('disableAuditBadge' in patch) update.disableAuditBadge = Boolean(patch.disableAuditBadge);
  if ('disableDropdown' in patch) update.disableDropdown = Boolean(patch.disableDropdown);

  await adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId).update(update);
}

export async function deleteRaycastProject(projectId: string): Promise<void> {
  assertAdminConfigured();
  await adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId).delete();
}

export async function writeRaycastProjectLinks(projectId: string, links: ProjectLink[]): Promise<void> {
  await adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId).update({
    links: stripUndefined(stripAuditResultsFromLinks(links)),
    updatedAt: Timestamp.now(),
  });
}

export async function addRaycastProjectLink(
  projectId: string,
  input: Partial<CreateProjectLinkInput> & Pick<CreateProjectLinkInput, 'title' | 'url'>,
): Promise<ProjectLink> {
  const project = await loadRaycastProject(projectId);
  if (!project) throw new Error('Project not found');
  const title = input.title?.trim();
  const url = input.url?.trim();
  if (!title) throw new Error('Link title is required');
  if (!url) throw new Error('URL is required');

  const link: ProjectLink = stripUndefined({
    ...input,
    id: generateId(),
    title,
    url,
    order: input.order ?? project.links.length,
    isDefault: input.isDefault ?? false,
    source: input.source ?? 'manual',
  });
  await writeRaycastProjectLinks(projectId, [...project.links, link]);
  return link;
}

export async function updateRaycastProjectLink(
  projectId: string,
  linkId: string,
  updates: UpdateProjectLinkInput,
): Promise<ProjectLink> {
  const project = await loadRaycastProject(projectId);
  if (!project) throw new Error('Project not found');
  let updated: ProjectLink | null = null;
  const links = project.links.map((link) => {
    if (link.id !== linkId) return link;
    updated = stripUndefined({ ...link, ...updates });
    return updated;
  });
  if (!updated) throw new Error('Link not found');
  await writeRaycastProjectLinks(projectId, links);
  return updated;
}

export async function deleteRaycastProjectLink(projectId: string, linkId: string): Promise<void> {
  const project = await loadRaycastProject(projectId);
  if (!project) throw new Error('Project not found');
  await writeRaycastProjectLinks(
    projectId,
    project.links.filter((link) => link.id !== linkId),
  );
}

export async function setRaycastProjectReviewed(
  projectId: string,
  reviewerEmail: string,
  reviewed: boolean,
): Promise<void> {
  const project = await loadRaycastProject(projectId);
  if (!project) throw new Error('Project not found');

  const ref = adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId);
  if (!reviewed) {
    const today = todayIso(new Date(), process.env.REVIEW_TIMEZONE || process.env.DAILY_SCAN_TIME_ZONE);
    if (project.lastReviewDate !== today) return;
    const prevStreak = (project.reviewStreak ?? 1) - 1;
    await ref.update({
      lastReviewDate: FieldValue.delete(),
      lastReviewedAt: FieldValue.delete(),
      lastReviewedBy: FieldValue.delete(),
      reviewStreak: prevStreak > 0 ? prevStreak : FieldValue.delete(),
      updatedAt: Timestamp.now(),
    });
    return;
  }

  const today = todayIso(new Date(), process.env.REVIEW_TIMEZONE || process.env.DAILY_SCAN_TIME_ZONE);
  await ref.update({
    lastReviewDate: today,
    lastReviewedAt: new Date().toISOString(),
    lastReviewedBy: reviewerEmail,
    reviewStreak: nextStreak(
      { lastReviewDate: project.lastReviewDate, reviewStreak: project.reviewStreak },
      today,
    ),
    updatedAt: Timestamp.now(),
  });
}

function taskFromDoc(id: string, data: Record<string, unknown>): Task {
  return {
    id,
    projectId: data.projectId as string,
    requestId: data.requestId as string | undefined,
    title: (data.title as string | undefined) ?? 'Untitled task',
    description: data.description as string | undefined,
    category: (data.category as TaskCategory | undefined) ?? 'other',
    status: (data.status as TaskStatus | undefined) ?? 'todo',
    priority: (data.priority as TaskPriority | undefined) ?? 'medium',
    dueDate: data.dueDate as string | undefined,
    tags: (data.tags as string[] | undefined) ?? [],
    source: (data.source as TaskSource | undefined) ?? 'manual',
    sourceLink: data.sourceLink as string | undefined,
    assignee: data.assignee as string | undefined,
    order: (data.order as number | undefined) ?? 0,
    clickupTaskId: data.clickupTaskId as string | undefined,
    parentClickupTaskId: data.parentClickupTaskId as string | undefined,
    clickupUrl: data.clickupUrl as string | undefined,
    clickupSyncedAt: asDate(data.clickupSyncedAt),
    clickupSyncError: data.clickupSyncError as string | undefined,
    clickupSyncFailedAt: asDate(data.clickupSyncFailedAt),
    createdAt: asDate(data.createdAt) ?? new Date(),
    updatedAt: asDate(data.updatedAt) ?? new Date(),
    completedAt: asDate(data.completedAt),
    createdBy: (data.createdBy as string | undefined) ?? 'unknown',
  };
}

export function serializeRaycastTask(task: Task): RaycastTaskPayload {
  return stripUndefined({
    ...task,
    createdAt: task.createdAt?.toISOString?.(),
    updatedAt: task.updatedAt?.toISOString?.(),
    completedAt: task.completedAt?.toISOString?.(),
    clickupSyncedAt: iso(task.clickupSyncedAt),
    clickupSyncFailedAt: iso(task.clickupSyncFailedAt),
  });
}

export async function loadRaycastTasks(projectId: string): Promise<Task[]> {
  assertAdminConfigured();
  const snap = await adminDb
    .collection(COLLECTIONS.TASKS)
    .where('projectId', '==', projectId)
    .get();
  const tasks = snap.docs.map((doc) => taskFromDoc(doc.id, doc.data() ?? {}));
  const order: Record<TaskStatus, number> = {
    in_progress: 0,
    in_review: 1,
    todo: 2,
    backlog: 3,
    blocked: 4,
    done: 5,
  };
  return tasks.sort((a, b) => {
    const sa = order[a.status] ?? 99;
    const sb = order[b.status] ?? 99;
    if (sa !== sb) return sa - sb;
    return (a.order ?? 0) - (b.order ?? 0);
  });
}

export async function createRaycastTask(input: {
  projectId: string;
  title: string;
  description?: string;
  category?: TaskCategory;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string;
  tags?: string[];
  source?: TaskSource;
  assignee?: string;
  createdBy: string;
}): Promise<Task> {
  assertAdminConfigured();
  const title = input.title.trim();
  if (!title) throw new Error('Task title is required');
  const category = input.category ?? 'other';
  const status = input.status ?? 'todo';
  const priority = input.priority ?? 'medium';
  const source = input.source ?? 'manual';
  if (!TASK_CATEGORIES.has(category)) throw new Error('Invalid task category');
  if (!TASK_STATUSES.has(status)) throw new Error('Invalid task status');
  if (!TASK_PRIORITIES.has(priority)) throw new Error('Invalid task priority');
  if (!TASK_SOURCES.has(source)) throw new Error('Invalid task source');

  const now = Timestamp.now();
  const payload = stripUndefined({
    projectId: input.projectId,
    title,
    description: input.description?.trim() || undefined,
    category,
    status,
    priority,
    dueDate: input.dueDate || undefined,
    tags: input.tags ?? [],
    source,
    assignee: input.assignee?.trim() || undefined,
    order: Date.now(),
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
  });
  const ref = await adminDb.collection(COLLECTIONS.TASKS).add(payload);
  const snap = await ref.get();
  return taskFromDoc(ref.id, snap.data() ?? payload);
}

export async function updateRaycastTask(
  projectId: string,
  taskId: string,
  patch: Partial<Pick<Task, 'title' | 'description' | 'category' | 'status' | 'priority' | 'dueDate' | 'assignee' | 'tags'>>,
): Promise<Task> {
  assertAdminConfigured();
  const ref = adminDb.collection(COLLECTIONS.TASKS).doc(taskId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Task not found');
  const current = taskFromDoc(snap.id, snap.data() ?? {});
  if (current.projectId !== projectId) throw new Error('Task does not belong to this project');

  const update: Record<string, unknown> = { updatedAt: Timestamp.now() };
  if ('title' in patch) {
    const title = patch.title?.trim();
    if (!title) throw new Error('Task title is required');
    update.title = title;
  }
  if ('description' in patch) update.description = patch.description?.trim() || FieldValue.delete();
  if ('category' in patch) {
    if (!patch.category || !TASK_CATEGORIES.has(patch.category)) throw new Error('Invalid task category');
    update.category = patch.category;
  }
  if ('status' in patch) {
    if (!patch.status || !TASK_STATUSES.has(patch.status)) throw new Error('Invalid task status');
    update.status = patch.status;
    update.completedAt = patch.status === 'done' ? Timestamp.now() : FieldValue.delete();
  }
  if ('priority' in patch) {
    if (!patch.priority || !TASK_PRIORITIES.has(patch.priority)) throw new Error('Invalid task priority');
    update.priority = patch.priority;
  }
  if ('dueDate' in patch) update.dueDate = patch.dueDate || FieldValue.delete();
  if ('assignee' in patch) update.assignee = patch.assignee?.trim() || FieldValue.delete();
  if ('tags' in patch) update.tags = patch.tags ?? [];

  await ref.update(update);
  const next = await ref.get();
  return taskFromDoc(next.id, next.data() ?? {});
}

export async function deleteRaycastTask(projectId: string, taskId: string): Promise<void> {
  assertAdminConfigured();
  const ref = adminDb.collection(COLLECTIONS.TASKS).doc(taskId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() as { projectId?: string } | undefined;
  if (data?.projectId !== projectId) throw new Error('Task does not belong to this project');
  await ref.delete();
}
