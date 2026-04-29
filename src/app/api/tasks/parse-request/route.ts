import { NextRequest, NextResponse } from 'next/server';
import {
  ApiAuthError,
  apiAuthErrorResponse,
  requireProjectAccess,
} from '@/lib/api-auth';
import {
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  type ParsedTaskSuggestion,
  type TaskCategory,
  type TaskPriority,
} from '@/types';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Cap input size — Gemini can handle more, but a single Slack message rarely
// exceeds this and capping protects us from runaway prompts.
const MAX_INPUT_CHARS = 20_000;
// Hard ceiling on suggestions returned, regardless of what the model says.
const MAX_SUGGESTIONS = 25;

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
6. Preserve any specific names, page sections, or copy mentioned in the source — these are usually load-bearing.
7. Output ONLY the JSON object. No prose, no markdown fences.`;

function isValidCategory(value: unknown): value is TaskCategory {
  return typeof value === 'string' && (TASK_CATEGORIES as readonly string[]).includes(value);
}

function isValidPriority(value: unknown): value is TaskPriority {
  return typeof value === 'string' && (TASK_PRIORITIES as readonly string[]).includes(value);
}

function sanitizeSuggestions(raw: unknown): ParsedTaskSuggestion[] {
  if (!raw || typeof raw !== 'object') return [];
  const list = (raw as { tasks?: unknown }).tasks;
  if (!Array.isArray(list)) return [];

  const cleaned: ParsedTaskSuggestion[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const title = typeof obj.title === 'string' ? obj.title.trim() : '';
    if (!title) continue;
    cleaned.push({
      title: title.slice(0, 200),
      description:
        typeof obj.description === 'string' && obj.description.trim()
          ? obj.description.trim()
          : undefined,
      category: isValidCategory(obj.category) ? obj.category : 'other',
      priority: isValidPriority(obj.priority) ? obj.priority : 'medium',
    });
    if (cleaned.length >= MAX_SUGGESTIONS) break;
  }
  return cleaned;
}

export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'Gemini API key not configured.' },
        { status: 500 },
      );
    }

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

    // Auth + project ownership check (matches existing routes).
    await requireProjectAccess(request, projectId);

    const truncated = rawText.slice(0, MAX_INPUT_CHARS);

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: [
        {
          role: 'user',
          parts: [
            { text: SYSTEM_PROMPT },
            {
              text: `SENDER: ${body.sender || 'unknown'}\n\nMESSAGE:\n${truncated}`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const generated = response.text;
    if (!generated) {
      return NextResponse.json(
        { error: 'AI returned no response' },
        { status: 502 },
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(generated);
    } catch {
      console.error('[parse-request] failed to JSON.parse model output:', generated);
      return NextResponse.json(
        { error: 'AI response was not valid JSON. Try again or paste a shorter message.' },
        { status: 502 },
      );
    }

    const suggestions = sanitizeSuggestions(parsed);
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
    console.error('[parse-request] error:', error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
