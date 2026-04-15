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

  try {
    const result = await analyzeWithOllama(body.signals, {
      model: body.model,
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Analysis failed';
    console.error('Schema analyze error:', error);

    const hint =
      /fetch failed|ECONNREFUSED|localhost:11434/i.test(message)
        ? 'Could not reach Ollama. Is it running? Try: ollama serve'
        : undefined;

    return NextResponse.json(
      { error: message, hint },
      { status: 500 }
    );
  }
}
