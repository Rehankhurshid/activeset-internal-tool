import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import {
  buildSlackDedupeKey,
  buildSlackMessageSourceLink,
  classifyOperationalText,
  collectQaResults,
  deriveSnapshotStatus,
  getDailyControlDateKey,
  redactClientDraftText,
  slackRequestDocId,
  summarizeText,
} from '@/lib/daily-control-utils';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import type {
  ChecklistItem,
  ChecklistSection,
  DailyControlChecklistGap,
  DailyControlClientUpdateDraft,
  DailyControlQaResult,
  DailyControlSignal,
  DailyControlSnapshot,
  DailyControlTaskRef,
  DailyControlTimelineRisk,
  Project,
  ProjectChecklist,
  ProjectLink,
  ProjectRequest,
  Task,
  TimelineMilestone,
} from '@/types';

const LINK_AUDITS_SUBCOLLECTION = 'link_audits';
const DEFAULT_LOOKBACK_HOURS = 36;
const DEFAULT_SLACK_LIMIT = 50;

interface SlackMessage {
  type?: string;
  subtype?: string;
  user?: string;
  username?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  bot_id?: string;
}

interface SlackHistoryResponse {
  ok: boolean;
  error?: string;
  messages?: SlackMessage[];
}

export interface SlackImportResult {
  ok: boolean;
  reason?: string;
  configuredChannels: number;
  scannedMessages: number;
  imported: number;
  skipped: number;
  errors: string[];
}

export interface DailyControlRunResult {
  ok: boolean;
  snapshot?: DailyControlSnapshot;
  slackImport?: SlackImportResult;
  reason?: string;
}

export interface DailyControlCronResult {
  ok: boolean;
  reason?: string;
  examined?: number;
  updated?: number;
  failed?: number;
  results?: { projectId: string; projectName?: string; ok: boolean; status?: string; reason?: string }[];
}

function getControlTimeZone(): string {
  return (
    process.env.DAILY_CONTROL_TIME_ZONE ||
    process.env.REVIEW_TIMEZONE ||
    process.env.DAILY_SCAN_TIME_ZONE ||
    'Asia/Kolkata'
  );
}

function snapshotId(projectId: string, dateKey: string): string {
  return `${projectId}_${dateKey}`;
}

function asDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate();
  }
  return undefined;
}

function iso(value: unknown, fallback = new Date()): string {
  return (asDate(value) ?? fallback).toISOString();
}

function stripUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map(stripUndefined) as T;
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, stripUndefined(value)]),
    ) as T;
  }
  return obj;
}

function taskFromAdminDoc(id: string, data: Record<string, unknown>): Task {
  return {
    id,
    projectId: data.projectId as string,
    requestId: data.requestId as string | undefined,
    title: (data.title as string | undefined) ?? 'Untitled task',
    description: data.description as string | undefined,
    category: (data.category as Task['category']) ?? 'other',
    status: (data.status as Task['status']) ?? 'todo',
    priority: (data.priority as Task['priority']) ?? 'medium',
    dueDate: data.dueDate as string | undefined,
    tags: (data.tags as string[] | undefined) ?? [],
    source: (data.source as Task['source']) ?? 'manual',
    sourceLink: data.sourceLink as string | undefined,
    slack: data.slack as Task['slack'],
    dedupeKey: data.dedupeKey as string | undefined,
    pageUrl: data.pageUrl as string | undefined,
    qaStatus: data.qaStatus as Task['qaStatus'],
    isBlocker: data.isBlocker as boolean | undefined,
    needsClientInput: data.needsClientInput as boolean | undefined,
    confidence: data.confidence as number | undefined,
    assignee: data.assignee as string | undefined,
    order: (data.order as number | undefined) ?? 0,
    clickupTaskId: data.clickupTaskId as string | undefined,
    parentClickupTaskId: data.parentClickupTaskId as string | undefined,
    clickupUrl: data.clickupUrl as string | undefined,
    clickupSyncedAt: asDate(data.clickupSyncedAt),
    clickupSyncError: data.clickupSyncError as string | undefined,
    clickupSyncFailedAt: asDate(data.clickupSyncFailedAt),
    clickupSyncInFlightAt: asDate(data.clickupSyncInFlightAt),
    createdAt: asDate(data.createdAt) ?? new Date(),
    updatedAt: asDate(data.updatedAt) ?? new Date(),
    completedAt: asDate(data.completedAt),
    createdBy: (data.createdBy as string | undefined) ?? 'unknown',
  };
}

