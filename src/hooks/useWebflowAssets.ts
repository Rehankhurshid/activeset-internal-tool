'use client';

import { useCallback, useState } from 'react';
import { WebflowAsset, WebflowAssetFolder, WebflowConfig } from '@/types/webflow';
import { fetchForProject } from '@/lib/api-client';

interface UseWebflowAssetsReturn {
  assets: WebflowAsset[];
  folders: WebflowAssetFolder[];
  loading: boolean;
  error: string | null;
  fetchAssets: (folderId?: string) => Promise<void>;
  // Reading only. Writes to assets go through the worker (alt_apply), not the
  // browser, so the update and generate functions that used to sit here are gone.
}

export function useWebflowAssets(
  projectId: string | undefined,
  webflowConfig: WebflowConfig | undefined
): UseWebflowAssetsReturn {
  const [assets, setAssets] = useState<WebflowAsset[]>([]);
  const [folders, setFolders] = useState<WebflowAssetFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReady = Boolean(projectId && webflowConfig?.siteId && webflowConfig?.hasApiToken);

  const fetchAssets = useCallback(
    async (folderId?: string) => {
      if (!isReady || !projectId || !webflowConfig?.siteId) {
        setError('Webflow configuration is missing');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const url = new URL('/api/webflow/assets', window.location.origin);
        url.searchParams.set('siteId', webflowConfig.siteId);
        url.searchParams.set('limit', '100');
        if (folderId && folderId !== 'all') {
          url.searchParams.set('folderId', folderId);
        }

        const response = await fetchForProject(projectId, url.toString());

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to fetch assets');
        }

        setAssets(result.data.assets || []);
        setFolders(result.data.folders || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch assets';
        setError(message);
        setAssets([]);
      } finally {
        setLoading(false);
      }
    },
    [isReady, projectId, webflowConfig?.siteId]
  );

  return {
    assets,
    folders,
    loading,
    error,
    fetchAssets,
  };
}
