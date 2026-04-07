'use client';

import { useState, useRef, useMemo, type ChangeEvent } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  FileJson,
  Globe,
  Loader2,
  Settings2,
  Terminal,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '@/modules/auth-access';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { AppNavigation } from '@/shared/ui';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseUrls(text: string): string[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => line.split(','))
    .map((t) => t.trim())
    .filter(Boolean);
}

function dedupeUrls(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of raw) {
    try {
      const u = new URL(candidate);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      u.hash = '';
      const key = u.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    } catch {
      /* skip invalid */
    }
  }
  return out;
}

function slugify(v: string): string {
  return (
    v
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'capture-run'
  );
}

function shellQuote(v: string): string {
  return `"${v.replace(/(["\\$`])/g, '\\$1')}"`;
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === '/' ? '' : u.pathname;
    return u.host + path;
  } catch {
    return url;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ScreenshotRunnerPage() {
  const { user, loading, signInWithGoogle } = useAuth();

  // Core state
  const [projectName, setProjectName] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [urlsList, setUrlsList] = useState<string[]>([]);
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [isFetchingSitemap, setIsFetchingSitemap] = useState(false);
  const [sitemapError, setSitemapError] = useState('');
  const [showAllUrls, setShowAllUrls] = useState(false);

  // Upload state
  const [uploadDir, setUploadDir] = useState('');
  const [uploadCopied, setUploadCopied] = useState(false);
  const [uploadManifest, setUploadManifest] = useState<{
    projectName: string;
    runId: string;
    urlCount: number;
    signed: boolean;
    dir: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Advanced (hidden by default)
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [outputDir, setOutputDir] = useState('./captures');
  const [captureDesktop, setCaptureDesktop] = useState(true);
  const [captureMobile, setCaptureMobile] = useState(true);
  const [format, setFormat] = useState<'webp' | 'png'>('webp');
  const [warmup, setWarmup] = useState<'always' | 'off'>('always');
  const [uploadEnabled, setUploadEnabled] = useState(true);

  // UI state
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const urls = useMemo(() => dedupeUrls(urlsList), [urlsList]);
  const devices = [captureDesktop && 'desktop', captureMobile && 'mobile'].filter(Boolean) as string[];
  const slug = useMemo(() => slugify(projectName), [projectName]);
  const fileName = `${slug}-urls.txt`;

  const canRun = urls.length > 0 && devices.length > 0 && projectName.trim().length > 0;

  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://app.activeset.co';

  const VISIBLE_URL_COUNT = 5;

  // Build the CLI command
  const cliCommand = useMemo(() => {
    if (!canRun) return '';
    const parts = [
      `npx @activeset/capture run`,
      `--project ${shellQuote(projectName.trim())}`,
      `--file ${shellQuote(`./${fileName}`)}`,
      `--out ${shellQuote(outputDir)}`,
      `--devices ${devices.join(',')}`,
      `--format ${format}`,
    ];
    if (warmup === 'off') parts.push('--warmup off');
    if (uploadEnabled) parts.push(`--upload ${shellQuote(appUrl)}`);
    return parts.join(' \\\n  ');
  }, [canRun, projectName, fileName, outputDir, devices, format, warmup, uploadEnabled, appUrl]);

  // Full terminal block: write the file + run
  const terminalBlock = useMemo(() => {
    if (!canRun) return '';
    const fileContent = urls.join('\n');
    return [
      `cat <<'EOF' > ${shellQuote(`./${fileName}`)}`,
      fileContent,
      'EOF',
      '',
      cliCommand,
    ].join('\n');
  }, [canRun, urls, fileName, cliCommand]);

  // Upload command
  const uploadCommand = useMemo(() => {
    if (!uploadDir.trim()) return '';
    return `npx @activeset/capture upload ${shellQuote(uploadDir.trim())} --to ${shellQuote(appUrl)}`;
  }, [uploadDir, appUrl]);

  /* -- Actions -- */

  const addUrl = (text: string) => {
    const newUrls = dedupeUrls(parseUrls(text));
    if (newUrls.length > 0) {
      setUrlsList((prev) => dedupeUrls([...prev, ...newUrls]));
    }
    setUrlInput('');
  };

  const removeUrl = (url: string) => {
    setUrlsList((prev) => prev.filter((u) => u !== url));
  };

  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addUrl(urlInput);
    }
  };

  const handleUrlPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    const lines = pasted.split(/\r?\n/).filter(Boolean);
    if (lines.length > 1) {
      e.preventDefault();
      addUrl(pasted);
    }
  };

  const copyToClipboard = async () => {
    if (!terminalBlock) return;
    try {
      await navigator.clipboard.writeText(terminalBlock);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback: user can manually select */
    }
  };

  const copyUploadCommand = async () => {
    if (!uploadCommand) return;
    try {
      await navigator.clipboard.writeText(uploadCommand);
      setUploadCopied(true);
      setTimeout(() => setUploadCopied(false), 2000);
    } catch {
      /* fallback */
    }
  };

  const fetchSitemap = async () => {
    const url = sitemapUrl.trim();
    if (!url) return;
    setSitemapError('');
    setIsFetchingSitemap(true);
    try {
      const res = await fetch(`/api/sitemap-links?url=${encodeURIComponent(url)}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Failed (${res.status})`);
      }
      const { urls: fetched } = (await res.json()) as { urls?: string[] };
      const valid = dedupeUrls(fetched ?? []);
      if (valid.length === 0) throw new Error('No URLs found in sitemap.');
      setUrlsList((prev) => dedupeUrls([...prev, ...valid]));
      setSitemapUrl('');
    } catch (e) {
      setSitemapError(e instanceof Error ? e.message : 'Failed to fetch sitemap.');
    } finally {
      setIsFetchingSitemap(false);
    }
  };

  const handleFileImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const parsed = dedupeUrls(parseUrls(text));
    if (parsed.length > 0) {
      setUrlsList((prev) => dedupeUrls([...prev, ...parsed]));
    }
  };

  const handleManifestDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const manifest = JSON.parse(text);

      if (!manifest.run?.id) throw new Error('Invalid manifest');

      // Try to extract the capture directory from the first outputPath
      let dir = '';
      for (const result of manifest.results || []) {
        for (const dr of result.deviceResults || []) {
          if (dr.outputPath) {
            // outputPath is like /Users/.../captures/project-name-timestamp/desktop/file.webp
            // Go up two levels from the file to get the run directory
            const parts = dr.outputPath.replace(/\\/g, '/').split('/');
            // Remove filename and device folder
            parts.pop(); // file
            parts.pop(); // device
            dir = parts.join('/');
            break;
          }
        }
        if (dir) break;
      }

      setUploadManifest({
        projectName: manifest.run.projectName || 'Unknown',
        runId: manifest.run.id,
        urlCount: manifest.summary?.totalUrls || 0,
        signed: !!manifest.signature,
        dir,
      });
      setUploadDir(dir);
    } catch {
      setUploadManifest(null);
    }
  };

  /* -- Auth gates -- */

  if (loading) {
    return (
      <div className="p-8">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
        <p className="text-sm text-muted-foreground">Sign in to use the screenshot runner.</p>
        <Button onClick={signInWithGoogle}>Sign in with Google</Button>
      </div>
    );
  }

  /* -- Render -- */

  const visibleUrls = showAllUrls ? urls : urls.slice(0, VISIBLE_URL_COUNT);
  const hiddenCount = urls.length - VISIBLE_URL_COUNT;

  return (
    <div className="min-h-screen bg-background">
      <AppNavigation title="Screenshot Runner" showBackButton backHref="/" />

      <main className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
        {/* ── Step 1: Project + URLs ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">1. Add your URLs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Project name</label>
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. Client Website Redesign"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  URLs
                  {urls.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({urls.length})
                    </span>
                  )}
                </label>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => fileRef.current?.click()}
                  >
                    Import file
                  </Button>
                  {urls.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => setUrlsList([])}
                    >
                      Clear all
                    </Button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".txt,.csv"
                    className="hidden"
                    onChange={handleFileImport}
                  />
                </div>
              </div>

              {/* URL input */}
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={handleUrlKeyDown}
                onPaste={handleUrlPaste}
                placeholder="Paste URLs and press Enter (supports multiple lines)"
                className="font-mono text-sm"
              />

              {/* URL chips */}
              {urls.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {visibleUrls.map((url) => (
                    <Badge
                      key={url}
                      variant="secondary"
                      className="max-w-[300px] gap-1 pr-1 font-mono text-xs font-normal"
                    >
                      <span className="truncate">{shortenUrl(url)}</span>
                      <button
                        type="button"
                        onClick={() => removeUrl(url)}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  {!showAllUrls && hiddenCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setShowAllUrls(true)}
                    >
                      +{hiddenCount} more
                    </Button>
                  )}
                  {showAllUrls && urls.length > VISIBLE_URL_COUNT && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setShowAllUrls(false)}
                    >
                      Show less
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Sitemap fetch - compact inline */}
            <div className="flex items-end gap-2 rounded-lg border border-dashed p-3">
              <div className="flex-1 space-y-1">
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" />
                  Or fetch from sitemap
                </label>
                <Input
                  value={sitemapUrl}
                  onChange={(e) => setSitemapUrl(e.target.value)}
                  placeholder="https://example.com/sitemap.xml"
                  className="h-8 text-sm"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={fetchSitemap}
                disabled={isFetchingSitemap || !sitemapUrl.trim()}
              >
                {isFetchingSitemap ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  'Fetch'
                )}
              </Button>
            </div>
            {sitemapError && (
              <p className="text-xs text-destructive">{sitemapError}</p>
            )}
          </CardContent>
        </Card>

        {/* ── Step 2: Terminal command ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Terminal className="h-4 w-4" />
              2. Run in your terminal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {canRun ? (
              <>
                <div className="rounded-lg bg-zinc-950 p-4 dark:bg-zinc-900">
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-zinc-100 sm:text-sm">
                    {terminalBlock}
                  </pre>
                </div>
                <Button onClick={copyToClipboard} className="w-full">
                  {copied ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy to clipboard
                    </>
                  )}
                </Button>
              </>
            ) : (
              <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                {!projectName.trim()
                  ? 'Enter a project name to get started.'
                  : urls.length === 0
                    ? 'Add at least one URL above.'
                    : 'Select at least one device in advanced options.'}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Upload existing captures ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Upload className="h-4 w-4" />
              Upload existing captures
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleManifestDrop}
              className={cn(
                'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-muted-foreground/40'
              )}
            >
              <FileJson className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Drop your <code className="rounded bg-muted px-1 py-0.5 text-xs">manifest.json</code> here
              </p>
              <p className="text-xs text-muted-foreground/60">
                Found in your capture folder after a run
              </p>
            </div>

            {/* Manifest info after drop */}
            {uploadManifest && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{uploadManifest.projectName}</span>
                  <Badge variant={uploadManifest.signed ? 'default' : 'secondary'} className="text-xs">
                    {uploadManifest.signed ? 'Signed' : 'Unsigned'}
                  </Badge>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>{uploadManifest.urlCount} URL{uploadManifest.urlCount !== 1 && 's'}</span>
                  <span className="truncate font-mono">{uploadManifest.runId}</span>
                </div>
              </div>
            )}

            {/* Manual path input */}
            {!uploadManifest && (
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or enter path manually</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}

            <Input
              value={uploadDir}
              onChange={(e) => { setUploadDir(e.target.value); setUploadManifest(null); }}
              placeholder="./captures/my-project-20260407-120000"
              className="font-mono text-sm"
            />

            {uploadCommand && (
              <>
                <div className="rounded-lg bg-zinc-950 p-3 dark:bg-zinc-900">
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-zinc-100">
                    {uploadCommand}
                  </pre>
                </div>
                <Button onClick={copyUploadCommand} variant="outline" className="w-full">
                  {uploadCopied ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy upload command
                    </>
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Advanced options (collapsed) ── */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between px-6 py-4 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                  Advanced options
                </span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    advancedOpen && 'rotate-180'
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-5 border-t pt-5">
                {/* Devices */}
                <div className="space-y-3">
                  <label className="text-sm font-medium">Devices</label>
                  <div className="space-y-2">
                    <label className="flex items-center justify-between rounded-lg border px-3 py-2">
                      <span className="text-sm">Desktop (1280 x 800)</span>
                      <Switch
                        checked={captureDesktop}
                        onCheckedChange={(v) => {
                          if (!v && !captureMobile) return;
                          setCaptureDesktop(v);
                        }}
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-lg border px-3 py-2">
                      <span className="text-sm">Mobile (375 x 812)</span>
                      <Switch
                        checked={captureMobile}
                        onCheckedChange={(v) => {
                          if (!v && !captureDesktop) return;
                          setCaptureMobile(v);
                        }}
                      />
                    </label>
                  </div>
                </div>

                {/* Output dir */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Output directory</label>
                  <Input
                    value={outputDir}
                    onChange={(e) => setOutputDir(e.target.value)}
                    placeholder="./captures"
                  />
                </div>

                {/* Format */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Format</label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={format === 'webp' ? 'default' : 'outline'}
                      onClick={() => setFormat('webp')}
                    >
                      WebP
                    </Button>
                    <Button
                      size="sm"
                      variant={format === 'png' ? 'default' : 'outline'}
                      onClick={() => setFormat('png')}
                    >
                      PNG
                    </Button>
                  </div>
                </div>

                {/* Warmup */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Warmup scroll</label>
                  <p className="text-xs text-muted-foreground">
                    Scrolls the page before capture to trigger lazy-loaded content.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={warmup === 'always' ? 'default' : 'outline'}
                      onClick={() => setWarmup('always')}
                    >
                      On
                    </Button>
                    <Button
                      size="sm"
                      variant={warmup === 'off' ? 'default' : 'outline'}
                      onClick={() => setWarmup('off')}
                    >
                      Off
                    </Button>
                  </div>
                </div>

                {/* Upload & share */}
                <div className="space-y-1.5">
                  <label className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <div>
                      <span className="text-sm font-medium">Upload & get shareable link</span>
                      <p className="text-xs text-muted-foreground">
                        Uploads screenshots after capture and prints a shareable URL.
                      </p>
                    </div>
                    <Switch
                      checked={uploadEnabled}
                      onCheckedChange={setUploadEnabled}
                    />
                  </label>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </main>
    </div>
  );
}