function requestFromAdminDoc(id: string, data: Record<string, unknown>): ProjectRequest {
  return {
    id,
    projectId: data.projectId as string,
    rawText: (data.rawText as string | undefined) ?? '',
    source: (data.source as ProjectRequest['source']) ?? 'paste',
    sender: data.sender as string | undefined,
    sourceLink: data.sourceLink as string | undefined,
    slack: data.slack as ProjectRequest['slack'],
    dedupeKey: data.dedupeKey as string | undefined,
    pageUrl: data.pageUrl as string | undefined,
    isActionable: data.isActionable as boolean | undefined,
    needsClientInput: data.needsClientInput as boolean | undefined,
    isBlocker: data.isBlocker as boolean | undefined,
    confidence: data.confidence as number | undefined,
    receivedAt: asDate(data.receivedAt) ?? new Date(),
    parsedAt: asDate(data.parsedAt),
    status: (data.status as ProjectRequest['status']) ?? 'new',
    taskIds: (data.taskIds as string[] | undefined) ?? [],
    createdBy: (data.createdBy as string | undefined) ?? 'unknown',
  };
}

function taskRef(task: Task): DailyControlTaskRef {
  return stripUndefined({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    assignee: task.assignee,
    dueDate: task.dueDate,
    sourceLink: task.sourceLink,
    clickupUrl: task.clickupUrl,
    pageUrl: task.pageUrl,
    isBlocker: task.isBlocker,
    needsClientInput: task.needsClientInput,
  });
}

async function loadProject(projectId: string): Promise<Project | null> {
  const snap = await adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId).get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown>;
  const project = {
    id: snap.id,
    ...data,
    links: (data.links as ProjectLink[] | undefined) ?? [],
    status: (data.status as Project['status']) ?? 'current',
    tags: (data.tags as Project['tags'] | undefined) ?? [],
    createdAt: asDate(data.createdAt) ?? new Date(),
    updatedAt: asDate(data.updatedAt) ?? new Date(),
  } as Project;

  try {
    const auditSnap = await adminDb
      .collection(COLLECTIONS.PROJECTS)
      .doc(projectId)
      .collection(LINK_AUDITS_SUBCOLLECTION)
      .get();
    const audits = new Map(auditSnap.docs.map((doc) => [doc.id, doc.data() as ProjectLink['auditResult']]));
    project.links = project.links.map((link) => ({
      ...link,
      auditResult: audits.get(link.id) ?? link.auditResult,
    }));
  } catch (error) {
    console.warn(`[daily-control] Failed to merge link audits for ${projectId}:`, error);
  }

  return project;
}

async function loadProjectTasks(projectId: string): Promise<Task[]> {
  const snap = await adminDb
    .collection(COLLECTIONS.TASKS)
    .where('projectId', '==', projectId)
    .get();
  return snap.docs.map((doc) => taskFromAdminDoc(doc.id, doc.data() as Record<string, unknown>));
}

async function loadProjectRequests(projectId: string): Promise<ProjectRequest[]> {
  const snap = await adminDb
    .collection(COLLECTIONS.REQUESTS)
    .where('projectId', '==', projectId)
    .get();
  return snap.docs
    .map((doc) => requestFromAdminDoc(doc.id, doc.data() as Record<string, unknown>))
    .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
}

async function loadProjectChecklists(projectId: string): Promise<ProjectChecklist[]> {
  const snap = await adminDb
    .collection(COLLECTIONS.PROJECT_CHECKLISTS)
    .where('projectId', '==', projectId)
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      projectId,
      templateId: (data.templateId as string | undefined) ?? '',
      templateName: (data.templateName as string | undefined) ?? 'Checklist',
      sections: (data.sections as ChecklistSection[] | undefined) ?? [],
      createdAt: asDate(data.createdAt) ?? new Date(),
      updatedAt: asDate(data.updatedAt) ?? new Date(),
    };
  });
}

async function loadTimelineMilestones(projectId: string): Promise<TimelineMilestone[]> {
  const snap = await adminDb.collection(COLLECTIONS.PROJECT_TIMELINES).doc(projectId).get();
  if (!snap.exists) return [];
  const data = snap.data() as { milestones?: TimelineMilestone[] } | undefined;
  return data?.milestones ?? [];
}

