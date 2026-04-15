import { collection, doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  SchemaAnalysisDoc,
  SchemaAnalysisResult,
  SchemaPageSignals,
} from '@/types/schema-markup';

const SCHEMA_ANALYSES_COLLECTION = 'schema_analyses';

function sha1(text: string): string {
  // Simple, fast, deterministic 32-bit hash. Good enough for a cache key.
  let h1 = 0xdeadbeef ^ 0x9e3779b9;
  let h2 = 0x41c6ce57 ^ 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export function computeContentHash(signals: SchemaPageSignals): string {
  return sha1(
    JSON.stringify({
      t: signals.title,
      d: signals.metaDescription,
      h1: signals.h1,
      h2: signals.h2,
      m: signals.mainText.slice(0, 2000),
      j: signals.existingJsonLd,
    })
  );
}

/** Strip tags, scripts, styles, and collapse whitespace. */
function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickAttr(tag: string, attr: string): string | null {
  const re = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, 'i');
  const m = tag.match(re);
  return m ? m[1] : null;
}

function pickMeta(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)\\s*=\\s*"${name}"[^>]*>`,
    'i'
  );
  const tag = html.match(re)?.[0];
  return tag ? pickAttr(tag, 'content') : null;
}

function pickTags(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const out: string[] = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = extractText(m[1]);
    if (text) out.push(text);
  }
  return out;
}

function extractJsonLd(html: string): Record<string, unknown>[] {
  const re =
    /<script[^>]+type\s*=\s*"application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  const out: Record<string, unknown>[] = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object') out.push(item);
        }
      } else if (parsed && typeof parsed === 'object') {
        out.push(parsed);
      }
    } catch {
      // Skip invalid JSON-LD.
    }
  }
  return out;
}

function extractImages(html: string): Array<{ src: string; alt: string | null }> {
  const re = /<img\b[^>]*>/gi;
  const out: Array<{ src: string; alt: string | null }> = [];
  let m;
  while ((m = re.exec(html)) !== null && out.length < 25) {
    const tag = m[0];
    const src = pickAttr(tag, 'src');
    if (src) out.push({ src, alt: pickAttr(tag, 'alt') });
  }
  return out;
}

/** Fetch the live URL and distill it into structured signals for the model. */
export async function scrapePageSignals(url: string): Promise<SchemaPageSignals> {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent':
        'Mozilla/5.0 (compatible; SchemaMarkupBot/1.0; +https://activeset.co)',
      accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();

  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? extractText(titleMatch[1]) : null;

  const metaDescription =
    pickMeta(html, 'description') || pickMeta(html, 'og:description');

  const h1 = pickTags(html, 'h1').slice(0, 10);
  const h2 = pickTags(html, 'h2').slice(0, 20);

  const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i);
  const mainText = extractText(bodyMatch ? bodyMatch[0] : html).slice(0, 4000);

  return {
    url,
    title,
    metaDescription,
    h1,
    h2,
    mainText,
    images: extractImages(html),
    existingJsonLd: extractJsonLd(html),
  };
}

function buildPrompt(signals: SchemaPageSignals): string {
  return `You are an SEO expert specializing in Schema.org structured data (JSON-LD).

Analyze the page below and return ONLY a JSON object (no prose, no markdown fences) matching this exact shape:

{
  "pageType": "article|product|localbusiness|faq|howto|event|organization|webpage|other",
  "summary": "1-2 sentence description of the page and what schema strategy you recommend",
  "existing": [
    { "type": "SchemaType", "raw": { ... echo back the existing JSON-LD ... }, "issues": ["specific problem 1", "..."] }
  ],
  "recommended": [
    {
      "type": "SchemaType",
      "reason": "why this applies to this page",
      "confidence": "high|medium|low",
      "jsonLd": { "@context": "https://schema.org", "@type": "...", ... }
    }
  ]
}

Rules:
- Use real values from the page, not placeholders, whenever possible.
- Include BreadcrumbList only if navigation is clearly inferable.
- Do not invent prices, ratings, or reviews.
- Prefer fewer, high-quality recommendations over many weak ones.
- Each recommended jsonLd must be a valid standalone Schema.org object with @context and @type.

PAGE DATA:
URL: ${signals.url}
Title: ${signals.title ?? '(none)'}
Meta description: ${signals.metaDescription ?? '(none)'}
H1: ${JSON.stringify(signals.h1)}
H2: ${JSON.stringify(signals.h2)}
Images: ${JSON.stringify(signals.images.slice(0, 8))}
Existing JSON-LD: ${JSON.stringify(signals.existingJsonLd)}
Main text (truncated): ${signals.mainText}
`;
}

export interface AnalyzeOptions {
  baseUrl?: string;
  model?: string;
  signal?: AbortSignal;
}

/** Call Ollama's /api/generate with JSON mode and parse the response. */
export async function analyzeWithOllama(
  signals: SchemaPageSignals,
  opts: AnalyzeOptions = {}
): Promise<SchemaAnalysisResult> {
  const baseUrl =
    opts.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model = opts.model || process.env.OLLAMA_MODEL || 'gemma3:latest';

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: opts.signal,
    body: JSON.stringify({
      model,
      prompt: buildPrompt(signals),
      stream: false,
      format: 'json',
      options: { temperature: 0.2 },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Ollama request failed (${res.status}): ${body || res.statusText}`
    );
  }

  const payload = (await res.json()) as { response?: string };
  const raw = payload.response?.trim() ?? '';

  if (!raw) {
    throw new Error('Ollama returned an empty response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Occasionally models wrap JSON in ```json fences; strip and retry.
    const stripped = raw
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();
    parsed = JSON.parse(stripped);
  }

  return normalizeResult(parsed);
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

// --- Firestore cache -------------------------------------------------------

function cacheId(pageId: string, contentHash: string): string {
  return `${pageId}_${contentHash}`;
}

export async function getCachedAnalysis(
  pageId: string,
  contentHash: string
): Promise<SchemaAnalysisDoc | null> {
  const ref = doc(
    collection(db, SCHEMA_ANALYSES_COLLECTION),
    cacheId(pageId, contentHash)
  );
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as SchemaAnalysisDoc;
}

export async function saveCachedAnalysis(
  entry: Omit<SchemaAnalysisDoc, 'createdAt'>
): Promise<void> {
  const ref = doc(
    collection(db, SCHEMA_ANALYSES_COLLECTION),
    cacheId(entry.pageId, entry.contentHash)
  );
  await setDoc(ref, {
    ...entry,
    createdAt: Timestamp.now().toMillis(),
  });
}

export const schemaMarkupService = {
  scrapePageSignals,
  analyzeWithOllama,
  computeContentHash,
  getCachedAnalysis,
  saveCachedAnalysis,
};
