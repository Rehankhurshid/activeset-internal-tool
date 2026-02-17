'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  RefreshCw,
  Search,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Edit,
  Globe,
  Settings,
  ListChecks,
  ExternalLink,
  ArrowUpDown,
  Folder,
  Code,
  Database,
  EyeOff,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { WebflowConfig, WebflowPageWithQC, UpdateWebflowPageSEO } from '@/types/webflow';
import { useWebflowPages } from '@/hooks/useWebflowPages';
import { WebflowSEOHealthBadge } from './WebflowSEOHealthBadge';
import { WebflowSEOEditor } from './WebflowSEOEditor';
import { WebflowBulkSEOEditor } from './WebflowBulkSEOEditor';
import { WebflowCredentialsDialog } from './WebflowCredentialsDialog';
import { webflowService } from '@/services/WebflowService';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatForDisplay } from '@/lib/webflow-utils';
import { SEOVariableRenderer } from './SEOVariableRenderer';

interface WebflowPagesDashboardProps {
  projectId: string;
  webflowConfig?: WebflowConfig;
  onSaveConfig: (config: WebflowConfig) => Promise<void>;
  onRemoveConfig: () => Promise<void>;
}

type FilterOption = 'all' | 'issues' | 'critical' | 'good' | 'static' | 'cms';
type SortOption = 'health-asc' | 'health-desc' | 'name' | 'updated';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

