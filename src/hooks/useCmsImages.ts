'use client';

import { useCallback, useState } from 'react';
import type {
  WebflowConfig,
  CmsCollectionSummary,
  CmsAltScanCollectionResult,
  CmsImageEntry,
} from '@/types/webflow';
import { fetchForProject } from '@/lib/api-client';

export interface UseCmsImagesReturn {
  // Discovery
  collections: CmsCollectionSummary[];
  discoveryLoading: boolean;
  discoverCollections: () => Promise<void>;

  // Missing-ALT scan (per collection, aggregated on top)
  scanAltCounts: (collectionIds?: string[]) => Promise<void>;
  altScanLoading: boolean;
  altScanProgress: { completed: number; total: number };
  altScanTotals: { totalImages: number; missingAltCount: number; scannedCollections: number };

  // Images
  images: CmsImageEntry[];
  imagesLoading: boolean;
  hasMore: boolean;
  fetchImages: (collectionId: string, offset?: number) => Promise<void>;
  fetchAllImages: (collectionIds: string[]) => Promise<void>;
  /**
   * One collection's images, returned rather than stored — so a screen can
   * load sections as they are opened without one section's load replacing
   * another's, and without reading every collection on the site up front.
   */
  loadCollectionImages: (collectionId: string) => Promise<CmsImageEntry[]>;
  /**
   * What each image in a collection looks like on the published site, by CMS
   * image entry id. Read from Webflow's CDN, so up to five minutes old.
   */
  loadPublished: (collectionId: string) => Promise<Record<string, { alt: string; url: string }>>;

  // Reading only. Drafting, compressing and saving used to live here too, each
  // calling a route that wrote from the browser (one of them to Ollama on
  // localhost, from Vercel). All of that now goes through the worker — see
  // useLibraryOptimise — so this hook lists what Webflow has and nothing more.

  // General
  error: string | null;
  clearError: () => void;
  reset: () => void;
}

