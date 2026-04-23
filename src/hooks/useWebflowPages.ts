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
import { fetchForProject } from '@/lib/api-client';

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
  updatePageState: (pageId: string, updates: Pick<UpdateWebflowPageSEO, 'draft' | 'archived' | 'localeId'>) => Promise<boolean>;
  publishSite: (options?: { customDomains?: string[]; publishToWebflowSubdomain?: boolean }) => Promise<boolean>;
  unpublishSite: (options?: { customDomains?: string[]; publishToWebflowSubdomain?: boolean }) => Promise<boolean>;
  bulkUpdatePagesSEO: (
    updates: { pageId: string; updates: UpdateWebflowPageSEO }[]
  ) => Promise<{ success: number; failed: number }>;
  generatePageSEO: (pageId: string) => Promise<AISEOGeneratedData | null>;
  refetch: () => Promise<void>;
}

export function useWebflowPages(
  projectId: string | undefined,
  webflowConfig: WebflowConfig | undefined
): UseWebflowPagesReturn {
  const [pages, setPages] = useState<WebflowPageWithQC[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siteHealth, setSiteHealth] = useState<WebflowSiteHealth | null>(null);
  const [locales, setLocales] = useState<WebflowLocale[]>([]);
  const [primaryLocale, setPrimaryLocale] = useState<WebflowLocale | null>(null);

  const isReady = Boolean(projectId && webflowConfig?.siteId && webflowConfig?.hasApiToken);

  const fetchSiteDetails = useCallback(async () => {
    if (!isReady || !projectId || !webflowConfig?.siteId) return;

    try {
      const response = await fetchForProject(
        projectId,
        `/api/webflow/sites/${encodeURIComponent(webflowConfig.siteId)}`
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
  }, [isReady, projectId, webflowConfig?.siteId]);

  const fetchPages = useCallback(
    async (localeId?: string) => {
      if (!isReady || !projectId || !webflowConfig?.siteId) {
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

        const response = await fetchForProject(projectId, url.toString());

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to fetch pages');
        }

        const rawPages: WebflowPage[] = result.data.pages || [];

        const pagesWithQC = webflowService.processPagesWithQC(rawPages);

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
    [isReady, projectId, webflowConfig?.siteId]
  );

  useEffect(() => {
    if (isReady) {
      fetchSiteDetails();
    }
  }, [isReady, fetchSiteDetails]);

  const updatePageSEO = useCallback(
    async (pageId: string, updates: UpdateWebflowPageSEO): Promise<boolean> => {
      if (!isReady || !projectId) {
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

        const response = await fetchForProject(projectId, url.toString(), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to update page');
        }

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
    [isReady, projectId]
  );

  const updatePageState = useCallback(
    async (
      pageId: string,
      updates: Pick<UpdateWebflowPageSEO, 'draft' | 'archived' | 'localeId'>
    ): Promise<boolean> => {
      return updatePageSEO(pageId, updates);
    },
    [updatePageSEO]
  );

  const publishSite = useCallback(
    async (options?: { customDomains?: string[]; publishToWebflowSubdomain?: boolean }): Promise<boolean> => {
      if (!isReady || !projectId || !webflowConfig?.siteId) {
        setError('Webflow configuration is missing');
        return false;
      }

      try {
        const response = await fetchForProject(projectId, `/api/webflow/sites/${encodeURIComponent(webflowConfig.siteId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'publish',
            customDomains: options?.customDomains,
            publishToWebflowSubdomain: options?.publishToWebflowSubdomain,
          }),
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to publish site');
        }
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to publish site';
        setError(message);
        return false;
      }
    },
    [isReady, projectId, webflowConfig?.siteId]
  );

  const unpublishSite = useCallback(
    async (_options?: { customDomains?: string[]; publishToWebflowSubdomain?: boolean }): Promise<boolean> => {
      setError(
        'Site-wide unpublish is not available in Webflow Data API. Use page draft/archive controls to unpublish content.'
      );
      return false;
    },
    []
  );

  const bulkUpdatePagesSEO = useCallback(
    async (
      updates: { pageId: string; updates: UpdateWebflowPageSEO }[]
    ): Promise<{ success: number; failed: number }> => {
      if (!isReady || !projectId) {
        setError('Webflow configuration is missing');
        return { success: 0, failed: updates.length };
      }

      let successCount = 0;
      let failedCount = 0;

      for (const { pageId, updates: pageUpdates } of updates) {
        try {
          const url = new URL(
            `/api/webflow/pages/${pageId}`,
            window.location.origin
          );
          if (pageUpdates.localeId) {
            url.searchParams.set('localeId', pageUpdates.localeId);
          }

          const response = await fetchForProject(projectId, url.toString(), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
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

      setPages((prevPages) => {
        const health = webflowService.calculateSiteHealth(prevPages);
        setSiteHealth(health);
        return prevPages;
      });

      return { success: successCount, failed: failedCount };
    },
    [isReady, projectId]
  );

  const generatePageSEO = useCallback(async (pageId: string): Promise<AISEOGeneratedData | null> => {
    if (!isReady || !projectId) {
      setError('Webflow configuration is missing');
      return null;
    }

    try {
      const contentRes = await fetchForProject(projectId, `/api/webflow/pages/${pageId}/content`);
      const contentJson = await contentRes.json();

      if (!contentRes.ok || !contentJson.success) {
        throw new Error(contentJson.error || 'Failed to fetch page content');
      }

      const textContent = webflowService.extractTextFromDOM(contentJson.data.nodes);

      if (!textContent) {
        throw new Error('No text content found on page to analyze');
      }

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
      console.error("SEO Generation Error", err);
      throw err;
    }
  }, [isReady, projectId]);

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
    updatePageState,
    publishSite,
    unpublishSite,
    bulkUpdatePagesSEO,
    generatePageSEO,
    refetch,
  };
}
