import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { TaskStatus, TaskPriority, UpdateTaskInput } from '@/types';

const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';

export class ClickUpError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ClickUpError';
  }
}

function getApiToken(): string {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) {
    throw new ClickUpError('CLICKUP_API_TOKEN is not configured', 500);
  }
  return token;
}

async function clickupRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${CLICKUP_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: getApiToken(),
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ClickUpError(
      `ClickUp ${init.method ?? 'GET'} ${path} failed: ${res.status} ${text.slice(0, 200)}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

// ────────────────────────────────────────────────────────────────────────────
// URL parsing
// ────────────────────────────────────────────────────────────────────────────

/**
 * Extract the ClickUp task id from a URL or accept a raw id directly.
 *
 * Supported URL shapes:
 *   https://app.clickup.com/t/abc123
 *   https://app.clickup.com/t/9001234/abc123
 *   https://app.clickup.com/12345/v/li/678/t/abc123
 *
 * Custom IDs (e.g. "ENG-42") are also accepted — the caller decides whether to
 * pass `custom_task_ids=true` when fetching.
 */
export function parseClickUpTaskId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const tMatch = trimmed.match(/\/t\/(?:[^\/]+\/)?([a-zA-Z0-9_-]+)/);
  if (tMatch?.[1]) return tMatch[1];
  // Bare id, no slashes.
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed;
  return null;
}

export function buildClickUpTaskUrl(taskId: string): string {
  return `https://app.clickup.com/t/${taskId}`;
}

/**
 * Extract a ClickUp list id from a URL or accept a numeric id directly.
 *
 * Supported URL shapes:
 *   https://app.clickup.com/12345/v/li/678
 *   https://app.clickup.com/12345/v/l/678
 *   https://app.clickup.com/12345/l/678
 *   https://app.clickup.com/12345/v/li/678/t/abc123  (list inferred from a task URL)
 */
export function parseClickUpListId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const liMatch = trimmed.match(/\/(?:v\/)?(?:li|l)\/(\d+)/);
  if (liMatch?.[1]) return liMatch[1];
  if (/^\d+$/.test(trimmed)) return trimmed;
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Task fetching + field mapping
// ────────────────────────────────────────────────────────────────────────────

interface ClickUpUser {
  id: number;
  username?: string;
  email?: string;
}

interface ClickUpStatus {
  status: string;
  type?: 'open' | 'custom' | 'closed' | 'done';
}

interface ClickUpTask {
  id: string;
  name: string;
  description?: string;
  text_content?: string;
  status?: ClickUpStatus;
  priority?: { priority: 'urgent' | 'high' | 'normal' | 'low' } | null;
  due_date?: string | null;
  date_closed?: string | null;
  assignees?: ClickUpUser[];
  tags?: { name: string }[];
  url?: string;
  /** Container the task currently lives in. ClickUp returns this on
   *  GET /task/{id} as well as in webhook payloads for created/moved events. */
  list?: { id: string; name?: string } | null;
}

export async function fetchClickUpTask(taskId: string): Promise<ClickUpTask> {
  return clickupRequest<ClickUpTask>(`/task/${encodeURIComponent(taskId)}`);
}

export interface ClickUpList {
  id: string;
  name: string;
  task_count?: number | null;
}

export async function fetchClickUpList(listId: string): Promise<ClickUpList> {
  return clickupRequest<ClickUpList>(`/list/${encodeURIComponent(listId)}`);
}

/**
 * Fetch every task in a list, paginating until exhausted (ClickUp returns up to
 * 100 tasks per page).
 */
export async function listTasksInList(
  listId: string,
  opts: { includeClosed?: boolean; subtasks?: boolean } = {},
): Promise<ClickUpTask[]> {
  const all: ClickUpTask[] = [];
  let page = 0;
  // Hard ceiling so a misconfigured list can't burn unbounded API budget.
  const MAX_PAGES = 50; // 5,000 tasks
  while (page < MAX_PAGES) {
    const params = new URLSearchParams({
      page: String(page),
      include_closed: String(Boolean(opts.includeClosed)),
      subtasks: String(Boolean(opts.subtasks)),
    });
    const res = await clickupRequest<{ tasks: ClickUpTask[] }>(
      `/list/${encodeURIComponent(listId)}/task?${params.toString()}`,
    );
    const batch = res.tasks ?? [];
    all.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return all;
}

/** Map a ClickUp status string to one of our TaskStatus enum values. */
export function mapClickUpStatus(s?: ClickUpStatus): TaskStatus {
  if (!s) return 'todo';
  if (s.type === 'closed' || s.type === 'done') return 'done';
  const norm = s.status.toLowerCase().trim();
  if (norm.includes('progress') || norm === 'doing' || norm === 'active') return 'in_progress';
  if (norm.includes('review') || norm === 'qa' || norm === 'qc') return 'in_review';
  if (norm.includes('block')) return 'blocked';
  if (norm === 'backlog') return 'backlog';
  if (norm === 'complete' || norm === 'closed' || norm === 'done') return 'done';
  return 'todo';
}

export function mapClickUpPriority(p?: ClickUpTask['priority']): TaskPriority {
  switch (p?.priority) {
    case 'urgent':
      return 'urgent';
    case 'high':
      return 'high';
    case 'low':
      return 'low';
    default:
      return 'medium';
  }
}

/** Convert a ClickUp due_date (ms epoch as string) to YYYY-MM-DD. */
function toIsoDate(epochMs?: string | null): string | undefined {
  if (!epochMs) return undefined;
  const n = Number(epochMs);
  if (!Number.isFinite(n)) return undefined;
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

function pickAssigneeEmail(assignees: ClickUpUser[] | undefined): string | undefined {
  if (!assignees || assignees.length === 0) return undefined;
  const first = assignees.find((a) => a.email && a.email.endsWith('@activeset.co')) ?? assignees[0];
  return first?.email?.toLowerCase();
}

/** Build the patch we apply to our Task when ClickUp sends an update. */
export function clickUpTaskToUpdate(task: ClickUpTask): UpdateTaskInput {
  const description = task.description?.trim() || task.text_content?.trim() || undefined;
  return {
    title: task.name,
    description,
    status: mapClickUpStatus(task.status),
    priority: mapClickUpPriority(task.priority),
    dueDate: toIsoDate(task.due_date),
    assignee: pickAssigneeEmail(task.assignees),
    tags: task.tags?.map((t) => t.name).filter(Boolean) ?? [],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Task creation
// ────────────────────────────────────────────────────────────────────────────

/** ClickUp priority numeric codes — 1=urgent, 2=high, 3=normal, 4=low. */
const PRIORITY_TO_CODE: Record<TaskPriority, 1 | 2 | 3 | 4> = {
  urgent: 1,
  high: 2,
  medium: 3,
  low: 4,
};

export interface CreateClickUpTaskInput {
  name: string;
  description?: string;
  /** Local priority — gets translated to ClickUp's numeric code. */
  priority?: TaskPriority;
  /** Tag names; tags must already exist at the space level. */
  tags?: string[];
  /** ISO YYYY-MM-DD; converted to ms epoch for the API. */
  dueDate?: string;
  /** ClickUp user IDs (numeric). Use the workspace member directory if unsure. */
  assigneeIds?: number[];
  /** Custom field values, keyed by field id. */
  customFields?: { id: string; value: unknown }[];
}

function isoDateToEpochMs(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  // ClickUp stores due dates as UTC midnight when only a date is given.
  const ms = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : undefined;
}

/** Create a task in a ClickUp list. Returns the new task with id + url so the
 *  caller can mirror it into the local `tasks` collection. */
export async function createClickUpTask(
  listId: string,
  input: CreateClickUpTaskInput,
): Promise<ClickUpTask> {
  const body: Record<string, unknown> = {
    name: input.name,
  };
  if (input.description) body.description = input.description;
  if (input.priority) body.priority = PRIORITY_TO_CODE[input.priority];
  if (input.tags && input.tags.length > 0) body.tags = input.tags;
  if (input.assigneeIds && input.assigneeIds.length > 0) body.assignees = input.assigneeIds;
  const dueMs = isoDateToEpochMs(input.dueDate);
  if (dueMs) body.due_date = dueMs;
  if (input.customFields && input.customFields.length > 0) {
    body.custom_fields = input.customFields;
  }

  return clickupRequest<ClickUpTask>(
    `/list/${encodeURIComponent(listId)}/task`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Webhook signature
// ────────────────────────────────────────────────────────────────────────────

/**
 * ClickUp signs each webhook delivery with HMAC-SHA256 of the raw request body
 * using the secret returned at webhook creation. Header: `X-Signature`.
 *
 * We compare with `timingSafeEqual` to avoid timing leaks.
 */
export function verifyClickUpSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const provided = signatureHeader.trim().toLowerCase();
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Webhook registration
// ────────────────────────────────────────────────────────────────────────────

export interface ClickUpWebhook {
  id: string;
  endpoint: string;
  events: string[];
  secret: string;
}

export const CLICKUP_TASK_EVENTS = [
  'taskCreated',
  'taskUpdated',
  'taskDeleted',
  'taskStatusUpdated',
  'taskPriorityUpdated',
  'taskAssigneeUpdated',
  'taskDueDateUpdated',
  'taskTagUpdated',
  'taskMoved',
] as const;

export async function listTeams(): Promise<{ id: string; name: string }[]> {
  const res = await clickupRequest<{ teams: { id: string; name: string }[] }>('/team');
  return res.teams;
}

export async function createWebhook(
  teamId: string,
  endpoint: string,
  events: readonly string[] = CLICKUP_TASK_EVENTS,
): Promise<ClickUpWebhook> {
  const res = await clickupRequest<{ webhook: ClickUpWebhook }>(
    `/team/${encodeURIComponent(teamId)}/webhook`,
    {
      method: 'POST',
      body: JSON.stringify({ endpoint, events }),
    },
  );
  return res.webhook;
}

export async function listWebhooks(teamId: string): Promise<ClickUpWebhook[]> {
  const res = await clickupRequest<{ webhooks: ClickUpWebhook[] }>(
    `/team/${encodeURIComponent(teamId)}/webhook`,
  );
  return res.webhooks;
}

export async function deleteWebhook(webhookId: string): Promise<void> {
  await clickupRequest(`/webhook/${encodeURIComponent(webhookId)}`, {
    method: 'DELETE',
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Webhook payload
// ────────────────────────────────────────────────────────────────────────────

export interface ClickUpWebhookPayload {
  event: string;
  task_id?: string;
  webhook_id?: string;
  history_items?: { field?: string; before?: unknown; after?: unknown }[];
}