export function useCmsImages(
  projectId: string | undefined,
  webflowConfig: WebflowConfig | undefined
): UseCmsImagesReturn {
  const canCall = Boolean(projectId && webflowConfig?.hasApiToken);
  const [collections, setCollections] = useState<CmsCollectionSummary[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [altScanLoading, setAltScanLoading] = useState(false);
  const [altScanProgress, setAltScanProgress] = useState<{ completed: number; total: number }>({
    completed: 0,
    total: 0,
  });

  const [images, setImages] = useState<CmsImageEntry[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const reset = useCallback(() => {
    setImages([]);
    setHasMore(false);
    setError(null);
  }, []);

  // --- Discovery ---
  const discoverCollections = useCallback(async () => {
    if (!canCall || !projectId || !webflowConfig?.siteId) {
      setError('Webflow configuration is missing');
      return;
    }

    setDiscoveryLoading(true);
    setError(null);

    try {
      const url = new URL('/api/webflow/cms/discover', window.location.origin);
      url.searchParams.set('siteId', webflowConfig.siteId);

      const res = await fetchForProject(projectId, url.toString());
      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to discover collections');
      }

      setCollections(result.data.collections || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discovery failed');
      setCollections([]);
    } finally {
      setDiscoveryLoading(false);
    }
  }, [canCall, projectId, webflowConfig?.siteId]);

  // --- Missing-ALT scan (counts only — no full image list) ---
  const scanAltCounts = useCallback(
    async (collectionIds?: string[]) => {
      if (!canCall || !projectId) {
        setError('Webflow configuration is missing');
        return;
      }

      setAltScanLoading(true);
      setError(null);

      // Snapshot the target collections up front so the closure below doesn't
      // get stale reads from setState batching.
      let targetIds: string[] = [];
      setCollections((prev) => {
        targetIds = (collectionIds && collectionIds.length > 0
          ? collectionIds
          : prev.map((c) => c.id)
        ).filter(Boolean);
        return prev;
      });

      if (targetIds.length === 0) {
        setAltScanLoading(false);
        return;
      }

      setAltScanProgress({ completed: 0, total: targetIds.length });

      // Fan out counts with a small concurrency window so a site with 20+
      // collections finishes quickly without hammering Webflow's rate limits.
      const CONCURRENCY = 4;
      let completed = 0;
      let index = 0;

      const worker = async () => {
        while (true) {
          const i = index++;
          if (i >= targetIds.length) return;
          const collectionId = targetIds[i];
          try {
            const url = new URL('/api/webflow/cms/count-alt', window.location.origin);
            url.searchParams.set('collectionId', collectionId);
            const res = await fetchForProject(projectId, url.toString());
            const result = await res.json();
            if (res.ok && result.success) {
              const scan = result.data as CmsAltScanCollectionResult;
              setCollections((prev) =>
                prev.map((c) => (c.id === collectionId ? { ...c, altScan: scan } : c))
              );
            } else {
              console.warn(`[cms-alt-scan] count failed for ${collectionId}:`, result.error);
            }
          } catch (err) {
            console.warn(`[cms-alt-scan] count threw for ${collectionId}:`, err);
          } finally {
            completed += 1;
            setAltScanProgress({ completed, total: targetIds.length });
          }
        }
      };

      try {
        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, targetIds.length) }, () => worker())
        );
      } finally {
        setAltScanLoading(false);
      }
    },
    [canCall, projectId]
  );

  // --- Fetch images for a single collection ---
  const fetchImages = useCallback(async (collectionId: string, offset = 0) => {
    if (!canCall || !projectId) return;

    setImagesLoading(true);
    setError(null);

    try {
      const url = new URL('/api/webflow/cms/items', window.location.origin);
      url.searchParams.set('collectionId', collectionId);
      url.searchParams.set('offset', String(offset));
      url.searchParams.set('limit', '100');

      const res = await fetchForProject(projectId, url.toString());
      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to fetch items');
      }

      const newImages: CmsImageEntry[] = result.data.images || [];

      if (offset === 0) {
        setImages(newImages);
      } else {
        setImages(prev => [...prev, ...newImages]);
      }
      setHasMore(result.data.hasMore);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch images');
    } finally {
      setImagesLoading(false);
    }
  }, [canCall, projectId]);

  // --- Fetch images from multiple collections ---
  const loadCollectionImages = useCallback(
    async (collectionId: string): Promise<CmsImageEntry[]> => {
      if (!canCall || !projectId) return [];
      const images: CmsImageEntry[] = [];
      let offset = 0;
      for (;;) {
        const url = new URL('/api/webflow/cms/items', window.location.origin);
        url.searchParams.set('collectionId', collectionId);
        url.searchParams.set('offset', String(offset));
        url.searchParams.set('limit', '100');
        const res = await fetchForProject(projectId, url.toString());
        const result = await res.json();
        if (!res.ok || !result.success) throw new Error(result.error || 'Failed to fetch items');
        images.push(...(result.data.images || []));
        if (!result.data.hasMore) break;
        offset = result.data.nextOffset;
      }
      return images;
    },
    [canCall, projectId],
  );

  const loadPublished = useCallback(
    async (collectionId: string): Promise<Record<string, { alt: string; url: string }>> => {
      if (!canCall || !projectId) return {};
      const url = new URL('/api/webflow/cms/live', window.location.origin);
      url.searchParams.set('collectionId', collectionId);
      const res = await fetchForProject(projectId, url.toString());
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to read published items');
      return result.data.entries;
    },
    [canCall, projectId],
  );

  const fetchAllImages = useCallback(async (collectionIds: string[]) => {
    if (!canCall || !projectId) return;

    setImagesLoading(true);
    setError(null);
    setImages([]);

    try {
      const allImages: CmsImageEntry[] = [];

      for (const collectionId of collectionIds) {
        let offset = 0;
        let more = true;

        while (more) {
          const url = new URL('/api/webflow/cms/items', window.location.origin);
          url.searchParams.set('collectionId', collectionId);
          url.searchParams.set('offset', String(offset));
          url.searchParams.set('limit', '100');

          const res = await fetchForProject(projectId, url.toString());
          const result = await res.json();

          if (!res.ok || !result.success) {
            throw new Error(result.error || 'Failed to fetch items');
          }

          allImages.push(...(result.data.images || []));
          more = result.data.hasMore;
          offset = result.data.nextOffset;
        }
      }

      setImages(allImages);
      setHasMore(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch images');
    } finally {
      setImagesLoading(false);
    }
  }, [canCall, projectId]);


  // Totals across whatever collections have been scanned so far.
  let aggTotalImages = 0;
  let aggMissingAlt = 0;
  let scannedCollections = 0;
  for (const coll of collections) {
    if (coll.altScan) {
      aggTotalImages += coll.altScan.totalImages;
      aggMissingAlt += coll.altScan.missingAltCount;
      scannedCollections += 1;
    }
  }
  return {
    collections,
    discoveryLoading,
    discoverCollections,
    scanAltCounts,
    altScanLoading,
    altScanProgress,
    altScanTotals: {
      totalImages: aggTotalImages,
      missingAltCount: aggMissingAlt,
      scannedCollections,
    },
    images,
    imagesLoading,
    hasMore,
    fetchImages,
    fetchAllImages,
    loadCollectionImages,
    loadPublished,
    error,
    clearError,
    reset,
  };
}
