import { NextRequest, NextResponse } from 'next/server';
import {
  ApiAuthError,
  apiAuthErrorResponse,
  requireCaller,
} from '@/lib/api-auth';
import {
  db as adminDb,
  hasFirebaseAdminCredentials,
} from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import type {
  IntakeDashboardResponse,
  Project,
  ProjectIntakeSummary,
  Task,
} from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const PROJECTS_COLLECTION = COLLECTIONS.PROJECTS;
const TASKS_COLLECTION = COLLECTIONS.TASKS;
const REQUESTS_COLLECTION = COLLECTIONS.REQUESTS;

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_OPEN_DAYS = 14;
const BLOCKED_AGING_DAYS = 5;
const REVIEW_AGING_DAYS = 3;

interface FirestoreDateLike {
  toDate?: () => Date;
  _seconds?: number;
  seconds?: number;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const obj = value as FirestoreDateLike;
  if (typeof obj.toDate === 'function') return obj.toDate();
  if (typeof obj._seconds === 'number') return new Date(obj._seconds * 1000);
  if (typeof obj.seconds === 'number') return new Date(obj.seconds * 1000);
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? new Date(ms) : null;
  }
  return null;
}

function ageDays(value: unknown, now: number): number {
  const d = toDate(value);
  if (!d) return 0;
  return Math.max(0, Math.floor((now - d.getTime()) / DAY_MS));
}

/**
 * Cross-client operator dashboard. Reads from the locally-mirrored `tasks`
 * collection (kept in sync via webhook + drift cron) and the `requests` blobs
 * to surface what's blocked, aging, and untriaged across every project.
 *
 * Auth: any @activeset.co teammate (matches the rest of the workspace).
 */
export async function GET(request: NextRequest) {
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  try {
    await requireCaller(request);
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    return NextResponse.json({ error: 'Auth failed' }, { status: 500 });
  }

  const now = Date.now();

  const projectSnap = await adminDb.collection(PROJECTS_COLLECTION).get();
  const projects = projectSnap.docs.map((d) => ({
    id: d.id,
    data: d.data() as Project,
  }));
  const projectIndex = new Map(projects.map((p) => [p.id, p.data]));

  // Pull every linked task in one scan. Could grow large; index `clickupTaskId`
  // is already needed for the existing webhook logic, so this is bounded.
  const taskSnap = await adminDb
    .collection(TASKS_COLLECTION)
    .where('clickupTaskId', '!=', null)
    .get();

  const summaries = new Map<string, ProjectIntakeSummary>();
  for (const { id, data } of projects) {
    summaries.set(id, {
      projectId: id,
      projectName: data.name || '(unnamed)',
      client: data.client,
      clickupListId: data.clickupListId,
      clickupListName: data.clickupListName,
      intakeEnabled: data.intakeEnabled ?? false,
      intakeToken: data.intakeToken,
      intakeAutoCreate: data.intakeAutoCreate ?? false,
      open: 0,
      inProgress: 0,
      inReview: 0,
      blocked: 0,
      done: 0,
      staleCount: 0,
      blockedAgingCount: 0,
      reviewAgingCount: 0,
      untriagedRequests: 0,
      lastSyncedAt: undefined,
    });
  }

  for (const doc of taskSnap.docs) {
    const t = doc.data() as Task;
    const summary = summaries.get(t.projectId);
    if (!summary) continue; // task with no matching project — orphan, skip

    switch (t.status) {
      case 'todo':
      case 'backlog':
        summary.open += 1;
        break;
      case 'in_progress':
        summary.inProgress += 1;
        break;
      case 'in_review':
        summary.inReview += 1;
        break;
      case 'blocked':
        summary.blocked += 1;
        break;
      case 'done':
        summary.done += 1;
        break;
    }

    const updated = ageDays(t.updatedAt, now);
    const isOpen =
      t.status !== 'done' && t.status !== 'in_progress' && t.status !== 'in_review';

    if (isOpen && (updated >= STALE_OPEN_DAYS || !t.dueDate || !t.assignee)) {
      // Stale = open + stagnant OR open + missing the basics.
      if (
        updated >= STALE_OPEN_DAYS ||
        (t.status === 'todo' && (!t.dueDate || !t.assignee))
      ) {
        summary.staleCount += 1;
      }
    }
    if (t.status === 'blocked' && updated >= BLOCKED_AGING_DAYS) {
      summary.blockedAgingCount += 1;
    }
    if (t.status === 'in_review' && updated >= REVIEW_AGING_DAYS) {
      summary.reviewAgingCount += 1;
    }

    const syncedAt = toDate(t.clickupSyncedAt);
    if (syncedAt) {
      const iso = syncedAt.toISOString();
      if (!summary.lastSyncedAt || iso > summary.lastSyncedAt) {
        summary.lastSyncedAt = iso;
      }
    }
  }

  // Untriaged intake requests (status='new').
  const requestSnap = await adminDb
    .collection(REQUESTS_COLLECTION)
    .where('status', '==', 'new')
    .get();
  for (const doc of requestSnap.docs) {
    const r = doc.data() as { projectId?: string };
    if (!r.projectId) continue;
    const summary = summaries.get(r.projectId);
    if (summary) summary.untriagedRequests += 1;
  }

  // Sort — most pain first.
  const sortedProjects = Array.from(summaries.values()).sort((a, b) => {
    const pain = (s: ProjectIntakeSummary) =>
      s.blockedAgingCount * 4 +
      s.staleCount * 2 +
      s.untriagedRequests * 3 +
      s.reviewAgingCount;
    return pain(b) - pain(a);
  });

  const totals = sortedProjects.reduce(
    (acc, p) => {
      acc.open += p.open + p.inProgress + p.inReview + p.blocked;
      acc.blocked += p.blocked;
      acc.blockedAgingCount += p.blockedAgingCount;
      acc.staleCount += p.staleCount;
      acc.reviewAgingCount += p.reviewAgingCount;
      acc.untriagedRequests += p.untriagedRequests;
      return acc;
    },
    {
      projects: sortedProjects.length,
      open: 0,
      blocked: 0,
      blockedAgingCount: 0,
      staleCount: 0,
      reviewAgingCount: 0,
      untriagedRequests: 0,
    },
  );
  // Ensure the projects count is the *linked* count, not the total.
  totals.projects = sortedProjects.filter((p) => Boolean(p.clickupListId)).length;
  // Guard against the count getting overwritten in the reduce.
  void projectIndex;

  const response: IntakeDashboardResponse = {
    generatedAt: new Date().toISOString(),
    projects: sortedProjects,
    totals,
  };
  return NextResponse.json(response);
}
