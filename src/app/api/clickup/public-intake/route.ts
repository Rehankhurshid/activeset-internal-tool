import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { generateObject } from 'ai';
import {
  buildClickUpTaskUrl,
  ClickUpError,
  createClickUpTask,
} from '@/lib/clickup';
import {
  db as adminDb,
  hasFirebaseAdminCredentials,
} from '@/lib/firebase-admin';
import { isValidIntakeTokenShape } from '@/lib/intake-token';
import { COLLECTIONS } from '@/lib/constants';
import {
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  type IntakeSubmissionPayload,
  type IntakeSubmissionResponse,
  type ParsedTaskSuggestion,
  type Project,
  type TaskCategory,
  type TaskPriority,
} from '@/types';

export const runtime = 'nodejs';
// Budget for the AI parse + sequential ClickUp creates on a bundled list.
export const maxDuration = 90;

const PROJECTS_COLLECTION = COLLECTIONS.PROJECTS;
const TASKS_COLLECTION = COLLECTIONS.TASKS;
const REQUESTS_COLLECTION = COLLECTIONS.REQUESTS;

const MAX_MESSAGE_CHARS = 20_000;
const MAX_TASKS_PER_SUBMISSION = 25;
const DEFAULT_MODEL = process.env.PROPOSAL_AI_MODEL || 'google/gemini-2.5-flash';

const submissionSchema = z.object({
  token: z.string().min(8).max(256),
  payload: z.object({
    requesterName: z.string().trim().min(1).max(120),
    requesterEmail: z.string().trim().email().max(160).optional().or(z.literal('')),
    message: z.string().trim().min(3).max(MAX_MESSAGE_CHARS),
    referenceUrl: z.string().trim().url().max(500).optional().or(z.literal('')),
    isList: z.boolean().optional(),
    urgency: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    deadline: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u, 'deadline must be YYYY-MM-DD')
      .optional()
      .or(z.literal('')),
  }),
});

const parsedSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().optional(),
        category: z.enum(TASK_CATEGORIES as unknown as [string, ...string[]]),
        priority: z.enum(TASK_PRIORITIES as unknown as [string, ...string[]]),
      }),
    )
    .max(MAX_TASKS_PER_SUBMISSION),
});

const SYSTEM_PROMPT = `You split informal client change-request messages into a structured list of trackable tasks.

Return JSON: { "tasks": [{ "title": "Imperative phrase under 80 chars", "description": "Optional 1-2 line context", "category": "fix|feature|copy|design|bug|content|other", "priority": "low|medium|high|urgent" }] }

RULES:
1. ONE concrete ask per task. A 5-bullet list = 5 tasks.
2. Skip greetings, sign-offs, conversational filler.
3. Title MUST start with a verb (Fix, Add, Update, Remove, Hide, Align, Localize, etc).
4. Priority defaults to medium unless the sender signals urgency (ASAP/blocker/today → high|urgent) or "nice-to-have" → low.
5. Preserve specific names, page sections, and copy from the source — they're load-bearing.`;

interface ProjectLookup {
  id: string;
  data: Project;
}

async function findProjectByIntakeToken(token: string): Promise<ProjectLookup | null> {
  const snap = await adminDb
    .collection(PROJECTS_COLLECTION)
    .where('intakeToken', '==', token)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, data: doc.data() as Project };
}

async function parseMessageIntoTasks(
  message: string,
  isList: boolean | undefined,
  fallbackUrgency: IntakeSubmissionPayload['urgency'] | undefined,
): Promise<ParsedTaskSuggestion[]> {
  // For a single-task hint, skip the AI hop and ship as-is. The AI is only
  // useful for splitting bundled lists; running it on every short request
  // wastes budget and adds latency.
  if (isList === false || message.length < 80) {
    const firstLine = message.split('\n').find((l) => l.trim().length > 0) ?? message;
    return [
      {
        title: firstLine.trim().slice(0, 200),
        description: message.length > firstLine.length ? message : undefined,
        category: 'other' as TaskCategory,
        priority: (fallbackUrgency ?? 'medium') as TaskPriority,
      },
    ];
  }

  try {
    const { object } = await generateObject({
      model: DEFAULT_MODEL,
      schema: parsedSchema,
      prompt: `${SYSTEM_PROMPT}\n\nMESSAGE:\n${message.slice(0, MAX_MESSAGE_CHARS)}`,
      temperature: 0.2,
    });
    return object.tasks
      .filter((t) => t.title.trim().length > 0)
      .slice(0, MAX_TASKS_PER_SUBMISSION)
      .map((t) => ({
        title: t.title.trim().slice(0, 200),
        description: t.description?.trim() || undefined,
        category: t.category as TaskCategory,
        priority: t.priority as TaskPriority,
      }));
  } catch (err) {
    console.warn('[public-intake] AI parse failed, falling back to single-task:', err);
    return [
      {
        title: message.split('\n')[0].trim().slice(0, 200),
        description: message,
        category: 'other' as TaskCategory,
        priority: (fallbackUrgency ?? 'medium') as TaskPriority,
      },
    ];
  }
}

interface CreatedTaskRecord {
  clickupTaskId: string;
  clickupUrl: string;
  localTaskId: string;
}

