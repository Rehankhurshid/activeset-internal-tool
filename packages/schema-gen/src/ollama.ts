import type { SchemaAnalysisResult, SchemaPageSignals } from './types';

function buildPrompt(signals: SchemaPageSignals): string {
  return `You are an SEO expert specializing in Schema.org structured data (JSON-LD).

Return ONLY a JSON object (no prose, no markdown fences):

{
  "pageType": "article|product|localbusiness|faq|howto|event|organization|webpage|other",
  "summary": "1-2 sentence description",
  "existing": [{ "type": "SchemaType", "raw": { ... }, "issues": ["..."] }],
  "recommended": [
    {
      "type": "SchemaType",
      "reason": "why this applies",
      "confidence": "high|medium|low",
      "jsonLd": { "@context": "https://schema.org", "@type": "...", ... }
    }
  ]
}

Rules: use real page values, do not invent ratings/prices, each jsonLd must be standalone Schema.org JSON-LD.

PAGE DATA:
URL: ${signals.url}
Title: ${signals.title ?? '(none)'}
Meta description: ${signals.metaDescription ?? '(none)'}
H1: ${JSON.stringify(signals.h1)}
H2: ${JSON.stringify(signals.h2)}
Images: ${JSON.stringify(signals.images.slice(0, 8))}
Existing JSON-LD: ${JSON.stringify(signals.existingJsonLd)}
Main text: ${signals.mainText}
`;
}

function normalizeResult(raw: unknown): SchemaAnalysisResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const existing = Array.isArray(obj.existing) ? obj.existing : [];
  const recommended = Array.isArray(obj.recommended) ? obj.recommended : [];

  return {
    pageType: typeof obj.pageType === 'string' ? obj.pageType : 'webpage',
    summary: typeof obj.summary === 'string' ? obj.summary : undefined,
    existing: existing.map((e) => {
      const item = (e ?? {}) as Record<string, unknown>;
      return {
        type: typeof item.type === 'string' ? item.type : 'Unknown',
        raw: (item.raw as Record<string, unknown>) ?? {},
        issues: Array.isArray(item.issues)
          ? (item.issues as unknown[]).filter(
              (s): s is string => typeof s === 'string'
            )
          : [],
      };
    }),
    recommended: recommended.map((r) => {
      const item = (r ?? {}) as Record<string, unknown>;
      const conf = item.confidence;
      return {
        type: typeof item.type === 'string' ? item.type : 'Thing',
        reason: typeof item.reason === 'string' ? item.reason : '',
        confidence:
          conf === 'high' || conf === 'medium' || conf === 'low'
            ? conf
            : 'medium',
        jsonLd: (item.jsonLd as Record<string, unknown>) ?? {},
      };
    }),
  };
}

export interface OllamaOptions {
  baseUrl: string;
  model: string;
}

export async function runOllama(
  signals: SchemaPageSignals,
  opts: OllamaOptions
): Promise<SchemaAnalysisResult> {
  let res: Response;
  try {
    res = await fetch(`${opts.baseUrl.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: opts.model,
        prompt: buildPrompt(signals),
        stream: false,
        format: 'json',
        options: {
          temperature: 0.2,
          // Ollama defaults: num_ctx=2048, num_predict=-1 (but effectively
          // small for some model/runtime combos). Long pages blow past both,
          // which produces truncated JSON that fails to parse.
          num_ctx: 8192,
          num_predict: 4096,
        },
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot reach Ollama at ${opts.baseUrl} (${msg}). Start it with: ollama serve`
    );
  }

  if (!res.ok) {
    throw new Error(
      `Ollama returned ${res.status}: ${await res.text().catch(() => res.statusText)}. ` +
        `Pull the model first: ollama pull ${opts.model}`
    );
  }

  const payload = (await res.json()) as { response?: string };
  const raw = payload.response?.trim() ?? '';
  if (!raw) throw new Error('Ollama returned an empty response');

  const stripped = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();

  // 1. Straight parse.
  try {
    return normalizeResult(JSON.parse(stripped));
  } catch {}

  // 2. Best-effort repair: model ran out of tokens mid-object, so close
  //    unterminated strings and balance the brace/bracket stack.
  try {
    return normalizeResult(JSON.parse(repairTruncatedJson(stripped)));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const preview = stripped.length > 200 ? stripped.slice(0, 200) + '…' : stripped;
    throw new Error(
      `Ollama returned malformed JSON (${msg}). ` +
        `This usually means the output was truncated mid-object — try a smaller page ` +
        `or a smaller model, or increase num_predict in ollama.ts. Preview: ${preview}`
    );
  }
}

/**
 * Close unterminated strings/arrays/objects so a partially-generated JSON
 * blob parses. Drops trailing commas. Best-effort only — the repaired output
 * may still be semantically incomplete, but normalizeResult tolerates
 * missing fields.
 */
function repairTruncatedJson(s: string): string {
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  let lastNonWs = -1;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
    } else if (!inString) {
      if (ch === '{' || ch === '[') stack.push(ch);
      else if (ch === '}' && stack[stack.length - 1] === '{') stack.pop();
      else if (ch === ']' && stack[stack.length - 1] === '[') stack.pop();
      if (!/\s/.test(ch)) lastNonWs = i;
    } else {
      if (!/\s/.test(ch)) lastNonWs = i;
    }
  }

  let out = s;
  if (inString) out += '"';
  // Strip trailing `,` before we start closing — e.g. `[1, 2,` → `[1, 2`.
  if (lastNonWs >= 0 && out[lastNonWs] === ',') {
    out = out.slice(0, lastNonWs) + out.slice(lastNonWs + 1);
  }
  // Close remaining open containers in LIFO order.
  while (stack.length) {
    const open = stack.pop();
    out += open === '{' ? '}' : ']';
  }
  return out;
}
