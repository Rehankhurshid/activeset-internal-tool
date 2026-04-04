'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, Loader2, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

  if (searchableLinks.length === 0) return null;

  const hasResults = result && !error;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && query.trim()) handleCheck(); }}
            placeholder="Search text across pages..."
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <Select value={resolvedScope} onValueChange={setScope}>
          <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs">
            <SelectValue placeholder="Scope" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ({searchableLinks.length})</SelectItem>
            {searchableLinks.map((target) => (
              <SelectItem key={target.id} value={target.id}>
                {target.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleCheck}
          disabled={isChecking || !query.trim() || requestTargets.length === 0}
          className="h-8 text-xs"
        >
          {isChecking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            'Check'
          )}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {hasResults && (
        <div className="space-y-2">
          <div className={cn(
            "rounded-md border px-3 py-2 text-xs",
            result.matchedPages > 0 ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
          )}>
            {result.matchedPages > 0
              ? `${result.matchedPages} ${result.matchedPages === 1 ? 'page matches' : 'pages match'}`
              : 'No matches found'}
            {' · '}{result.scannedPages} pages checked in {formatDuration(result.durationMs)}
          </div>

          {result.matches.length > 0 && (
            <div className="max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
              {result.matches.map((match) => (
                <div key={match.id} className="rounded-md border bg-muted/20 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <a
                      href={match.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-w-0 items-center gap-1 text-xs font-medium hover:underline"
                    >
                      <span className="truncate">{match.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                    </a>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {match.occurrences}x
                    </span>
                  </div>
                  {match.snippets.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {match.snippets.map((snippet, index) => (
                        <div
                          key={`${match.id}-${index}`}
                          className="rounded bg-background px-2 py-1 text-xs text-muted-foreground"
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
        </div>
      )}
    </div>
  );
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs}ms`;
  return `${(durationMs / 1_000).toFixed(1)}s`;
}
