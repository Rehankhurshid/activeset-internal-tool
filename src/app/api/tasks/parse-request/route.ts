import { NextRequest, NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { z } from 'zod';
import {
  ApiAuthError,
  apiAuthErrorResponse,
  requireProjectAccess,
} from '@/lib/api-auth';
import {
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  type ParsedTaskSuggestion,
} from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DEFAULT_MODEL = process.env.PROPOSAL_AI_MODEL || 'google/gemini-2.5-flash';

// Cap input size to protect against runaway prompts.
const MAX_INPUT_CHARS = 20_000;
// Hard ceiling on suggestions returned, regardless of what the model says.
const MAX_SUGGESTIONS = 25;

const taskSuggestionSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().optional(),
        category: z.enum(TASK_CATEGORIES as unknown as [string, ...string[]]),
        priority: z.enum(TASK_PRIORITIES as unknown as [string, ...string[]]),
      }),
    )
    .max(MAX_SUGGESTIONS),
});

const SYSTEM_PROMPT = `You are an assistant that splits informal client change-request messages (from Slack, email, or pasted text) into a structured list of discrete, trackable tasks.

A bundled message often contains many distinct asks across categories: bug fixes, new features, copy/content updates, design tweaks, navbar changes, localization, etc. Your job is to extract each independent ask as a separate task.

Return a JSON object with this exact shape:
{
  "tasks": [
    {
      "title": "Short imperative phrase, under 80 chars (e.g. 'Fix footer social icons in dark mode')",
      "description": "Optional: 1-2 sentences with extra context from the source message. Omit if title is self-explanatory.",
      "category": "fix" | "feature" | "copy" | "design" | "bug" | "content" | "other",
      "priority": "low" | "medium" | "high" | "urgent"
    }
  ]
}

STRICT RULES:
1. ONE concrete ask per task. If the message lists 5 fixes, return 5 tasks — do not combine them.
2. Skip greetings, sign-offs, status updates, and conversational filler. Only output actionable items.
3. Pick the closest category. Use "other" only as a last resort.
4. Default priority is "medium" unless the sender explicitly signals urgency ("ASAP", "blocker", "today") → "high"/"urgent", or marks something as nice-to-have → "low".
5. Title MUST start with a verb (Fix, Add, Update, Remove, Hide, Align, Link, Localize, etc.).
6. Preserve any specific names, page sections, or copy mentioned in the source — these are usually load-bearing.`;

function sanitizeSuggestions(
  raw: z.infer<typeof taskSuggestionSchema>,
): ParsedTaskSuggestion[] {
  const cleaned: ParsedTaskSuggestion[] = [];
  for (const item of raw.tasks) {
    const title = item.title.trim();
    if (!title) continue;
    const description = item.description?.trim();
    cleaned.push({
      title: title.slice(0, 200),
      description: description ? description : undefined,
      category: item.category as ParsedTaskSuggestion['category'],
      priority: item.priority as ParsedTaskSuggestion['priority'],
    });
    if (cleaned.length >= MAX_SUGGESTIONS) break;
  }
  return cleaned;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { rawText?: string; projectId?: string; sender?: string }
      | null;
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const projectId = (body.projectId || '').trim();
    const rawText = (body.rawText || '').trim();

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    if (!rawText) {
      return NextResponse.json(
        { error: 'rawText is required' },
        { status: 400 },
      );
    }

    await requireProjectAccess(request, projectId);

    const truncated = rawText.slice(0, MAX_INPUT_CHARS);

    const prompt = `${SYSTEM_PROMPT}

SENDER: ${body.sender || 'unknown'}

MESSAGE:
${truncated}`;

    const { object } = await generateObject({
      model: DEFAULT_MODEL,
      schema: taskSuggestionSchema,
      prompt,
      temperature: 0.2,
    });

    const suggestions = sanitizeSuggestions(object);
    if (suggestions.length === 0) {
      return NextResponse.json({
        success: true,
        suggestions: [],
        warning: 'No actionable tasks detected in the message.',
      });
    }

    return NextResponse.json({ success: true, suggestions });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return apiAuthErrorResponse(error);
    }
    const message = error instanceof Error ? error.message : 'Unexpected error';
    console.error('[parse-request] generateObject failed:', message);
    return NextResponse.json(
      { error: 'AI task parsing failed', details: message },
      { status: 502 },
    );
  }
}
