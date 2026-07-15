'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchForProject } from '@/lib/api-client';
import type { WebflowSitemapDiff } from '@/types';

interface DiffResponse {
  diff: WebflowSitemapDiff | null;
  ignorePaths: string[];
  sitemapUrl: string | null;
  connected?: boolean;
}

/**
 * Loads and mutates the Webflow ↔ sitemap drift state for a project.
 * The stored diff lists are raw; ignore filtering is applied by the consumer,
 * so ignore/un-ignore is instant (no network recompute) and reversible.
 */
export function useWebflowSitemapDiff(projectId: string) {
  const [diff, setDiff] = useState<WebflowSitemapDiff | null>(null);
  const [ignorePaths, setIgnorePaths] = useState<string[]>([]);
  const [sitemapUrl, setSitemapUrl] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyResponse = useCallback((data: DiffResponse) => {
    setDiff(data.diff ?? null);
    setIgnorePaths(data.ignorePaths ?? []);
    setSitemapUrl(data.sitemapUrl ?? null);
    if (typeof data.connected === 'boolean') setConnected(data.connected);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchForProject(
        projectId,
        `/api/webflow/sitemap-diff?projectId=${encodeURIComponent(projectId)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load sitemap diff');
      applyResponse(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sitemap diff');
    } finally {
      setLoading(false);
    }
  }, [projectId, applyResponse]);

  useEffect(() => {
    if (projectId) load();
  }, [projectId, load]);

  /** Recompute against live Webflow pages + sitemap and persist. */
  const refresh = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await fetchForProject(projectId, '/api/webflow/sitemap-diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to check sitemap');
      applyResponse(data);
      return data.diff as WebflowSitemapDiff | null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to check sitemap');
      throw e;
    } finally {
      setChecking(false);
    }
  }, [projectId, applyResponse]);

  const mutateIgnore = useCallback(
    async (path: string, action: 'add' | 'remove') => {
      // Optimistic update.
      setIgnorePaths((prev) =>
        action === 'add'
          ? prev.includes(path)
            ? prev
            : [...prev, path].sort()
          : prev.filter((p) => p !== path)
      );
      try {
        const res = await fetchForProject(projectId, '/api/webflow/sitemap-diff/ignore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, path, action }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to update ignore list');
        setIgnorePaths(data.ignorePaths ?? []);
      } catch (e) {
        await load(); // revert to server truth
        throw e;
      }
    },
    [projectId, load]
  );

  const ignore = useCallback((path: string) => mutateIgnore(path, 'add'), [mutateIgnore]);
  const unignore = useCallback(
    (path: string) => mutateIgnore(path, 'remove'),
    [mutateIgnore]
  );

  return {
    diff,
    ignorePaths,
    sitemapUrl,
    connected,
    loading,
    checking,
    error,
    refresh,
    ignore,
    unignore,
    reload: load,
  };
}