function getQaLinks(project: Project): ProjectLink[] {
  const source = project.qaUrlSource ?? 'auto_links';
  if (source === 'manual_links') return project.links.filter((link) => link.source !== 'auto');
  if (source !== 'custom') return project.links.filter((link) => link.source === 'auto');

  return (project.qaUrls ?? []).map((url, index) => {
    const existing = project.links.find((link) => link.url === url);
    if (existing) return existing;
    return {
      id: `custom-${index}`,
      title: url,
      url,
      order: index,
      isDefault: false,
      source: 'manual',
    };
  });
}

function checklistGaps(checklists: ProjectChecklist[]): DailyControlChecklistGap[] {
  const priorityPattern = /qa|test|launch|handover|client|approval|seo|form|domain|responsive|mobile|copy|cms|checklist/i;
  const gaps: DailyControlChecklistGap[] = [];

  for (const checklist of checklists) {
    for (const section of checklist.sections) {
      for (const item of section.items) {
        if (item.status === 'completed' || item.status === 'skipped') continue;
        gaps.push(checklistGap(checklist, section, item));
      }
    }
  }

  const priority = gaps.filter((gap) =>
    priorityPattern.test(`${gap.checklistName} ${gap.sectionTitle} ${gap.title}`),
  );
  return (priority.length > 0 ? priority : gaps).slice(0, 10);
}

function checklistGap(
  checklist: ProjectChecklist,
  section: ChecklistSection,
  item: ChecklistItem,
): DailyControlChecklistGap {
  return stripUndefined({
    checklistId: checklist.id,
    itemId: item.id,
    checklistName: checklist.templateName,
    sectionTitle: section.title,
    title: item.title,
    status: item.status,
    assignee: item.assignee,
    referenceLink: item.referenceLink,
  });
}

function timelineRisks(milestones: TimelineMilestone[], dateKey: string): DailyControlTimelineRisk[] {
  return milestones
    .filter((milestone) => {
      if (milestone.status === 'completed') return false;
      return milestone.status === 'blocked' || milestone.endDate < dateKey;
    })
    .map((milestone) => ({
      milestoneId: milestone.id,
      title: milestone.title,
      status: milestone.status,
      startDate: milestone.startDate,
      endDate: milestone.endDate,
      assignee: milestone.assignee,
      reason: milestone.status === 'blocked' ? 'Milestone is blocked.' : `Milestone ended on ${milestone.endDate}.`,
    }))
    .slice(0, 10);
}

function signalFromRequest(request: ProjectRequest): DailyControlSignal {
  return stripUndefined({
    id: request.dedupeKey ?? request.id,
    requestId: request.id,
    summary: summarizeText(request.rawText),
    rawText: request.rawText,
    source: request.source,
    sender: request.sender,
    receivedAt: request.receivedAt.toISOString(),
    sourceLink: request.sourceLink,
    slack: request.slack,
    dedupeKey: request.dedupeKey,
    pageUrl: request.pageUrl,
    isBlocker: request.isBlocker,
    needsClientInput: request.needsClientInput,
    confidence: request.confidence,
  });
}

function clientSafeText(text: string, redactions: Set<string>): string {
  const result = redactClientDraftText(text);
  result.redactions.forEach((redaction) => redactions.add(redaction));
  return result.text;
}

function bulletList(items: string[], fallback: string): string[] {
  if (items.length === 0) return [`- ${fallback}`];
  return items.slice(0, 5).map((item) => `- ${item}`);
}

function buildClientUpdateDraft(
  project: Project,
  snapshot: Omit<DailyControlSnapshot, 'clientUpdateDraft'>,
): DailyControlClientUpdateDraft {
  const redactions = new Set<string>();
  const client = project.client?.trim() || 'team';

  const completed = snapshot.completedToday.map((task) => clientSafeText(task.title, redactions));
  const active = snapshot.inProgressTasks.map((task) => clientSafeText(task.title, redactions));
  const needsInput = [
    ...snapshot.clientInputTasks.map((task) => clientSafeText(task.title, redactions)),
    ...snapshot.signals
      .filter((signal) => signal.needsClientInput)
      .map((signal) => clientSafeText(signal.summary, redactions)),
  ];
  const qaFailed = snapshot.qaResults.filter((item) => item.status === 'failed');
  const nextRisks = snapshot.timelineRisks.map((risk) => `${clientSafeText(risk.title, redactions)} (${risk.reason})`);

  const lines = [
    `Hi ${client},`,
    '',
    `Quick update for ${project.name} (${snapshot.dateKey}):`,
    '',
    'Completed / ready:',
    ...bulletList(completed, 'No newly completed items were marked today.'),
    '',
    'In progress:',
    ...bulletList(active, 'Current work is being organized for the next update.'),
    '',
    'Waiting on input:',
    ...bulletList(needsInput, 'Nothing needed from your side right now.'),
    '',
    'QA:',
    qaFailed.length > 0
      ? `- QA flagged ${qaFailed.length} item${qaFailed.length === 1 ? '' : 's'} that we are reviewing before handoff.`
      : '- No critical QA issue is currently blocking the next review.',
    '',
    'Next:',
    ...bulletList(nextRisks, 'We will continue page-level updates and share the next review link when ready.'),
  ];

  return {
    status: 'draft',
    text: lines.join('\n'),
    generatedAt: new Date().toISOString(),
    redactions: Array.from(redactions),
  };
}

