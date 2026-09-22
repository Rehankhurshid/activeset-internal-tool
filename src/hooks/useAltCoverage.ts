'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchForProject } from '@/lib/api-client';
import { imagePathKey, type PageCoverage } from '@/modules/site-monitoring/domain/alt-coverage';

/**
 * Which images visitors get with no ALT, and how the pages render the rest —
 * computed on the server by the Audit tab's own logic, so both screens give
 * the same number. See domain/alt-coverage.ts.
 */
export interface AltCoverage {
  loaded: boolean;
  /** The Audit tab's "missing ALT on the live site", by image path key. */
  missingKeys: Set<string>;
  missingCount: number;
  coverageFor: (src: string) => PageCoverage | undefined;
  isMissingOnSite: (src: string) => boolean;
  pagesScanned: number;
  reload: () => Promise<void>;
}

export function useAltCoverage(projectId: string | undefined): AltCoverage {
  const [data, setData] = useState<{
    missingOnSite: { key: string; src: string; pages: number }[];
    coverage: Record<string, PageCoverage>;
    pagesScanned: number;
  } | null>(null);

  const reload = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetchForProject(projectId, `/api/audit/alt-coverage?projectId=${encodeURIComponent(projectId)}`);
      const body = await res.json();
      if (res.ok && body.success) setData(body.data);
    } catch {
      // Without it the screen still works; it just cannot say what visitors see.
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const missingKeys = useMemo(() => new Set((data?.missingOnSite ?? []).map((m) => m.key)), [data]);
  return {
    loaded: !!data,
    missingKeys,
    missingCount: data?.missingOnSite.length ?? 0,
    coverageFor: (src) => data?.coverage[imagePathKey(src)],
    isMissingOnSite: (src) => missingKeys.has(imagePathKey(src)),
    pagesScanned: data?.pagesScanned ?? 0,
    reload,
  };
}
