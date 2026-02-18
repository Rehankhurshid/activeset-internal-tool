'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RefreshCw, Search, Wand2, Image as ImageIcon, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useWebflowAssets } from '@/hooks/useWebflowAssets';
import { WebflowConfig, WebflowPage } from '@/types/webflow';

interface WebflowAssetsDashboardProps {
  webflowConfig: WebflowConfig;
  pages: WebflowPage[];
}

type AssetFilter = 'all' | 'missing-alt' | 'has-alt';

export function WebflowAssetsDashboard({ webflowConfig, pages }: WebflowAssetsDashboardProps) {
  const { assets, folders, loading, error, fetchAssets, bulkUpdateAssets, generateAltSuggestions } =
    useWebflowAssets(webflowConfig);

  const [searchQuery, setSearchQuery] = useState('');
  const [folderId, setFolderId] = useState('all');
  const [filter, setFilter] = useState<AssetFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [altDrafts, setAltDrafts] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const shouldIgnoreMissingAlt = (asset: { displayName: string; originalFileName: string }) => {
    const value = `${asset.displayName} ${asset.originalFileName}`.toLowerCase();
    const ignoredPatterns = [
      'open graph',
      'opengraph',
      'og image',
      'og-image',
      'social share',
      'social-share',
      'page screenshot',
      'page-screenshot',
      'screenshot',
    ];
    return ignoredPatterns.some((pattern) => value.includes(pattern));
  };

  useEffect(() => {
    fetchAssets(folderId).catch((fetchError) => {
      console.error(fetchError);
      toast.error('Failed to load assets');
    });
  }, [fetchAssets, folderId]);

  useEffect(() => {
    setAltDrafts((previous) => {
      const next = { ...previous };
      for (const asset of assets) {
        if (next[asset.id] === undefined) {
          next[asset.id] = asset.altText || '';
        }
      }
      return next;
    });
  }, [assets]);

  const folderByAssetId = useMemo(() => {
    const map = new Map<string, string>();
    for (const folder of folders) {
      for (const assetId of folder.assets || []) {
        if (!map.has(assetId)) {
          map.set(assetId, folder.displayName);
        }
      }
    }
    return map;
  }, [folders]);

  const filteredAssets = useMemo(() => {
    let result = [...assets];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (asset) =>
          asset.displayName.toLowerCase().includes(query) ||
          asset.originalFileName.toLowerCase().includes(query) ||
          (asset.altText || '').toLowerCase().includes(query)
      );
    }

    if (filter === 'missing-alt') {
      result = result.filter(
        (asset) => !(asset.altText || '').trim() && !shouldIgnoreMissingAlt(asset)
      );
    }

    if (filter === 'has-alt') {
      result = result.filter((asset) => !!(asset.altText || '').trim());
    }

    return result;
  }, [assets, searchQuery, filter]);

  const visibleIds = useMemo(() => filteredAssets.map((asset) => asset.id), [filteredAssets]);
  const missingAltCount = useMemo(
    () =>
      assets.filter(
        (asset) => !(asset.altText || '').trim() && !shouldIgnoreMissingAlt(asset)
      ).length,
    [assets]
  );

  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

  const setDraft = (assetId: string, value: string) => {
    setAltDrafts((previous) => ({ ...previous, [assetId]: value }));
  };

  const toggleSelect = (assetId: string, checked: boolean) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (checked) {
        next.add(assetId);
      } else {
        next.delete(assetId);
      }
      return next;
    });
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      for (const id of visibleIds) {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    });
  };

  const selectMissingAlt = () => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      for (const asset of filteredAssets) {
        if (!(asset.altText || '').trim() && !shouldIgnoreMissingAlt(asset)) {
          next.add(asset.id);
        }
      }
      return next;
    });
  };

  const saveSelected = async () => {
    const updates = assets
      .filter((asset) => selectedIds.has(asset.id))
      .map((asset) => {
        const nextAlt = (altDrafts[asset.id] || '').trim();
        const currentAlt = (asset.altText || '').trim();
        return {
          assetId: asset.id,
          updates: {
            altText: nextAlt,
          },
          shouldSave: nextAlt !== currentAlt,
        };
      })
      .filter((entry) => entry.shouldSave)
      .map(({ assetId, updates }) => ({ assetId, updates }));

    if (!updates.length) {
      toast.info('No ALT text changes to save');
      return;
    }

    setIsSaving(true);
    try {
      const result = await bulkUpdateAssets(updates);
      if (result.success > 0) {
        toast.success(`Updated ${result.success} assets`);
      }
      if (result.failed > 0) {
        toast.error(`Failed to update ${result.failed} assets`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const runAIForMissingAlt = async () => {
    setIsGenerating(true);
    try {
      const missingTargets = assets.filter(
        (asset) => !(asset.altText || '').trim() && !shouldIgnoreMissingAlt(asset)
      );
      const suggestions = await generateAltSuggestions(missingTargets, pages, 'missing_only');
      if (!suggestions.length) {
        toast.info('No missing ALT text found');
        return;
      }

      const updates = suggestions
        .filter((suggestion) => suggestion.altText !== undefined)
        .map((suggestion) => ({
          assetId: suggestion.id,
          updates: { altText: suggestion.altText },
        }));

      const result = await bulkUpdateAssets(updates);
      if (result.success > 0) {
        toast.success(`Filled ALT text for ${result.success} assets`);
      }
      if (result.failed > 0) {
        toast.error(`Failed on ${result.failed} assets`);
      }
    } catch (generationError) {
      const message = generationError instanceof Error ? generationError.message : 'Failed to generate ALT text';
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const runAIForSelected = async () => {
    const selectedAssets = assets.filter((asset) => selectedIds.has(asset.id));

    if (!selectedAssets.length) {
      toast.info('Select at least one image first');
      return;
    }

    setIsGenerating(true);
    try {
      const suggestions = await generateAltSuggestions(selectedAssets, pages, 'all');

      setAltDrafts((previous) => {
        const next = { ...previous };
        for (const suggestion of suggestions) {
          next[suggestion.id] = suggestion.altText;
        }
        return next;
      });

      toast.success(`Generated ALT suggestions for ${suggestions.length} selected assets`);
    } catch (generationError) {
      const message = generationError instanceof Error ? generationError.message : 'Failed to generate ALT text';
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Assets ALT Manager
            </CardTitle>
            <CardDescription>
              Review all image assets, check missing ALT text, and bulk-fill with AI.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{assets.length} images</Badge>
            <Badge variant={missingAltCount > 0 ? 'destructive' : 'secondary'}>
              {missingAltCount} missing ALT
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchAssets(folderId)}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by filename or ALT text..."
              className="pl-9"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>

          <Select value={folderId} onValueChange={setFolderId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Asset folder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Folders</SelectItem>
              {folders.map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  {folder.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filter} onValueChange={(value) => setFilter(value as AssetFilter)}>
            <SelectTrigger className="w-[190px]">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Images</SelectItem>
              <SelectItem value="missing-alt">Missing ALT</SelectItem>
              <SelectItem value="has-alt">Has ALT</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => toggleSelectAllVisible(true)}
            disabled={filteredAssets.length === 0}
          >
            Select All Visible
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={selectMissingAlt}
            disabled={filteredAssets.length === 0}
          >
            Select Missing ALT
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
            disabled={selectedIds.size === 0}
          >
            Clear Selection
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={runAIForMissingAlt}
            disabled={isGenerating || loading || missingAltCount === 0}
          >
            <Wand2 className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
            One-Click Fill Missing ALT
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={runAIForSelected}
            disabled={isGenerating || loading || selectedIds.size === 0}
          >
            Generate for Selected
          </Button>
          <Button
            size="sm"
            onClick={saveSelected}
            disabled={isSaving || selectedIds.size === 0}
          >
            Save Selected Changes
          </Button>
        </div>

        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={(checked) => toggleSelectAllVisible(Boolean(checked))}
                    aria-label="Select all visible assets"
                  />
                </TableHead>
                <TableHead className="w-[84px]">Preview</TableHead>
                <TableHead className="w-[220px]">File</TableHead>
                <TableHead>ALT Text</TableHead>
                <TableHead className="w-[160px]">Folder</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAssets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No assets match current filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredAssets.map((asset) => {
                  const hasAlt = !!(asset.altText || '').trim();
                  const draft = altDrafts[asset.id] ?? '';

                  return (
                    <TableRow key={asset.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(asset.id)}
                          onCheckedChange={(checked) => toggleSelect(asset.id, Boolean(checked))}
                          aria-label={`Select ${asset.displayName}`}
                        />
                      </TableCell>
                      <TableCell>
                        <a href={asset.hostedUrl} target="_blank" rel="noreferrer">
                          <img
                            src={asset.hostedUrl}
                            alt={asset.displayName}
                            className="w-14 h-14 rounded object-cover border"
                            loading="lazy"
                          />
                        </a>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium break-all">{asset.displayName}</div>
                          <div className="text-xs text-muted-foreground break-all">
                            {asset.originalFileName}
                          </div>
                          <div>
                            <Badge variant={hasAlt ? 'secondary' : 'destructive'}>
                              {hasAlt ? 'ALT set' : 'Missing ALT'}
                            </Badge>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={draft}
                          onChange={(event) => setDraft(asset.id, event.target.value)}
                          placeholder="Write ALT text"
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {folderByAssetId.get(asset.id) || 'Unassigned'}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="text-xs text-muted-foreground">
          Showing {filteredAssets.length} of {assets.length} images. Selected {selectedIds.size}.
        </div>
      </CardContent>
    </Card>
  );
}