function buildSnapshot(input: {
  project: Project;
  dateKey: string;
  tasks: Task[];
  requests: ProjectRequest[];
  checklists: ProjectChecklist[];
  milestones: TimelineMilestone[];
  qaResults: DailyControlQaResult[];
}): DailyControlSnapshot {
  const { project, dateKey, tasks, requests, checklists, milestones, qaResults } = input;
  const timeZone = getControlTimeZone();

  const openTasks = tasks.filter((task) => task.status !== 'done');
  const completedToday = tasks.filter((task) => {
    if (task.status !== 'done' || !task.completedAt) return false;
    return getDailyControlDateKey(task.completedAt, timeZone) === dateKey;
  });
  const overdueTasks = openTasks.filter((task) => Boolean(task.dueDate && task.dueDate < dateKey));
  const noDateTasks = openTasks.filter((task) => !task.dueDate);
  const openBlockers = openTasks.filter((task) => task.status === 'blocked' || task.isBlocker);
  const clientInputTasks = openTasks.filter((task) => task.needsClientInput);
  const inProgressTasks = openTasks.filter((task) => task.status === 'in_progress' || task.status === 'in_review');

  const signals = requests
    .filter((request) => request.source === 'slack')
    .filter((request) => request.status !== 'parsed')
    .filter((request) => getDailyControlDateKey(request.receivedAt, timeZone) === dateKey)
    .filter((request) => request.isActionable !== false)
    .slice(0, 12)
    .map(signalFromRequest);

  const gaps = checklistGaps(checklists);
  const risks = timelineRisks(milestones, dateKey);
  const failedQaCount = qaResults.filter((result) => result.status === 'failed').length;

  const summary = {
    signalCount: signals.length,
    openTaskCount: openTasks.length,
    blockerCount: openBlockers.length + clientInputTasks.length,
    overdueTaskCount: overdueTasks.length,
    noDateTaskCount: noDateTasks.length,
    checklistGapCount: checklists.reduce(
      (count, checklist) =>
        count + checklist.sections.reduce(
          (sectionCount, section) =>
            sectionCount + section.items.filter((item) => item.status !== 'completed' && item.status !== 'skipped').length,
          0,
        ),
      0,
    ),
    timelineRiskCount: risks.length,
    qaFailedCount: failedQaCount,
    completedTodayCount: completedToday.length,
  };

  const now = new Date().toISOString();
  const base = {
    id: snapshotId(project.id, dateKey),
    projectId: project.id,
    projectName: project.name,
    dateKey,
    status: deriveSnapshotStatus(summary),
    summary,
    signals,
    openBlockers: openBlockers.slice(0, 10).map(taskRef),
    overdueTasks: overdueTasks.slice(0, 10).map(taskRef),
    noDateTasks: noDateTasks.slice(0, 10).map(taskRef),
    clientInputTasks: clientInputTasks.slice(0, 10).map(taskRef),
    completedToday: completedToday.slice(0, 8).map(taskRef),
    inProgressTasks: inProgressTasks.slice(0, 8).map(taskRef),
    checklistGaps: gaps,
    timelineRisks: risks,
    qaResults,
    generatedAt: now,
    updatedAt: now,
  };

  return {
    ...base,
    clientUpdateDraft: buildClientUpdateDraft(project, base),
  };
}

async function saveSnapshot(snapshot: DailyControlSnapshot): Promise<void> {
  await adminDb
    .collection(COLLECTIONS.DAILY_CONTROL_SNAPSHOTS)
    .doc(snapshot.id)
    .set(stripUndefined(snapshot), { merge: true });
}

