'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  WebflowConfig,
  WebflowPage,
  WebflowPageWithQC,
  UpdateWebflowPageSEO,
  WebflowSiteHealth,
  AISEOGeneratedData,
  WebflowSite,
  WebflowLocale,
} from '@/types/webflow';
import { webflowService } from '@/services/WebflowService';

interface UseWebflowPagesReturn {
  pages: WebflowPageWithQC[];
  loading: boolean;
  error: string | null;
  siteHealth: WebflowSiteHealth | null;
  locales: WebflowLocale[];
  primaryLocale: WebflowLocale | null;
  fetchPages: (localeId?: string) => Promise<void>;
  fetchSiteDetails: () => Promise<void>;
  updatePageSEO: (pageId: string, updates: UpdateWebflowPageSEO) => Promise<boolean>;
  bulkUpdatePagesSEO: (
    updates: { pageId: string; updates: UpdateWebflowPageSEO }[]
  ) => Promise<{ success: number; failed: number }>;
  generatePageSEO: (pageId: string) => Promise<AISEOGeneratedData | null>;
  refetch: () => Promise<void>;
}

export function useWebflowPages(
  webflowConfig: WebflowConfig | undefined
): UseWebflowPagesReturn {
  const [pages, setPages] = useState<WebflowPageWithQC[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siteHealth, setSiteHealth] = useState<WebflowSiteHealth | null>(null);
  const [locales, setLocales] = useState<WebflowLocale[]>([]);
  const [primaryLocale, setPrimaryLocale] = useState<WebflowLocale | null>(null);

  const fetchSiteDetails = useCallback(async () => {
    if (!webflowConfig?.siteId || !webflowConfig?.apiToken) return;

    try {
      const response = await fetch(
        `/api/webflow/sites/${encodeURIComponent(webflowConfig.siteId)}`,
        {
          headers: {
            'x-webflow-token': webflowConfig.apiToken,
          },
        }
      );

      const result = await response.json();

      if (response.ok && result.success) {
        const site: WebflowSite = result.data;
        if (site.locales) {
          setPrimaryLocale(site.locales.primary);
          setLocales([site.locales.primary, ...(site.locales.secondary || [])]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch site details', err);
    }
  }, [webflowConfig]);

  const fetchPages = useCallback(
    async (localeId?: string) => {
      if (!webflowConfig?.siteId || !webflowConfig?.apiToken) {
        setError('Webflow configuration is missing');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const url = new URL(
          `/api/webflow/pages`,
          window.location.origin
        );
        url.searchParams.set('siteId', webflowConfig.siteId);
        if (localeId) {
          url.searchParams.set('localeId', localeId);
        }

        const response = await fetch(url.toString(), {
          headers: {
            'x-webflow-token': webflowConfig.apiToken,
          },
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to fetch pages');
        }

        const rawPages: WebflowPage[] = result.data.pages || [];

        // Include all pages (Static + CMS)
        // const staticPages = webflowService.filterStaticPages(rawPages);
        const pagesWithQC = webflowService.processPagesWithQC(rawPages);

        // Calculate site health metrics (include CMS page count)
        const allPagesWithQC = webflowService.processPagesWithQC(rawPages);
        const health = webflowService.calculateSiteHealth(allPagesWithQC);

        setPages(pagesWithQC);
        setSiteHealth(health);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch pages';
        setError(message);
        setPages([]);
        setSiteHealth(null);
      } finally {
        setLoading(false);
      }
    },
    [webflowConfig]
  );

  // Fetch site details on mount/config change
  useEffect(() => {
    if (webflowConfig?.siteId) {
      fetchSiteDetails();
    }
  }, [webflowConfig, fetchSiteDetails]);

  const updatePageSEO = useCallback(
    async (pageId: string, updates: UpdateWebflowPageSEO): Promise<boolean> => {
      if (!webflowConfig?.apiToken) {
        setError('Webflow configuration is missing');
        return false;
      }

      try {
        const url = new URL(
          `/api/webflow/pages/${pageId}`,
          window.location.origin
        );
        if (updates.localeId) {
          url.searchParams.set('localeId', updates.localeId);
        }

        const response = await fetch(url.toString(), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-webflow-token': webflowConfig.apiToken,
          },
          body: JSON.stringify(updates),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to update page');
        }

        // Update the local page data with the response
        const updatedPage: WebflowPage = result.data;
        setPages((prevPages) =>
          prevPages.map((page) => {
            if (page.id === pageId) {
              const { seoHealth, issues } = webflowService.processPagesWithQC([
                updatedPage,
              ])[0];
              return { ...updatedPage, seoHealth, issues };
            }
            return page;
          })
        );

        // Recalculate site health
        setPages((prevPages) => {
          const health = webflowService.calculateSiteHealth(prevPages);
          setSiteHealth(health);
          return prevPages;
        });

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update page';
        setError(message);
        return false;
      }
    },
    [webflowConfig]
  );

  const bulkUpdatePagesSEO = useCallback(
    async (
      updates: { pageId: string; updates: UpdateWebflowPageSEO }[]
    ): Promise<{ success: number; failed: number }> => {
      if (!webflowConfig?.apiToken) {
        setError('Webflow configuration is missing');
        return { success: 0, failed: updates.length };
      }

      let successCount = 0;
      let failedCount = 0;

      // Process updates sequentially to avoid rate limiting
      for (const { pageId, updates: pageUpdates } of updates) {
        try {
          const url = new URL(
            `/api/webflow/pages/${pageId}`,
            window.location.origin
          );
          if (pageUpdates.localeId) {
            url.searchParams.set('localeId', pageUpdates.localeId);
          }

          const response = await fetch(url.toString(), {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'x-webflow-token': webflowConfig.apiToken,
            },
            body: JSON.stringify(pageUpdates),
          });

          const result = await response.json();

          if (response.ok && result.success) {
            const updatedPage: WebflowPage = result.data;
            setPages((prevPages) =>
              prevPages.map((page) => {
                if (page.id === pageId) {
                  const { seoHealth, issues } = webflowService.processPagesWithQC([
                    updatedPage,
                  ])[0];
                  return { ...updatedPage, seoHealth, issues };
                }
                return page;
              })
            );
            successCount++;
          } else {
            failedCount++;
          }
        } catch {
          failedCount++;
        }
      }

      // Recalculate site health after all updates
      setPages((prevPages) => {
        const health = webflowService.calculateSiteHealth(prevPages);
        setSiteHealth(health);
        return prevPages;
      });

      return { success: successCount, failed: failedCount };
    },
    [webflowConfig]
  );

  const generatePageSEO = useCallback(async (pageId: string): Promise<AISEOGeneratedData | null> => {
    if (!webflowConfig?.apiToken) {
      setError('Webflow configuration is missing');
      return null;
    }

    // Don't set global loading, let component handle local loading state logic or use a specific state if needed
    // For now we'll just return the promise and let caller handle loading UI

    try {
      // 1. Fetch Content
      const contentRes = await fetch(`/api/webflow/pages/${pageId}/content`, {
        headers: { 'x-webflow-token': webflowConfig.apiToken }
      });
      const contentJson = await contentRes.json();

      if (!contentRes.ok || !contentJson.success) {
        throw new Error(contentJson.error || 'Failed to fetch page content');
      }

      const textContent = webflowService.extractTextFromDOM(contentJson.data.nodes);

      if (!textContent) {
        throw new Error('No text content found on page to analyze');
      }

      // 2. Call AI
      const aiRes = await fetch('/api/ai-seo-gen', {
        method: 'POST',
        body: JSON.stringify({ content: textContent }),
        headers: { 'Content-Type': 'application/json' }
      });
      const aiJson = await aiRes.json();

      if (!aiRes.ok || !aiJson.success) {
        throw new Error(aiJson.error || 'Failed to generate specific SEO');
      }

      return aiJson.data;

    } catch (err) {
      // We don't set global error here to avoid disrupting the dashboard, just log and rethrow or return null
      console.error("SEO Generation Error", err);
      throw err;
    }
  }, [webflowConfig]);

  const refetch = useCallback(async () => {
    await fetchPages();
    await fetchSiteDetails();
  }, [fetchPages, fetchSiteDetails]);

  return {
    pages,
    loading,
    error,
    siteHealth,
    locales,
    primaryLocale,
    fetchPages,
    fetchSiteDetails,
    updatePageSEO,
    bulkUpdatePagesSEO,
    generatePageSEO,
    refetch,
  };
}
