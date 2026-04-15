'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  AlertTriangle,
  Check,
  Copy,
  Database,
  ExternalLink,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSchemaAnalysis } from '@/hooks/useSchemaAnalysis';
import type {
  SchemaConfidence,
  SchemaRecommendation,
} from '@/types/schema-markup';

interface WebflowSchemaPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  pageId: string;
  pageTitle: string;
  /** Fully qualified live URL — panel shows an error if empty. */
  liveUrl: string | null;
}

const CONFIDENCE_STYLES: Record<SchemaConfidence, string> = {
  high: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  low: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
};

export function WebflowSchemaPanel({
  open,
  onOpenChange,
  projectId,
  pageId,
  pageTitle,
  liveUrl,
}: WebflowSchemaPanelProps) {
  const { loading, stage, result, signals, error, fromCache, run, reset } =
    useSchemaAnalysis({
      projectId,
      pageId,
      url: liveUrl ?? '',
    });

  // Auto-run on open (only if URL available and nothing loaded yet).
  useEffect(() => {
    if (open && liveUrl && stage === 'idle') {
      void run();
    }
    if (!open) {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, liveUrl]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-hidden p-0 flex flex-col"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            Schema Markup
          </SheetTitle>
          <SheetDescription className="truncate">
            {pageTitle}
            {liveUrl && (
              <>
                {' — '}
                <a
                  href={liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline inline-flex items-center gap-1"
                >
                  {liveUrl.replace(/^https?:\/\//, '')}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 py-3 border-b flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => run({ force: true })}
            disabled={loading || !liveUrl}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 mr-2 ${loading ? 'animate-spin' : ''}`}
            />
            {fromCache ? 'Re-analyze' : 'Refresh'}
          </Button>
          {fromCache && (
            <Badge variant="secondary" className="text-xs">
              <Database className="h-3 w-3 mr-1" />
              Cached
            </Badge>
          )}
          {stage === 'scraping' && (
            <span className="text-xs text-muted-foreground">Scraping page…</span>
          )}
          {stage === 'analyzing' && (
            <span className="text-xs text-muted-foreground">
              Analyzing with Gemma (local)…
            </span>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="px-6 py-4 space-y-6">
            {!liveUrl && <NoLiveUrlState />}

            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Analysis failed</AlertTitle>
                <AlertDescription className="break-words">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            {loading && !result && <LoadingState />}

            {result && (
              <>
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Page Classification</h3>
                    <Badge variant="outline" className="capitalize">
                      {result.pageType}
                    </Badge>
                  </div>
                  {result.summary && (
                    <p className="text-sm text-muted-foreground">
                      {result.summary}
                    </p>
                  )}
                </section>

                <Separator />

                <section>
                  <h3 className="text-sm font-semibold mb-3">
                    Existing Schema on Page
                    <Badge variant="secondary" className="ml-2">
                      {result.existing.length}
                    </Badge>
                  </h3>
                  {result.existing.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No JSON-LD schema detected.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {result.existing.map((item, i) => (
                        <div
                          key={i}
                          className="border rounded-md p-3 bg-muted/30"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <Badge>{item.type}</Badge>
                            {item.issues.length === 0 ? (
                              <Badge
                                variant="outline"
                                className="text-emerald-600 border-emerald-600/40"
                              >
                                <Check className="h-3 w-3 mr-1" />
                                OK
                              </Badge>
                            ) : (
                              <Badge variant="destructive">
                                {item.issues.length} issue
                                {item.issues.length > 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                          {item.issues.length > 0 && (
                            <ul className="text-xs text-muted-foreground space-y-1 mb-2 list-disc list-inside">
                              {item.issues.map((iss, j) => (
                                <li key={j}>{iss}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <Separator />

                <section>
                  <h3 className="text-sm font-semibold mb-3">
                    Recommendations
                    <Badge variant="secondary" className="ml-2">
                      {result.recommended.length}
                    </Badge>
                  </h3>
                  {result.recommended.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No additional schema recommended.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {result.recommended.map((rec, i) => (
                        <RecommendationCard key={i} rec={rec} />
                      ))}
                    </div>
                  )}
                </section>

                <Separator />

                <p className="text-xs text-muted-foreground">
                  Paste the JSON-LD into your Webflow page under{' '}
                  <strong>Page Settings → Custom Code → Inside &lt;head&gt;</strong>,
                  wrapped in a{' '}
                  <code className="bg-muted px-1 py-0.5 rounded">
                    &lt;script type=&quot;application/ld+json&quot;&gt;
                  </code>{' '}
                  tag.
                </p>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function RecommendationCard({ rec }: { rec: SchemaRecommendation }) {
  const [copied, setCopied] = useState(false);

  const formatted = useMemo(
    () => JSON.stringify(rec.jsonLd, null, 2),
    [rec.jsonLd]
  );

  const scriptTag = useMemo(
    () =>
      `<script type="application/ld+json">\n${formatted}\n</script>`,
    [formatted]
  );

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed');
    }
  };

  const validatorUrl = `https://validator.schema.org/#url=${encodeURIComponent(
    'data:application/ld+json,' + encodeURIComponent(formatted)
  )}`;

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="px-3 py-2 bg-muted/40 flex flex-wrap items-center gap-2">
        <Badge>{rec.type}</Badge>
        <Badge
          variant="outline"
          className={CONFIDENCE_STYLES[rec.confidence]}
        >
          {rec.confidence} confidence
        </Badge>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => copy(formatted, 'JSON-LD')}
          >
            {copied ? (
              <Check className="h-3 w-3 mr-1" />
            ) : (
              <Copy className="h-3 w-3 mr-1" />
            )}
            Copy JSON
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => copy(scriptTag, '<script> tag')}
          >
            <Copy className="h-3 w-3 mr-1" />
            Copy &lt;script&gt;
          </Button>
        </div>
      </div>
      {rec.reason && (
        <p className="px-3 py-2 text-sm text-muted-foreground border-b">
          {rec.reason}
        </p>
      )}
      <pre className="px-3 py-2 text-xs bg-background overflow-x-auto max-h-72">
        <code>{formatted}</code>
      </pre>
      <div className="px-3 py-2 border-t bg-muted/20">
        <a
          href={validatorUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
        >
          Validate on schema.org
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

function NoLiveUrlState() {
  return (
    <Alert>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Live URL not available</AlertTitle>
      <AlertDescription>
        Schema analysis requires the published custom domain. Configure it in
        Webflow credentials and make sure the page has been published.
      </AlertDescription>
    </Alert>
  );
}