export async function getTodayControlSnapshot(
  projectId: string,
  dateKey = getDailyControlDateKey(new Date(), getControlTimeZone()),
): Promise<DailyControlSnapshot | null> {
  if (!hasFirebaseAdminCredentials) return null;
  const snap = await adminDb
    .collection(COLLECTIONS.DAILY_CONTROL_SNAPSHOTS)
    .doc(snapshotId(projectId, dateKey))
    .get();
  if (!snap.exists) return null;
  return snap.data() as DailyControlSnapshot;
}

async function fetchSlackHistory(channelId: string, opts: { oldest: string; limit: number }): Promise<SlackHistoryResponse> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { ok: false, error: 'SLACK_BOT_TOKEN not set' };

  const url = new URL('https://slack.com/api/conversations.history');
  url.searchParams.set('channel', channelId);
  url.searchParams.set('limit', String(opts.limit));
  url.searchParams.set('oldest', opts.oldest);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  const json = (await response.json().catch(() => null)) as SlackHistoryResponse | null;
  if (!json) return { ok: false, error: `Slack returned ${response.status}` };
  return json;
}

export async function importSlackRequestsForProject(
  project: Project,
  opts: {
    createdBy?: string;
    lookbackHours?: number;
    maxMessagesPerChannel?: number;
  } = {},
): Promise<SlackImportResult> {
  const channelIds = (project.slackChannelIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (channelIds.length === 0) {
    return {
      ok: true,
      reason: 'No Slack channels configured for this project.',
      configuredChannels: 0,
      scannedMessages: 0,
      imported: 0,
      skipped: 0,
      errors: [],
    };
  }
  if (!process.env.SLACK_BOT_TOKEN) {
    return {
      ok: false,
      reason: 'SLACK_BOT_TOKEN not set.',
      configuredChannels: channelIds.length,
      scannedMessages: 0,
      imported: 0,
      skipped: 0,
      errors: ['SLACK_BOT_TOKEN not set.'],
    };
  }

  const lookbackHours = opts.lookbackHours ?? DEFAULT_LOOKBACK_HOURS;
  const oldest = String(Math.floor((Date.now() - lookbackHours * 60 * 60 * 1000) / 1000));
  const limit = Math.min(Math.max(opts.maxMessagesPerChannel ?? DEFAULT_SLACK_LIMIT, 1), 100);
  let imported = 0;
  let skipped = 0;
  let scannedMessages = 0;
  const errors: string[] = [];

  for (const channelId of channelIds) {
    const history = await fetchSlackHistory(channelId, { oldest, limit });
    if (!history.ok) {
      errors.push(`${channelId}: ${history.error ?? 'Slack history failed'}`);
      continue;
    }

    for (const message of history.messages ?? []) {
      scannedMessages += 1;
      const text = message.text?.trim();
      const ts = message.ts;
      if (!text || !ts || message.bot_id || message.subtype === 'bot_message' || message.subtype === 'channel_join') {
        skipped += 1;
        continue;
      }

      const classification = classifyOperationalText(text);
      if (!classification.isActionable) {
        skipped += 1;
        continue;
      }

      const dedupeKey = buildSlackDedupeKey(channelId, ts);
      const docId = slackRequestDocId(project.id, dedupeKey);
      const ref = adminDb.collection(COLLECTIONS.REQUESTS).doc(docId);
      const existing = await ref.get();
      if (existing.exists) {
        skipped += 1;
        continue;
      }

      const receivedAt = new Date(Number.parseFloat(ts) * 1000);
      const sourceLink = buildSlackMessageSourceLink(channelId, ts);
      await ref.set(stripUndefined({
        projectId: project.id,
        rawText: text,
        source: 'slack',
        sender: message.username || message.user,
        sourceLink,
        slack: {
          channelId,
          messageTs: ts,
          threadTs: message.thread_ts && message.thread_ts !== ts ? message.thread_ts : undefined,
          userId: message.user,
          username: message.username,
          permalink: sourceLink,
        },
        dedupeKey,
        pageUrl: classification.pageUrl,
        isActionable: classification.isActionable,
        needsClientInput: classification.needsClientInput,
        isBlocker: classification.isBlocker,
        confidence: classification.confidence,
        receivedAt,
        status: 'new',
        taskIds: [],
        createdBy: opts.createdBy ?? 'daily-control',
        importedAt: FieldValue.serverTimestamp(),
      }));
      imported += 1;
    }
  }

  return {
    ok: errors.length === 0,
    reason: errors.length > 0 ? 'Some Slack channels could not be imported.' : undefined,
    configuredChannels: channelIds.length,
    scannedMessages,
    imported,
    skipped,
    errors,
  };
}

export async function importSlackRequestsForProjectId(
  projectId: string,
  opts: Parameters<typeof importSlackRequestsForProject>[1] = {},
): Promise<SlackImportResult> {
  if (!hasFirebaseAdminCredentials) {
    return {
      ok: false,
      reason: 'firebase-admin not configured',
      configuredChannels: 0,
      scannedMessages: 0,
      imported: 0,
      skipped: 0,
      errors: ['firebase-admin not configured'],
    };
  }
  const project = await loadProject(projectId);
  if (!project) {
    return {
      ok: false,
      reason: 'Project not found',
      configuredChannels: 0,
      scannedMessages: 0,
      imported: 0,
      skipped: 0,
      errors: ['Project not found'],
    };
  }
  return importSlackRequestsForProject(project, opts);
}

export async function runDailyControlForProject(
  projectId: string,
  opts: {
    createdBy?: string;
    includeSlackImport?: boolean;
    lookbackHours?: number;
  } = {},
): Promise<DailyControlRunResult> {
  if (!hasFirebaseAdminCredentials) {
    return { ok: false, reason: 'firebase-admin not configured' };
  }

  const project = await loadProject(projectId);
  if (!project) return { ok: false, reason: 'Project not found' };

  let slackImport: SlackImportResult | undefined;
  if (opts.includeSlackImport ?? true) {
    slackImport = await importSlackRequestsForProject(project, {
      createdBy: opts.createdBy,
      lookbackHours: opts.lookbackHours,
    });
  }

  const timeZone = getControlTimeZone();
  const dateKey = getDailyControlDateKey(new Date(), timeZone);
  const [tasks, requests, checklists, milestones] = await Promise.all([
    loadProjectTasks(projectId),
    loadProjectRequests(projectId),
    loadProjectChecklists(projectId),
    loadTimelineMilestones(projectId),
  ]);

  const qaResults = collectQaResults(getQaLinks(project));
  const snapshot = buildSnapshot({
    project,
    dateKey,
    tasks,
    requests,
    checklists,
    milestones,
    qaResults,
  });
  await saveSnapshot(snapshot);

  return { ok: true, snapshot, slackImport };
}

export async function regenerateClientUpdateDraft(projectId: string): Promise<DailyControlRunResult> {
  if (!hasFirebaseAdminCredentials) {
    return { ok: false, reason: 'firebase-admin not configured' };
  }
  const project = await loadProject(projectId);
  if (!project) return { ok: false, reason: 'Project not found' };

  const existing = await getTodayControlSnapshot(projectId);
  const result = existing ?? (await runDailyControlForProject(projectId, { includeSlackImport: false })).snapshot;
  if (!result) return { ok: false, reason: 'Could not create control snapshot' };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { clientUpdateDraft, ...snapshotWithoutDraft } = result;
  const draft = buildClientUpdateDraft(project, snapshotWithoutDraft);
  const snapshot = { ...result, clientUpdateDraft: draft, updatedAt: new Date().toISOString() };
  await saveSnapshot(snapshot);
  return { ok: true, snapshot };
}

export async function runDailyControlForCurrentProjects(opts: {
  limit?: number;
  includeSlackImport?: boolean;
} = {}): Promise<DailyControlCronResult> {
  if (!hasFirebaseAdminCredentials) {
    return { ok: false, reason: 'firebase-admin not configured' };
  }

  const limit = opts.limit ?? 50;
  const snap = await adminDb.collection(COLLECTIONS.PROJECTS).get();
  const projects = snap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }) as Project)
    .filter((project) => (project.status ?? 'current') === 'current')
    .filter((project) => (project.tags?.length ?? 0) > 0)
    .slice(0, limit);

  const results: DailyControlCronResult['results'] = [];
  for (const project of projects) {
    try {
      const result = await runDailyControlForProject(project.id, {
        createdBy: 'daily-control-cron',
        includeSlackImport: opts.includeSlackImport ?? true,
      });
      results.push({
        projectId: project.id,
        projectName: project.name,
        ok: result.ok,
        status: result.snapshot?.status,
        reason: result.reason,
      });
    } catch (error) {
      results.push({
        projectId: project.id,
        projectName: project.name,
        ok: false,
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

  return {
    ok: true,
    examined: projects.length,
    updated: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  };
}
