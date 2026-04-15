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

        // 3. Analyze with Ollama (Gemma).
        setStage('analyzing');
        const analyzeRes = await fetch('/api/schema/analyze', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ signals: pageSignals }),
        });
        const analyzeJson = await analyzeRes.json();
        if (!analyzeRes.ok) {
          const hint = analyzeJson.hint ? ` (${analyzeJson.hint})` : '';
          throw new Error(`${analyzeJson.error || 'Analysis failed'}${hint}`);
        }

        const analysis: SchemaAnalysisResult = analyzeJson.result;
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