async function createClickUpTaskWithLocalMirror(
  projectId: string,
  listId: string,
  suggestion: ParsedTaskSuggestion,
  context: {
    requesterName: string;
    requesterEmail?: string;
    referenceUrl?: string;
    requestId: string;
    deadline?: string;
  },
  orderSeed: number,
): Promise<CreatedTaskRecord> {
  const description = [
    suggestion.description?.trim(),
    '',
    '---',
    `Submitted via public intake by **${context.requesterName}**${
      context.requesterEmail ? ` (${context.requesterEmail})` : ''
    }`,
    context.referenceUrl ? `Reference: ${context.referenceUrl}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const created = await createClickUpTask(listId, {
    name: suggestion.title,
    description,
    priority: suggestion.priority,
    dueDate: context.deadline,
    tags: ['intake', `intake:${suggestion.category}`],
  });

  const url = created.url ?? buildClickUpTaskUrl(created.id);
  const now = Timestamp.now();

  // Mirror to the local tasks collection so the rest of the dashboard sees it
  // immediately, without waiting for the next webhook delivery.
  const taskRef = adminDb.collection(TASKS_COLLECTION).doc();
  await taskRef.set({
    projectId,
    requestId: context.requestId,
    title: suggestion.title,
    description: suggestion.description,
    category: suggestion.category,
    status: 'todo',
    priority: suggestion.priority,
    dueDate: context.deadline || undefined,
    tags: ['intake'],
    source: 'intake',
    sourceLink: context.referenceUrl,
    assignee: undefined,
    order: orderSeed,
    clickupTaskId: created.id,
    clickupUrl: url,
    clickupSyncedAt: now,
    createdAt: now,
    updatedAt: now,
    createdBy: context.requesterEmail || 'public-intake',
  });

  return { clickupTaskId: created.id, clickupUrl: url, localTaskId: taskRef.id };
}

export async function POST(request: NextRequest) {
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  let parsed: z.infer<typeof submissionSchema>;
  try {
    const json = await request.json();
    parsed = submissionSchema.parse(json);
  } catch (err) {
    const issues = err instanceof z.ZodError ? err.issues.map((i) => i.message) : [];
    return NextResponse.json(
      { error: 'Invalid submission', details: issues.length ? issues : undefined },
      { status: 400 },
    );
  }

  const token = parsed.token.trim();
  if (!isValidIntakeTokenShape(token)) {
    return NextResponse.json({ error: 'Invalid intake token' }, { status: 400 });
  }

  const project = await findProjectByIntakeToken(token);
  if (!project) {
    return NextResponse.json({ error: 'Intake link is invalid or has been disabled' }, { status: 404 });
  }
  if (project.data.intakeEnabled === false) {
    return NextResponse.json({ error: 'Intake link is disabled' }, { status: 403 });
  }

  const payload = parsed.payload;
  const requesterEmail = payload.requesterEmail?.trim() || undefined;
  const referenceUrl = payload.referenceUrl?.trim() || undefined;
  const deadline = payload.deadline?.trim() || undefined;

  const now = Timestamp.now();

  // Always stage the raw submission as a `requests` blob first — even when we
  // immediately auto-create tasks, the blob is the audit trail back to the
  // original message.
  const requestRef = adminDb.collection(REQUESTS_COLLECTION).doc();
  await requestRef.set({
    projectId: project.id,
    rawText: payload.message,
    source: 'intake',
    sender: requesterEmail
      ? `${payload.requesterName} <${requesterEmail}>`
      : payload.requesterName,
    receivedAt: now,
    status: 'new',
    taskIds: [],
    createdBy: 'public-intake',
    intakeMeta: {
      isList: Boolean(payload.isList),
      urgency: payload.urgency,
      deadline,
      referenceUrl,
    },
  });

  const autoCreate =
    project.data.intakeAutoCreate === true && Boolean(project.data.clickupListId);

  if (!autoCreate) {
    // Stage-only path: operator triages from the command center.
    const response: IntakeSubmissionResponse = {
      success: true,
      requestId: requestRef.id,
      tasksCreated: 0,
      taskUrls: [],
      message:
        'Thanks — your request has been logged. We will triage it and get back to you with timing.',
    };
    return NextResponse.json(response);
  }

  const suggestions = await parseMessageIntoTasks(
    payload.message,
    payload.isList,
    payload.urgency,
  );

  const created: CreatedTaskRecord[] = [];
  const errors: string[] = [];
  let orderSeed = Date.now();
  for (const suggestion of suggestions) {
    try {
      const record = await createClickUpTaskWithLocalMirror(
        project.id,
        project.data.clickupListId!,
        suggestion,
        {
          requesterName: payload.requesterName,
          requesterEmail,
          referenceUrl,
          requestId: requestRef.id,
          deadline,
        },
        orderSeed++,
      );
      created.push(record);
    } catch (err) {
      const message =
        err instanceof ClickUpError
          ? `${err.status ?? 502}: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'unknown error';
      errors.push(`"${suggestion.title}" — ${message}`);
    }
  }

  await requestRef.update({
    status: 'parsed',
    parsedAt: Timestamp.now(),
    taskIds: created.map((c) => c.localTaskId),
    parseErrors: errors.length > 0 ? errors : undefined,
  });

  const response: IntakeSubmissionResponse = {
    success: true,
    requestId: requestRef.id,
    tasksCreated: created.length,
    taskUrls: created.map((c) => c.clickupUrl),
    message:
      created.length === 0
        ? errors.length > 0
          ? `We received your request but ran into errors creating tasks: ${errors.join('; ')}`
          : 'Thanks — your request has been logged for triage.'
        : created.length === 1
          ? `Thanks — task created and assigned for review.`
          : `Thanks — ${created.length} tasks created and assigned for review.`,
  };
  return NextResponse.json(response);
}
