'use client';

import { useCallback, useState } from 'react';
import {
  WebflowAsset,
  WebflowAssetAltSuggestion,
  WebflowAssetFolder,
  WebflowConfig,
  WebflowPage,
  UpdateWebflowAssetInput,
} from '@/types/webflow';

interface UseWebflowAssetsReturn {
  assets: WebflowAsset[];
  folders: WebflowAssetFolder[];
  loading: boolean;
  error: string | null;
  fetchAssets: (folderId?: string) => Promise<void>;
  updateAsset: (assetId: string, updates: UpdateWebflowAssetInput) => Promise<boolean>;
  bulkUpdateAssets: (updates: { assetId: string; updates: UpdateWebflowAssetInput }[]) => Promise<{ success: number; failed: number }>;
  generateAltSuggestions: (
    targets: WebflowAsset[],
    pages: WebflowPage[],
    mode?: 'missing_only' | 'all'
  ) => Promise<WebflowAssetAltSuggestion[]>;
}

export function useWebflowAssets(
  webflowConfig: WebflowConfig | undefined
): UseWebflowAssetsReturn {
  const [assets, setAssets] = useState<WebflowAsset[]>([]);
  const [folders, setFolders] = useState<WebflowAssetFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAssets = useCallback(
    async (folderId?: string) => {
      if (!webflowConfig?.siteId || !webflowConfig?.apiToken) {
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

        const response = await fetch(url.toString(), {
          headers: {
            'x-webflow-token': webflowConfig.apiToken,
          },
        });

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
    [webflowConfig]
  );

  const updateAsset = useCallback(
    async (assetId: string, updates: UpdateWebflowAssetInput): Promise<boolean> => {
      if (!webflowConfig?.apiToken) {
        setError('Webflow configuration is missing');
        return false;
      }

      try {
        const response = await fetch(`/api/webflow/assets/${assetId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-webflow-token': webflowConfig.apiToken,
          },
          body: JSON.stringify(updates),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to update asset');
        }

        const updatedAsset: WebflowAsset = result.data;
        setAssets((prev) => prev.map((asset) => (asset.id === assetId ? updatedAsset : asset)));
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update asset';
        setError(message);
        return false;
      }
    },
    [webflowConfig]
  );

  const bulkUpdateAssets = useCallback(
    async (
      updates: { assetId: string; updates: UpdateWebflowAssetInput }[]
    ): Promise<{ success: number; failed: number }> => {
      let success = 0;
      let failed = 0;

      for (const update of updates) {
        // Sequential updates reduce chances of hitting API rate limits.
        const ok = await updateAsset(update.assetId, update.updates);
        if (ok) {
          success++;
        } else {
          failed++;
        }
      }

      return { success, failed };
    },
    [updateAsset]
  );

  const generateAltSuggestions = useCallback(
    async (
      targets: WebflowAsset[],
      pages: WebflowPage[],
      mode: 'missing_only' | 'all' = 'missing_only'
    ): Promise<WebflowAssetAltSuggestion[]> => {
      const response = await fetch('/api/webflow/assets/ai-alt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assets: targets,
          pages,
          mode,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to generate ALT suggestions');
      }

      return result.data.suggestions || [];
    },
    []
  );

  return {
    assets,
    folders,
    loading,
    error,
    fetchAssets,
    updateAsset,
    bulkUpdateAssets,
    generateAltSuggestions,
  };
}
