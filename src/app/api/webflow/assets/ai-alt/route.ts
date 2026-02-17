import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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

    if (!GEMINI_API_KEY) {
      const fallbackSuggestions = targetAssets.map((asset) => ({
        id: asset.id,
        altText: fallbackAltText(asset),
        reason: 'Generated from filename because AI key is not configured.',
      }));
      return NextResponse.json({ success: true, data: { suggestions: fallbackSuggestions } });
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

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: [
        {
          role: 'user',
          parts: [{ text: systemPrompt }, { text: userPrompt }],
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const generatedText = response.text;
    if (!generatedText) {
      throw new Error('AI did not return suggestions');
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
