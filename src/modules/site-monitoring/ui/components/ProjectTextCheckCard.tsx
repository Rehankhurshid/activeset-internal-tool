'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, ExternalLink, FileSearch, Loader2, Search } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { ProjectLink } from '@/modules/site-monitoring';
import type { WebsiteTextCheckResponse, WebsiteTextCheckTarget } from '@/types';

interface ProjectTextCheckCardProps {
  links: ProjectLink[];
}

const MAX_TARGETS = 150;

export function ProjectTextCheckCard({ links }: ProjectTextCheckCardProps) {
  const searchableLinks = useMemo(() => {
    const validTargets: WebsiteTextCheckTarget[] = [];
    const seen = new Set<string>();

    for (const link of links) {
      if (!link.url?.trim()) continue;

      try {
        const normalizedUrl = new URL(link.url).href;
        if (seen.has(normalizedUrl)) continue;

        seen.add(normalizedUrl);
        validTargets.push({
          id: link.id,
          title: link.title,
          url: normalizedUrl,
        });
      } catch {
        continue;
      }
    }

    return validTargets;
  }, [links]);

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<string>('all');
  const [result, setResult] = useState<WebsiteTextCheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const resolvedScope =
    scope === 'all' || searchableLinks.some((link) => link.id === scope) ? scope : 'all';

  const selectedTargets = useMemo(() => {
    if (resolvedScope === 'all') return searchableLinks;
    return searchableLinks.filter((link) => link.id === resolvedScope);
  }, [resolvedScope, searchableLinks]);

  const requestTargets = selectedTargets.slice(0, MAX_TARGETS);
  const hasTargetLimit = selectedTargets.length > MAX_TARGETS;

  const checkLabel =
    requestTargets.length === 1
      ? 'Check page'
      : `Check ${requestTargets.length} pages`;

  const handleCheck = async () => {
    if (!query.trim() || requestTargets.length === 0) return;

    setIsChecking(true);
    setError(null);

    try {
      const response = await fetch('/api/project-text-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          pages: requestTargets,
        }),
      });

      const data = (await response.json()) as WebsiteTextCheckResponse | { error?: string };

      if (!response.ok) {
        const message = typeof data === 'object' && data && 'error' in data ? data.error : undefined;
        throw new Error(message || 'Failed to check website text.');
      }

      setResult(data as WebsiteTextCheckResponse);
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : 'Failed to check website text.';
      setError(message);
      setResult(null);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="gap-2">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <FileSearch className="h-4 w-4 text-primary" />
          Quick Text Check
        </CardTitle>
        <CardDescription>
          Search the saved project URLs without running a browser. This uses lightweight HTML fetches, so it is fast and resource-conscious.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {searchableLinks.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No searchable URLs yet</AlertTitle>
            <AlertDescription>
              Add at least one valid project link to use text check.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)_auto]">
              <Select value={resolvedScope} onValueChange={setScope}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose pages" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All saved URLs ({searchableLinks.length})</SelectItem>
                  {searchableLinks.map((target) => (
                    <SelectItem key={target.id} value={target.id}>
                      {target.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Textarea
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Text to search for, for example: Schedule a call"
                rows={2}
                className="min-h-[72px] resize-y"
              />

              <Button
                type="button"
                onClick={handleCheck}
                disabled={isChecking || !query.trim() || requestTargets.length === 0}
                className="h-auto min-h-9 lg:self-stretch"
              >
                {isChecking ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    {checkLabel}
                  </>
                )}
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              Searches {requestTargets.length} stored {requestTargets.length === 1 ? 'URL' : 'URLs'} already attached to this project.
              {hasTargetLimit ? ` Limited to the first ${MAX_TARGETS} URLs for speed.` : ''}
            </div>
          </>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Text check failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && !error && (
          <div className="space-y-3">
            <Alert className={cn(result.matchedPages > 0 ? 'border-emerald-500/30' : 'border-border')}>
              <FileSearch className="h-4 w-4" />
              <AlertTitle>
                {result.matchedPages > 0
                  ? `${result.matchedPages} ${result.matchedPages === 1 ? 'page matches' : 'pages match'}`
                  : 'No matches found'}
              </AlertTitle>
              <AlertDescription>
                Checked {result.scannedPages} of {result.totalPages} pages in {formatDuration(result.durationMs)}.
                {result.errors.length > 0 ? ` ${result.errors.length} pages could not be checked.` : ''}
              </AlertDescription>
            </Alert>

            {result.matches.length > 0 && (
              <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                {result.matches.map((match) => (
                  <div key={match.id} className="rounded-lg border bg-muted/20 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="font-medium">{match.title}</div>
                        {match.titleTag && match.titleTag !== match.title && (
                          <div className="text-xs text-muted-foreground">
                            HTML title: {match.titleTag}
                          </div>
                        )}
                        <a
                          href={match.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                          <span className="truncate">{match.url}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </div>

                      <div className="shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium">
                        {match.occurrences} {match.occurrences === 1 ? 'match' : 'matches'}
                      </div>
                    </div>

                    {match.snippets.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {match.snippets.map((snippet, index) => (
                          <div
                            key={`${match.id}-${index}`}
                            className="rounded-md bg-background px-3 py-2 text-sm text-muted-foreground"
                          >
                            {snippet}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="space-y-2 rounded-lg border border-dashed px-4 py-3">
                <div className="text-sm font-medium">Pages skipped or failed</div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  {result.errors.slice(0, 5).map((item) => (
                    <div key={item.id}>
                      {item.title}: {item.message}
                    </div>
                  ))}
                  {result.errors.length > 5 && (
                    <div>+{result.errors.length - 5} more pages</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs}ms`;
  return `${(durationMs / 1_000).toFixed(1)}s`;
}
