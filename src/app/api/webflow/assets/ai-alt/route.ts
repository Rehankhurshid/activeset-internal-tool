import { NextRequest, NextResponse } from 'next/server';

// Local Ollama (Gemma 4 by default). Same pattern as the Proposal module.
// Override host/model via OLLAMA_HOST / OLLAMA_MODEL env vars.
const OLLAMA_HOST = (process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:e4b';
const OLLAMA_TIMEOUT_MS = 180_000;

type AssetInput = {
  id: string;
  displayName?: string;
  originalFileName?: string;
  hostedUrl?: string;
  altText?: string | null;
};

type PageContextInput = {
  title?: string;
  slug?: string;
  publishedPath?: string;
  seo?: {
    title?: string;
    description?: string;
  };
};

function cleanFileName(name: string): string {
  return name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toSentenceCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function fallbackAltText(asset: AssetInput): string {
  const base = cleanFileName(asset.displayName || asset.originalFileName || 'image');
  const humanized = toSentenceCase(base || 'Image');
  return humanized.length > 125 ? `${humanized.slice(0, 122)}...` : humanized;
}

function normalizeAltText(value: string): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  return trimmed.length > 125 ? `${trimmed.slice(0, 122)}...` : trimmed;
}

async function callOllama(prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), OLLAMA_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        format: 'json',
        think: false,
        options: { temperature: 0.2, num_ctx: 32768, num_predict: 8192 },
      }),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === 'AbortError' || err.message === 'timeout')) {
      throw new Error(`Ollama timed out after ${Math.round(OLLAMA_TIMEOUT_MS / 1000)}s`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot reach Ollama at ${OLLAMA_HOST} (${msg})`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ollama returned ${res.status}: ${body.slice(0, 200) || res.statusText}`);
  }

  const payload = (await res.json()) as { response?: string };
  const raw = payload.response?.trim() ?? '';
  if (!raw) throw new Error('Ollama returned an empty response');
  return raw;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const assets: AssetInput[] = Array.isArray(body.assets) ? body.assets : [];
    const pages: PageContextInput[] = Array.isArray(body.pages) ? body.pages : [];
    const mode: 'missing_only' | 'all' = body.mode === 'all' ? 'all' : 'missing_only';

    if (!assets.length) {
      return NextResponse.json({ error: 'At least one asset is required' }, { status: 400 });
    }

    const targetAssets = assets
      .filter((asset) => (mode === 'all' ? true : !asset.altText || !asset.altText.trim()))
      .slice(0, 200);

    if (!targetAssets.length) {
      return NextResponse.json({ success: true, data: { suggestions: [] } });
    }

    const compactPageContext = pages.slice(0, 40).map((page) => ({
      title: page.title || '',
      slug: page.slug || page.publishedPath || '',
      seoTitle: page.seo?.title || '',
      seoDescription: page.seo?.description || '',
    }));

    const compactAssetContext = targetAssets.map((asset) => ({
      id: asset.id,
      displayName: asset.displayName || '',
      originalFileName: asset.originalFileName || '',
      currentAltText: asset.altText || '',
      hostedUrl: asset.hostedUrl || '',
    }));

    const systemPrompt = `You are an accessibility specialist creating concise ALT text for website images.

Return ONLY JSON in this exact format:
{
  "suggestions": [
    {
      "id": "asset id",
      "altText": "descriptive alt text",
      "reason": "short rationale"
    }
  ]
}

Rules:
1. Use site/page context to infer terminology and brand language.
2. Keep alt text concise (5-18 words), descriptive, and factual.
3. Do not start with "image of" or "picture of".
4. If image appears decorative, return altText as "".
5. No marketing fluff, emojis, or punctuation spam.
6. Return exactly one suggestion for each asset id provided.`;

    const userPrompt = `Page context:\n${JSON.stringify(compactPageContext)}\n\nAssets to caption:\n${JSON.stringify(compactAssetContext)}`;

    let generatedText: string;
    try {
      generatedText = await callOllama(`${systemPrompt}\n\n${userPrompt}`);
    } catch (err) {
      console.error('Ollama ALT generation failed, falling back to filenames:', err);
      const fallbackSuggestions = targetAssets.map((asset) => ({
        id: asset.id,
        altText: fallbackAltText(asset),
        reason: `Generated from filename — ${err instanceof Error ? err.message : 'AI unavailable'}.`,
      }));
      return NextResponse.json({ success: true, data: { suggestions: fallbackSuggestions } });
    }

    let parsed: { suggestions?: Array<{ id?: string; altText?: string; reason?: string }> };
    try {
      parsed = JSON.parse(generatedText);
    } catch {
      const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    }

    const suggestedById = new Map<string, { altText: string; reason?: string }>();
    for (const suggestion of parsed.suggestions || []) {
      const id = suggestion.id || '';
      const altText = normalizeAltText(suggestion.altText || '');
      if (id && altText !== undefined) {
        suggestedById.set(id, {
          altText,
          reason: suggestion.reason,
        });
      }
    }

    const suggestions = targetAssets.map((asset) => {
      const suggested = suggestedById.get(asset.id);
      if (!suggested) {
        return {
          id: asset.id,
          altText: fallbackAltText(asset),
          reason: 'Generated from filename as AI fallback.',
        };
      }

      return {
        id: asset.id,
        altText: suggested.altText,
        reason: suggested.reason,
      };
    });

    return NextResponse.json({ success: true, data: { suggestions } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error generating ALT text';
    console.error('Webflow AI ALT generation error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
