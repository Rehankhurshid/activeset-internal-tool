import { NextRequest, NextResponse } from 'next/server';
import { analyzeWithOllama } from '@/services/SchemaMarkupService';
import type { SchemaPageSignals } from '@/types/schema-markup';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface AnalyzeBody {
  signals?: SchemaPageSignals;
  model?: string;
}

export async function POST(request: NextRequest) {
  let body: AnalyzeBody;
  try {
    body = (await request.json()) as AnalyzeBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.signals || typeof body.signals !== 'object') {
    return NextResponse.json(
      { error: 'Missing "signals" in request body' },
      { status: 400 }
    );
  }

  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  const model = body.model || process.env.OLLAMA_MODEL || 'gemma4:e4b';

  try {
    const result = await analyzeWithOllama(body.signals, {
      model: body.model,
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    // Unwrap undici's wrapped cause for actionable errors.
    const cause =
      error instanceof Error && 'cause' in error && error.cause
        ? String((error.cause as { message?: string })?.message ?? error.cause)
        : undefined;
    const message =
      error instanceof Error ? error.message : 'Analysis failed';

    console.error('Schema analyze error:', { message, cause, baseUrl, model, error });

    const fullMessage = cause ? `${message} — ${cause}` : message;

    const hint =
      /fetch failed|ECONNREFUSED|ENOTFOUND|connect|timeout/i.test(fullMessage)
        ? `Could not reach Ollama at ${baseUrl} (model: ${model}). Confirm 'ollama serve' is running and the model is pulled ('ollama list').`
        : undefined;

    return NextResponse.json(
      { error: fullMessage, hint, baseUrl, model },
      { status: 500 }
    );
  }
}
