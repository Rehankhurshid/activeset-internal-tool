'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  computeContentHash,
  getCachedAnalysis,
  saveCachedAnalysis,
} from '@/services/SchemaMarkupService';
import type {
  SchemaAnalysisResult,
  SchemaPageSignals,
} from '@/types/schema-markup';

const OLLAMA_BASE_URL =
  (typeof process !== 'undefined' &&
    process.env.NEXT_PUBLIC_OLLAMA_BASE_URL) ||
  'http://127.0.0.1:11434';
const OLLAMA_MODEL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_OLLAMA_MODEL) ||
  'gemma4:e4b';

function buildPrompt(signals: SchemaPageSignals): string {
  return `You are an SEO expert specializing in Schema.org structured data (JSON-LD).

Analyze the page below and return ONLY a JSON object (no prose, no markdown fences) matching this exact shape:

{
  "pageType": "article|product|localbusiness|faq|howto|event|organization|webpage|other",
  "summary": "1-2 sentence description",
  "existing": [
    { "type": "SchemaType", "raw": { ... echo back the existing JSON-LD ... }, "issues": ["..."] }
  ],
  "recommended": [
    {
      "type": "SchemaType",
      "reason": "why this applies",
      "confidence": "high|medium|low",
      "jsonLd": { "@context": "https://schema.org", "@type": "...", ... }
    }
  ]
}

Rules:
- Use real values from the page, not placeholders.
- Do not invent prices, ratings, or reviews.
- Each recommended jsonLd must be valid standalone Schema.org JSON-LD.

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

async function analyzeWithLocalOllama(
  signals: SchemaPageSignals
): Promise<SchemaAnalysisResult> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BASE_URL.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: buildPrompt(signals),
        stream: false,
        format: 'json',
        options: { temperature: 0.2 },
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot reach Ollama at ${OLLAMA_BASE_URL} from your browser (${msg}). ` +
        `Start it with: OLLAMA_ORIGINS='*' ollama serve`
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Ollama returned ${res.status}: ${body || res.statusText}. ` +
        `Check the model '${OLLAMA_MODEL}' is pulled (ollama list).`
    );
  }

  const payload = (await res.json()) as { response?: string };
  const raw = payload.response?.trim() ?? '';
  if (!raw) throw new Error('Ollama returned an empty response');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const stripped = raw
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();
    parsed = JSON.parse(stripped);
  }

  return normalizeResult(parsed);
}

interface UseSchemaAnalysisArgs {
  projectId: string;
  pageId: string;
  /** Fully qualified live URL (must use the custom domain). */
  url: string;
}

interface UseSchemaAnalysisState {
  loading: boolean;
  stage: 'idle' | 'scraping' | 'analyzing' | 'done' | 'error';
  result: SchemaAnalysisResult | null;
  signals: SchemaPageSignals | null;
  error: string | null;
  fromCache: boolean;
  run: (opts?: { force?: boolean }) => Promise<void>;
  reset: () => void;
}

export function useSchemaAnalysis({
  projectId,
  pageId,
  url,
}: UseSchemaAnalysisArgs): UseSchemaAnalysisState {
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<UseSchemaAnalysisState['stage']>('idle');
  const [result, setResult] = useState<SchemaAnalysisResult | null>(null);
  const [signals, setSignals] = useState<SchemaPageSignals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const reset = useCallback(() => {
    setLoading(false);
    setStage('idle');
    setResult(null);
    setSignals(null);
    setError(null);
    setFromCache(false);
  }, []);

  const run = useCallback(
    async ({ force }: { force?: boolean } = {}) => {
      setLoading(true);
      setError(null);
      setFromCache(false);
      setResult(null);

      try {
        // 1. Scrape live URL.
        setStage('scraping');
        const scrapeRes = await fetch('/api/schema/scrape', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        const scrapeJson = await scrapeRes.json();
        if (!scrapeRes.ok) {
          throw new Error(scrapeJson.error || 'Failed to scrape page');
        }
        const pageSignals: SchemaPageSignals = scrapeJson.signals;
        setSignals(pageSignals);

        const contentHash = computeContentHash(pageSignals);

        // 2. Cache lookup.
        if (!force) {
          try {
            const cached = await getCachedAnalysis(pageId, contentHash);
            if (cached) {
              setResult(cached.result);
              setFromCache(true);
              setStage('done');
              setLoading(false);
              return;
            }
          } catch (cacheErr) {
            console.warn('Schema cache lookup failed:', cacheErr);
          }
        }

        // 3. Analyze with Ollama directly from the browser.
        // The app may be deployed (Vercel), so we call the user's local
        // Ollama from their own machine instead of the server.
        setStage('analyzing');
        const analysis = await analyzeWithLocalOllama(pageSignals);
        setResult(analysis);
        setStage('done');

        // 4. Cache write (best-effort).
        try {
          await saveCachedAnalysis({
            pageId,
            projectId,
            contentHash,
            url,
            result: analysis,
            model: 'gemma3',
          });
        } catch (writeErr) {
          console.warn('Failed to cache schema analysis:', writeErr);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg);
        setStage('error');
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [projectId, pageId, url]
  );

  return { loading, stage, result, signals, error, fromCache, run, reset };
}