export function WebflowPagesDashboard({
  projectId,
  webflowConfig,
  onSaveConfig,
  onRemoveConfig,
}: WebflowPagesDashboardProps) {
  const { pages, loading, error, siteHealth, locales, fetchPages, updatePageSEO, bulkUpdatePagesSEO, generatePageSEO } =
    useWebflowPages(webflowConfig);

  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterOption>('all');
  const [sort, setSort] = useState<SortOption>('health-asc');
  const [showDraftPages, setShowDraftPages] = useState(false);
  const [selectedPage, setSelectedPage] = useState<WebflowPageWithQC | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [bulkEditorOpen, setBulkEditorOpen] = useState(false);

  // Locale state
  const [selectedLocaleId, setSelectedLocaleId] = useState<string | null>(null);
  const [copyingPageId, setCopyingPageId] = useState<string | null>(null);

  // Fetch pages when config is available
  useEffect(() => {
    if (webflowConfig?.siteId && webflowConfig?.apiToken) {
      // If selectedLocaleId changes, we refetch
      fetchPages(selectedLocaleId || undefined);
    }
  }, [webflowConfig, selectedLocaleId, fetchPages]);

  // Filter and sort pages
  const filteredPages = useMemo(() => {
    let result = [...pages];

    // Hide draft pages by default
    if (!showDraftPages) {
      result = result.filter((p) => !p.draft);
    }

    // Search
    if (searchQuery) {
      result = webflowService.searchPages(result, searchQuery);
    }

    // Filter
    switch (filter) {
      case 'issues':
        result = result.filter((p) => p.issues.length > 0);
        break;
      case 'critical':
        result = result.filter((p) => p.seoHealth?.status === 'critical');
        break;
      case 'good':
        result = result.filter((p) => p.seoHealth?.status === 'good');
        break;
      case 'static':
        result = result.filter((p) => !p.collectionId);
        break;
      case 'cms':
        result = result.filter((p) => p.collectionId);
        break;
    }

    // Sort
    switch (sort) {
      case 'health-asc':
        result.sort((a, b) => (a.seoHealth?.score || 0) - (b.seoHealth?.score || 0));
        break;
      case 'health-desc':
        result.sort((a, b) => (b.seoHealth?.score || 0) - (a.seoHealth?.score || 0));
        break;
      case 'name':
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'updated':
        result.sort(
          (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
        );
        break;

    }

    return result;
  }, [pages, searchQuery, filter, sort, showDraftPages]);

  // Group pages for display
  const { staticPagesDisplay, cmsPagesDisplay } = useMemo(() => {
    // Only group if "All" filter is active and no search query
    if (filter === 'all' && !searchQuery && sort === 'health-asc') {
      return {
        staticPagesDisplay: filteredPages.filter(p => !p.collectionId),
        cmsPagesDisplay: filteredPages.filter(p => p.collectionId)
      };
    }
    return { staticPagesDisplay: filteredPages, cmsPagesDisplay: [] };
  }, [filteredPages, filter, searchQuery, sort]);

  const showGroups = filter === 'all' && !searchQuery && sort === 'health-asc';
  const displayedPages = showGroups ? [] : filteredPages; // used for fallback list

  const handleEditPage = (page: WebflowPageWithQC) => {
    setSelectedPage(page);
    setEditorOpen(true);
  };

  const handleSaveSEO = async (pageId: string, updates: UpdateWebflowPageSEO) => {
    return await updatePageSEO(pageId, updates);
  };

  // No config state
  const handleCopyDOM = async (pageId: string) => {
    if (!webflowConfig?.apiToken) {
      toast.error("Missing API Token");
      return;
    }

    setCopyingPageId(pageId);
    try {
      // Use existing API route
      const response = await fetch(`/api/webflow/pages/${pageId}/content`, {
        headers: {
          'x-webflow-token': webflowConfig.apiToken,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch page content");
      }

      const result = await response.json();

      if (result.success && result.data) {
        // Copy to clipboard
        await navigator.clipboard.writeText(JSON.stringify(result.data, null, 2));
        toast.success("DOM details copied to clipboard!");
      } else {
        throw new Error(result.error || "No content found");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to copy DOM details");
    } finally {
      setCopyingPageId(null);
    }
  };

  if (!webflowConfig) {
    return (
      <Card>
        <CardHeader className="text-center">
          <Globe className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <CardTitle>Connect to Webflow</CardTitle>
          <CardDescription>
            Connect your Webflow site to manage pages and optimize SEO settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <WebflowCredentialsDialog onSave={onSaveConfig} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Pages</CardDescription>
            <CardTitle className="text-2xl">
              {loading ? <Skeleton className="h-8 w-12" /> : siteHealth?.staticPages ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {siteHealth?.cmsPages ? `+ ${siteHealth.cmsPages} CMS templates` : 'Static pages'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pages with Issues</CardDescription>
            <CardTitle className="text-2xl text-yellow-600">
              {loading ? <Skeleton className="h-8 w-12" /> : siteHealth?.pagesWithIssues ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {siteHealth?.totalIssues ?? 0} total issues
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Critical Issues</CardDescription>
            <CardTitle className="text-2xl text-red-600">
              {loading ? <Skeleton className="h-8 w-12" /> : siteHealth?.criticalPages ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Need immediate attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average SEO Score</CardDescription>
            <CardTitle className="text-2xl">
              {loading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <span
                  className={
                    (siteHealth?.averageScore ?? 0) >= 80
                      ? 'text-green-600'
                      : (siteHealth?.averageScore ?? 0) >= 50
                        ? 'text-yellow-600'
                        : 'text-red-600'
                  }
                >
                  {siteHealth?.averageScore ?? 0}%
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Across all static pages</p>
          </CardContent>
        </Card>
      </div>

      {/* Critical Alert */}
      {siteHealth && siteHealth.criticalPages > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Critical SEO Issues Found</AlertTitle>
          <AlertDescription>
            {siteHealth.criticalPages} page(s) have critical SEO issues that need immediate
            attention. These pages may not rank well in search engines.
          </AlertDescription>
        </Alert>
      )}

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Pages Section */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Pages
                {webflowConfig.siteName && (
                  <Badge variant="outline" className="ml-2 font-normal">
                    {webflowConfig.siteName}
                  </Badge>
                )}
                {selectedLocaleId && locales.length > 0 && (
                  <Badge variant="secondary" className="ml-2 font-normal bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                    <Globe className="h-3 w-3 mr-1" />
                    {locales.find(l => l.id === selectedLocaleId)?.displayName || 'Locale'}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Manage SEO settings for your Webflow pages
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => setBulkEditorOpen(true)}
                disabled={loading || pages.length === 0}
              >
                <ListChecks className="h-4 w-4 mr-2" />
                Bulk Edit
              </Button>
              <WebflowCredentialsDialog
                currentConfig={webflowConfig}
                onSave={onSaveConfig}
                onRemove={onRemoveConfig}
                trigger={
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </Button>
                }
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchPages(selectedLocaleId || undefined)}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title, slug, or path..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Locale Selector */}
            {locales.length > 0 && (
              <Select
                value={selectedLocaleId || 'primary'}
                onValueChange={(val) => setSelectedLocaleId(val === 'primary' ? null : val)}
                disabled={loading}
              >
                <SelectTrigger className="w-[160px]">
                  <Globe className="h-4 w-4 mr-2 opacity-50" />
                  <SelectValue placeholder="Locale" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">
                    <span>Primary</span>
                  </SelectItem>
                  {locales.map(l => (
                    <SelectItem key={l.id} value={l.id}>
                      <span>{l.displayName}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={filter} onValueChange={(v) => setFilter(v as FilterOption)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Pages</SelectItem>
                <SelectItem value="issues">Has Issues</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="good">Good</SelectItem>
                <SelectItem value="static">Static Pages</SelectItem>
                <SelectItem value="cms">CMS Templates</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="health-asc">Score: Low → High</SelectItem>
                <SelectItem value="health-desc">Score: High → Low</SelectItem>
                <SelectItem value="name">Name A-Z</SelectItem>
                <SelectItem value="updated">Recently Updated</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 rounded-md border px-3 py-2 h-10">
              <Switch
                id="show-draft-pages"
                checked={showDraftPages}
                onCheckedChange={setShowDraftPages}
              />
              <label
                htmlFor="show-draft-pages"
                className="text-sm text-muted-foreground cursor-pointer select-none"
              >
                Show Draft Pages
              </label>
            </div>
          </div>

          {/* Pages List */}
          {loading ? (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px]">Page</TableHead>
                    <TableHead>Path</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead>SEO Health</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : filteredPages.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium mb-1">
                {searchQuery || filter !== 'all'
                  ? 'No pages match your filters'
                  : 'No pages found'}
              </p>
              <p className="text-sm">
                {searchQuery || filter !== 'all'
                  ? 'Try adjusting your search or filter'
                  : 'Connect your Webflow site to see pages'}
              </p>
            </div>
          ) : (
            <TooltipProvider>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[25%]">Page Name</TableHead>
                      <TableHead className="w-[15%]">Path</TableHead>
                      <TableHead className="w-[10%]">Status</TableHead>
                      <TableHead className="w-[20%]">Meta Title</TableHead>
                      <TableHead className="w-[20%]">Meta Description</TableHead>
                      <TableHead className="w-[5%]">Issues</TableHead>
                      <TableHead className="text-right w-[5%]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {showGroups ? (
                      <>
                        {staticPagesDisplay.length > 0 && (
                          <>
                            <TableRow className="hover:bg-transparent bg-muted/30">
                              <TableCell colSpan={7} className="py-2 font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                                Static Pages ({staticPagesDisplay.length})
                              </TableCell>
                            </TableRow>
                            {staticPagesDisplay.map(page => (
                              <PageRow key={page.id} page={page} webflowConfig={webflowConfig} handleEditPage={handleEditPage} handleCopyDOM={handleCopyDOM} copyingPageId={copyingPageId} />
                            ))}
                          </>
                        )}
                        {cmsPagesDisplay.length > 0 && (
                          <>
                            <TableRow className="hover:bg-transparent bg-muted/30">
                              <TableCell colSpan={7} className="py-2 font-semibold text-xs text-muted-foreground uppercase tracking-wider border-t">
                                CMS Templates ({cmsPagesDisplay.length})
                              </TableCell>
                            </TableRow>
                            {cmsPagesDisplay.map(page => (
                              <PageRow key={page.id} page={page} webflowConfig={webflowConfig} handleEditPage={handleEditPage} handleCopyDOM={handleCopyDOM} copyingPageId={copyingPageId} />
                            ))}
                          </>
                        )}
                      </>
                    ) : (
                      filteredPages.map((page) => (
                        <PageRow key={page.id} page={page} webflowConfig={webflowConfig} handleEditPage={handleEditPage} handleCopyDOM={handleCopyDOM} copyingPageId={copyingPageId} />
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TooltipProvider>
          )}

          {/* Results Count */}
          {!loading && filteredPages.length > 0 && (
            <div className="mt-4 text-center text-sm text-muted-foreground">
              Showing {filteredPages.length} of {showDraftPages ? pages.length : pages.filter((p) => !p.draft).length} pages
            </div>
          )}
        </CardContent>
      </Card>

      {/* SEO Editor Sheet */}
      <WebflowSEOEditor
        page={selectedPage}
        locales={locales}
        apiToken={webflowConfig?.apiToken}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSave={handleSaveSEO}
        onGenerateSEO={generatePageSEO}
      />

      {/* Bulk SEO Editor */}
      <WebflowBulkSEOEditor
        localeId={selectedLocaleId}
        pages={pages}
        open={bulkEditorOpen}
        onOpenChange={setBulkEditorOpen}
        onSave={bulkUpdatePagesSEO}
        onGenerateSEO={generatePageSEO}
      />
    </div>
  );
}

function PageRow({
  page,
  webflowConfig,
  handleEditPage,
  handleCopyDOM,
  copyingPageId
}: {
  page: WebflowPageWithQC;
  webflowConfig: WebflowConfig;
  handleEditPage: (page: WebflowPageWithQC) => void;
  handleCopyDOM: (pageId: string) => void;
  copyingPageId: string | null;
}) {
  return (
    <TableRow className="group">
      <TableCell className="font-medium align-top py-3">
        <div className="flex flex-col gap-1">
          {page.publishedPath && page.publishedPath.split('/').length > 2 && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
              <Folder className="h-3 w-3" />
              <span>{page.publishedPath.split('/')[1]}</span>
            </div>
          )}
          <HoverCard>
            <HoverCardTrigger asChild>
              <div className="flex items-center gap-2 cursor-help w-fit">
                {page.collectionId && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800">
                    <Database className="h-3 w-3 mr-1" />
                    CMS
                  </Badge>
                )}
                <span>{page.title || 'Untitled'}</span>
              </div>
            </HoverCardTrigger>
            <HoverCardContent className="w-[450px] p-0" align="start">
              <div className="p-4 space-y-3 whitespace-normal">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold break-words">{page.title || 'Untitled'}</h4>
                  <p className="text-xs text-muted-foreground break-all">
                    {page.publishedPath
                      ? `https://${webflowConfig.customDomain || webflowConfig.siteName?.toLowerCase().replace(/\s+/g, '') + '.webflow.io'}${page.publishedPath}`
                      : `/${page.slug}`}
                  </p>
                </div>
                <Separator />
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] font-medium uppercase text-muted-foreground tracking-wider">SEO Title</span>
                    <div className="text-xs mt-0.5 break-words">
                      <SEOVariableRenderer text={page.seo?.title} fallback={<span className="text-muted-foreground italic">Missing</span>} />
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-medium uppercase text-muted-foreground tracking-wider">Meta Description</span>
                    <div className="text-xs mt-0.5 break-words">
                      <SEOVariableRenderer text={page.seo?.description} fallback={<span className="text-muted-foreground italic">Missing</span>} />
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium uppercase text-muted-foreground tracking-wider">Open Graph</span>
                  </div>
                  <div className="grid grid-cols-[60px_1fr] gap-2 text-xs">
                    <span className="text-muted-foreground">Title:</span>
                    <span className="break-words">
                      {page.openGraph?.titleCopied ? (
                        <span className="text-muted-foreground italic">Same as SEO</span>
                      ) : (
                        <SEOVariableRenderer text={page.openGraph?.title} fallback={<span className="text-muted-foreground italic">Missing</span>} />
                      )}
                    </span>

                    <span className="text-muted-foreground">Desc:</span>
                    <span className="break-words">
                      {page.openGraph?.descriptionCopied ? (
                        <span className="text-muted-foreground italic">Same as SEO</span>
                      ) : (
                        <SEOVariableRenderer text={page.openGraph?.description} fallback={<span className="text-muted-foreground italic">Missing</span>} />
                      )}
                    </span>
                  </div>
                </div>
                {page.issues.length > 0 && (
                  <>
                    <Separator />
                    <div className="bg-amber-50 dark:bg-amber-950/20 p-2 rounded -mx-2">
                      <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-500 mb-1.5">
                        <AlertTriangle className="h-3 w-3" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Issues Found</span>
                      </div>
                      <ul className="text-xs space-y-1">
                        {page.issues.slice(0, 3).map((issue, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="mt-1 block h-1 w-1 rounded-full bg-amber-500 shrink-0" />
                            <span className="opacity-90">{issue.message}</span>
                          </li>
                        ))}
                        {page.issues.length > 3 && (
                          <li className="text-[10px] text-muted-foreground pl-2.5">
                            +{page.issues.length - 3} more
                          </li>
                        )}
                      </ul>
                    </div>
                  </>
                )}
              </div>
            </HoverCardContent>
          </HoverCard>
          <span className="text-xs text-muted-foreground md:hidden">
            {formatDistanceToNow(new Date(page.lastUpdated))} ago
          </span>
        </div>
      </TableCell>
      <TableCell className="align-top py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="truncate max-w-[150px]" title={page.publishedPath || `/${page.slug || ''}`}>
            {page.publishedPath || `/${page.slug || ''}`}
          </span>
        </div>
      </TableCell>
      <TableCell className="align-top py-3">
        <div className="flex items-center">
          {page.archived ? (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="h-6 w-6 p-0 flex items-center justify-center rounded-full border-dashed opacity-70">
                  <EyeOff className="h-3 w-3 text-muted-foreground" />
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Archived</TooltipContent>
            </Tooltip>
          ) : page.draft ? (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="secondary" className="h-6 w-auto px-2 text-[10px] font-medium">
                  Draft
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Draft (Not Published)</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-200 dark:border-green-800">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[10px] font-medium">Live</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>Published</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
      <TableCell className="align-top py-3">
        {page.seo?.title ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-sm truncate max-w-[200px] cursor-help">
                <SEOVariableRenderer text={page.seo.title} />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[300px] break-words">
              <div><SEOVariableRenderer text={page.seo.title} /></div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-xs text-muted-foreground italic">Missing</span>
        )}
      </TableCell>
      <TableCell className="align-top py-3">
        {page.seo?.description ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-sm truncate max-w-[250px] cursor-help">
                <SEOVariableRenderer text={page.seo.description} />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[400px] break-words">
              <div><SEOVariableRenderer text={page.seo.description} /></div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-xs text-muted-foreground italic">Missing</span>
        )}
      </TableCell>
      <TableCell className="align-top py-3">
        {page.issues.length > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 text-amber-600 dark:text-amber-500 cursor-help">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs font-medium">{page.issues.length}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex flex-col gap-1">
                {page.issues.map((issue, i) => (
                  <span key={i} className="text-xs">• {issue.message}</span>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <CheckCircle2 className="h-4 w-4 text-green-500 opacity-50" />
        )}
      </TableCell>
      <TableCell className="text-right align-top py-3">
        <div className="flex items-center justify-end gap-2">
          {!page.draft && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    asChild
                  >
                    <a
                      href={page.publishedPath
                        ? `https://${webflowConfig.customDomain || webflowConfig.siteName?.toLowerCase().replace(/\s+/g, '') + '.webflow.io'}${page.publishedPath}`
                        : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View page</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => handleCopyDOM(page.id)}
                    disabled={copyingPageId === page.id}
                  >
                    <Code className={`h-4 w-4 ${copyingPageId === page.id ? 'animate-pulse text-violet-500' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy DOM Details</TooltipContent>
              </Tooltip>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => handleEditPage(page)}
          >
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
