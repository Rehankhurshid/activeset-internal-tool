'use client';

import { useCallback, useState } from 'react';
import type {
  WebflowConfig,
  CmsCollectionSummary,
  CmsAltScanCollectionResult,
  CmsImageEntry,
  CmsUpdatePayload,
  CmsCompressResult,
  CmsAltSuggestion,
} from '@/types/webflow';

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

  // Drafts
  altDrafts: Record<string, string>;
  setDraft: (entryId: string, value: string) => void;
  applyCSVImport: (text: string) => number;

  // AI
  generateAlt: (entries: CmsImageEntry[]) => Promise<CmsAltSuggestion[]>;
  isGenerating: boolean;

  // Compression
  compressImage: (entry: CmsImageEntry, projectId: string) => Promise<CmsCompressResult | null>;
  compressedUrls: Record<string, string>;
  isCompressing: Set<string>;

  // Save / Publish
  saveChanges: (entries: CmsImageEntry[]) => Promise<{ updated: number; failed: number }>;
  publishItems: (collectionId: string, itemIds: string[]) => Promise<boolean>;
  isSaving: boolean;

  // General
  error: string | null;
  clearError: () => void;
  reset: () => void;
}

export function useCmsImages(webflowConfig: WebflowConfig | undefined): UseCmsImagesReturn {
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

  const [altDrafts, setAltDrafts] = useState<Record<string, string>>({});
  const [compressedUrls, setCompressedUrls] = useState<Record<string, string>>({});
  const [isCompressing, setIsCompressing] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const reset = useCallback(() => {
    setImages([]);
    setAltDrafts({});
    setCompressedUrls({});
    setHasMore(false);
    setError(null);
  }, []);

  // --- Discovery ---
  const discoverCollections = useCallback(async () => {
    if (!webflowConfig?.siteId || !webflowConfig?.apiToken) {
      setError('Webflow configuration is missing');
      return;
    }

    setDiscoveryLoading(true);
    setError(null);

    try {
      const url = new URL('/api/webflow/cms/discover', window.location.origin);
      url.searchParams.set('siteId', webflowConfig.siteId);

      const res = await fetch(url.toString(), {
        headers: { 'x-webflow-token': webflowConfig.apiToken },
      });
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
  }, [webflowConfig]);

  // --- Missing-ALT scan (counts only — no full image list) ---
  const scanAltCounts = useCallback(
    async (collectionIds?: string[]) => {
      if (!webflowConfig?.apiToken) {
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
            const res = await fetch(url.toString(), {
              headers: { 'x-webflow-token': webflowConfig.apiToken! },
            });
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
    [webflowConfig]
  );

  // --- Fetch images for a single collection ---
  const fetchImages = useCallback(async (collectionId: string, offset = 0) => {
    if (!webflowConfig?.apiToken) return;

    setImagesLoading(true);
    setError(null);

    try {
      const url = new URL('/api/webflow/cms/items', window.location.origin);
      url.searchParams.set('collectionId', collectionId);
      url.searchParams.set('offset', String(offset));
      url.searchParams.set('limit', '100');

      const res = await fetch(url.toString(), {
        headers: { 'x-webflow-token': webflowConfig.apiToken },
      });
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

      // Initialize drafts for new images
      setAltDrafts(prev => {
        const next = { ...prev };
        for (const img of newImages) {
          if (!(img.id in next)) {
            next[img.id] = img.currentAlt;
          }
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch images');
    } finally {
      setImagesLoading(false);
    }
  }, [webflowConfig]);

  // --- Fetch images from multiple collections ---
  const fetchAllImages = useCallback(async (collectionIds: string[]) => {
    if (!webflowConfig?.apiToken) return;

    setImagesLoading(true);
    setError(null);
    setImages([]);
    setAltDrafts({});

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

          const res = await fetch(url.toString(), {
            headers: { 'x-webflow-token': webflowConfig.apiToken },
          });
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

      const drafts: Record<string, string> = {};
      for (const img of allImages) {
        drafts[img.id] = img.currentAlt;
      }
      setAltDrafts(drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch images');
    } finally {
      setImagesLoading(false);
    }
  }, [webflowConfig]);

  // --- Draft management ---
  const setDraft = useCallback((entryId: string, value: string) => {
    setAltDrafts(prev => ({ ...prev, [entryId]: value }));
  }, []);

  // --- CSV import ---
  const applyCSVImport = useCallback((text: string): number => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return 0;

    const headerLine = lines[0].toLowerCase();
    const headers = headerLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));

    const urlCol = headers.findIndex(h => h === 'image_url' || h === 'url' || h === 'src');
    const altCol = headers.findIndex(h => h === 'alt_text' || h === 'alt' || h === 'alttext');
    const itemIdCol = headers.findIndex(h => h === 'item_id' || h === 'itemid');
    const fieldCol = headers.findIndex(h => h === 'field_name' || h === 'field' || h === 'fieldname');

    if (altCol === -1) return 0;

    // Build lookup maps
    const imagesByUrl = new Map<string, CmsImageEntry[]>();
    const imagesByItemField = new Map<string, CmsImageEntry>();

    for (const img of images) {
      // URL lookup
      const existing = imagesByUrl.get(img.imageUrl) || [];
      existing.push(img);
      imagesByUrl.set(img.imageUrl, existing);
      // Item+field lookup
      imagesByItemField.set(`${img.itemId}::${img.fieldSlug}`, img);
    }

    let matched = 0;
    const newDrafts: Record<string, string> = {};

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const altText = values[altCol];
      if (!altText) continue;

      // Try item_id + field_name match first
      if (itemIdCol !== -1 && fieldCol !== -1) {
        const key = `${values[itemIdCol]}::${values[fieldCol]}`;
        const entry = imagesByItemField.get(key);
        if (entry) {
          newDrafts[entry.id] = altText;
          matched++;
          continue;
        }
      }

      // Try URL match
      if (urlCol !== -1 && values[urlCol]) {
        const entries = imagesByUrl.get(values[urlCol]);
        if (entries) {
          for (const entry of entries) {
            newDrafts[entry.id] = altText;
            matched++;
          }
        }
      }
    }

    if (matched > 0) {
      setAltDrafts(prev => ({ ...prev, ...newDrafts }));
    }

    return matched;
  }, [images]);

  // --- AI generation ---
  const generateAlt = useCallback(async (entries: CmsImageEntry[]): Promise<CmsAltSuggestion[]> => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/webflow/cms/generate-alt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: entries,
          siteName: webflowConfig?.siteName,
        }),
      });
      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to generate alt text');
      }

      const suggestions: CmsAltSuggestion[] = result.data.suggestions || [];

      // Apply suggestions to drafts
      setAltDrafts(prev => {
        const next = { ...prev };
        for (const s of suggestions) {
          if (s.altText) next[s.entryId] = s.altText;
        }
        return next;
      });

      return suggestions;
    } finally {
      setIsGenerating(false);
    }
  }, [webflowConfig?.siteName]);

  // --- Compression ---
  const compressImage = useCallback(async (
    entry: CmsImageEntry,
    projectId: string
  ): Promise<CmsCompressResult | null> => {
    if (!webflowConfig?.apiToken) return null;

    setIsCompressing(prev => new Set(prev).add(entry.id));

    try {
      const res = await fetch('/api/webflow/cms/compress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webflow-token': webflowConfig.apiToken,
        },
        body: JSON.stringify({
          imageUrl: entry.imageUrl,
          projectId,
          collectionId: entry.collectionId,
          itemId: entry.itemId,
          fieldSlug: entry.fieldSlug,
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Compression failed');
      }

      const data: CmsCompressResult = result.data;
      if (data.compressedUrl !== data.originalUrl) {
        setCompressedUrls(prev => ({ ...prev, [entry.id]: data.compressedUrl }));
      }

      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compression failed');
      return null;
    } finally {
      setIsCompressing(prev => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    }
  }, [webflowConfig]);

  // --- Save changes ---
  const saveChanges = useCallback(async (
    entries: CmsImageEntry[]
  ): Promise<{ updated: number; failed: number }> => {
    if (!webflowConfig?.apiToken) return { updated: 0, failed: 0 };

    setIsSaving(true);

    try {
      const updates: CmsUpdatePayload[] = entries
        .filter(entry => {
          const draft = altDrafts[entry.id];
          return draft !== undefined && draft !== entry.currentAlt;
        })
        .map(entry => ({
          collectionId: entry.collectionId,
          itemId: entry.itemId,
          fieldSlug: entry.fieldSlug,
          fieldType: entry.fieldType,
          newAlt: altDrafts[entry.id],
          newUrl: compressedUrls[entry.id],
          imageIndex: entry.imageIndex,
          rawFieldValue: entry.rawFieldValue,
        }));

      if (updates.length === 0) return { updated: 0, failed: 0 };

      const res = await fetch('/api/webflow/cms/update', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-webflow-token': webflowConfig.apiToken,
        },
        body: JSON.stringify({ updates }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to save');
      }

      // Update local state to reflect saved changes
      if (result.data.updated > 0) {
        setImages(prev =>
          prev.map(img => {
            const draft = altDrafts[img.id];
            if (draft !== undefined && draft !== img.currentAlt) {
              return { ...img, currentAlt: draft, isMissingAlt: !draft.trim() };
            }
            return img;
          })
        );
      }

      return { updated: result.data.updated, failed: result.data.failed };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      return { updated: 0, failed: 0 };
    } finally {
      setIsSaving(false);
    }
  }, [webflowConfig, altDrafts, compressedUrls]);

  // --- Publish ---
  const publishItems = useCallback(async (collectionId: string, itemIds: string[]): Promise<boolean> => {
    if (!webflowConfig?.apiToken) return false;

    try {
      const res = await fetch('/api/webflow/cms/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webflow-token': webflowConfig.apiToken,
        },
        body: JSON.stringify({ collectionId, itemIds }),
      });

      const result = await res.json();
      return res.ok && result.success;
    } catch {
      return false;
    }
  }, [webflowConfig]);

  // Aggregate counts across collections that have been scanned.
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
    altDrafts,
    setDraft,
    applyCSVImport,
    generateAlt,
    isGenerating,
    compressImage,
    compressedUrls,
    isCompressing,
    saveChanges,
    publishItems,
    isSaving,
    error,
    clearError,
    reset,
  };
}
