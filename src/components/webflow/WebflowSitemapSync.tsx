'use client';

import { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import {
  RefreshCw,
  EyeOff,
  Eye,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  GitCompareArrows,
  ChevronDown,
  ChevronRight,
  Info,
  FileWarning,
  Link2Off,
} from 'lucide-react';
import { useWebflowSitemapDiff } from '@/hooks/useWebflowSitemapDiff';
import { cn } from '@/lib/utils';

interface WebflowSitemapSyncProps {
  projectId: string;
}

function PathRow({
  path,
  action,
  onClick,
}: {
  path: string;
  action: 'ignore' | 'unignore';
  onClick: (path: string) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-1.5">
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground" title={path}>
        {path}
      </code>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => onClick(path)}
      >
        {action === 'ignore' ? (
          <>
            <EyeOff className="h-3.5 w-3.5" />
            Ignore
          </>
        ) : (
          <>
            <Eye className="h-3.5 w-3.5" />
            Un-ignore
          </>
        )}
      </Button>
    </li>
  );
}

export function WebflowSitemapSync({ projectId }: WebflowSitemapSyncProps) {
  const {
    diff,
    ignorePaths,
    sitemapUrl,
    loading,
    checking,
    error,
    refresh,
    ignore,
    unignore,
  } = useWebflowSitemapDiff(projectId);

  const [showIgnored, setShowIgnored] = useState(false);

  const ignoreSet = useMemo(() => new Set(ignorePaths), [ignorePaths]);
  const missingFromSitemap = useMemo(
    () => (diff?.missingFromSitemap ?? []).filter((p) => !ignoreSet.has(p)),
    [diff, ignoreSet]
  );
  const missingFromWebflow = useMemo(
    () => (diff?.missingFromWebflow ?? []).filter((p) => !ignoreSet.has(p)),
    [diff, ignoreSet]
  );
  const totalDrift = missingFromSitemap.length + missingFromWebflow.length;

  const handleCheck = async () => {
    try {
      const result = await refresh();
      if (result?.error) toast.error(result.error);
      else toast.success('Sitemap check complete');
    } catch {
      toast.error('Failed to check sitemap');
    }
  };

  const handleIgnore = async (path: string) => {
    try {
      await ignore(path);
    } catch {
      toast.error('Failed to ignore path');
    }
  };

  const handleUnignore = async (path: string) => {
    try {
      await unignore(path);
    } catch {
      toast.error('Failed to un-ignore path');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasSitemap = Boolean(sitemapUrl);
  const checkedAt = diff?.checkedAt ? new Date(diff.checkedAt) : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2">
              <GitCompareArrows className="h-5 w-5" />
              Sitemap Sync
            </CardTitle>
            <CardDescription>
              Compares the pages published in Webflow against the URLs in your
              sitemap. Handy for reverse-proxy projects where the sitemap is
              maintained by hand.
            </CardDescription>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
              {hasSitemap ? (
                <a
                  href={sitemapUrl ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 truncate hover:text-foreground hover:underline"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span className="truncate">{sitemapUrl}</span>
                </a>
              ) : (
                <span className="text-amber-600 dark:text-amber-500">No sitemap configured</span>
              )}
              {checkedAt && (
                <span>· Last checked {formatDistanceToNow(checkedAt, { addSuffix: true })}</span>
              )}
            </div>
          </div>
          <Button onClick={handleCheck} disabled={checking} className="shrink-0 gap-2">
            <RefreshCw className={cn('h-4 w-4', checking && 'animate-spin')} />
            {checking ? 'Checking…' : 'Check now'}
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {!hasSitemap && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>No sitemap configured</AlertTitle>
              <AlertDescription>
                Add a sitemap URL for this project (use{' '}
                <span className="font-medium">Scan Sitemap</span> on the project
                page) to enable drift detection.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Couldn&apos;t load</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {diff?.error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Last check failed</AlertTitle>
              <AlertDescription>{diff.error}</AlertDescription>
            </Alert>
          )}

          {!diff && !error && hasSitemap && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <GitCompareArrows className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Not checked yet. Run a check to compare Webflow against your sitemap.
              </p>
              <Button onClick={handleCheck} disabled={checking} variant="secondary" className="gap-2">
                <RefreshCw className={cn('h-4 w-4', checking && 'animate-spin')} />
                Check now
              </Button>
            </div>
          )}

          {diff && !diff.error && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={missingFromSitemap.length > 0 ? 'destructive' : 'secondary'}>
                  {missingFromSitemap.length} not in sitemap
                </Badge>
                <Badge variant={missingFromWebflow.length > 0 ? 'destructive' : 'secondary'}>
                  {missingFromWebflow.length} not in Webflow
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {diff.webflowStaticCount} Webflow static pages · {diff.sitemapStaticCount}{' '}
                  sitemap URLs
                  {ignorePaths.length > 0 ? ` · ${ignorePaths.length} ignored` : ''}
                </span>
              </div>

              {totalDrift === 0 && (
                <Alert className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>In sync</AlertTitle>
                  <AlertDescription>
                    Every static Webflow page is in the sitemap, and vice versa.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <FileWarning className="h-4 w-4 text-amber-500" />
                    In Webflow, not in sitemap
                    <Badge variant="outline">{missingFromSitemap.length}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Published in Webflow but missing from the sitemap — add them so
                    they get indexed.
                  </p>
                  {missingFromSitemap.length === 0 ? (
                    <p className="rounded-md border border-dashed py-4 text-center text-xs text-muted-foreground">
                      None
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {missingFromSitemap.map((path) => (
                        <PathRow key={path} path={path} action="ignore" onClick={handleIgnore} />
                      ))}
                    </ul>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Link2Off className="h-4 w-4 text-amber-500" />
                    In sitemap, not in Webflow
                    <Badge variant="outline">{missingFromWebflow.length}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Listed in the sitemap but with no matching Webflow page — likely
                    stale entries.
                  </p>
                  {missingFromWebflow.length === 0 ? (
                    <p className="rounded-md border border-dashed py-4 text-center text-xs text-muted-foreground">
                      None
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {missingFromWebflow.map((path) => (
                        <PathRow key={path} path={path} action="ignore" onClick={handleIgnore} />
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}

          {ignorePaths.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <button
                type="button"
                onClick={() => setShowIgnored((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                {showIgnored ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                Ignored pages
                <Badge variant="outline">{ignorePaths.length}</Badge>
              </button>
              {showIgnored && (
                <ul className="space-y-1.5">
                  {ignorePaths.map((path) => (
                    <PathRow
                      key={path}
                      path={path}
                      action="unignore"
                      onClick={handleUnignore}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
