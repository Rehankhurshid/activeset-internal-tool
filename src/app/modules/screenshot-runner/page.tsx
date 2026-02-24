'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppNavigation } from '@/components/navigation/AppNavigation';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowRight,
  Check,
  ClipboardList,
  Copy,
  Download,
  Loader2,
  MonitorSmartphone,
  PartyPopper,
  Sparkles,
  Terminal,
} from 'lucide-react';

function parseUrlsText(value: string): string[] {
  return value
    .split(/\r?\n/)
    .flatMap((line) => line.split(','))
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function normalizeAndValidateUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const urlCandidate of urls) {
    try {
      const parsed = new URL(urlCandidate);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        continue;
      }
      parsed.hash = '';
      const canonical = parsed.toString();
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      output.push(canonical);
    } catch {
      // Ignore invalid URLs.
    }
  }

  return output;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'capture-run';
}

function quoteForShell(value: string): string {
  return value.replace(/"/g, '\\"');
}

function extractSitemapUrlsFromXml(xmlText: string): string[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
  const parserError = xmlDoc.querySelector('parsererror');

  if (parserError) {
    throw new Error('Invalid sitemap XML.');
  }

  const rootName = xmlDoc.documentElement?.localName?.toLowerCase();
  if (rootName === 'sitemapindex') {
    throw new Error('Sitemap index (multilingual) is not supported yet.');
  }

  const locNodes = Array.from(xmlDoc.getElementsByTagName('loc'));
  const rawUrls = locNodes
    .map((node) => (node.textContent || '').trim())
    .filter((value) => value.length > 0);

  return normalizeAndValidateUrls(rawUrls);
}

function buildPreviewLines(input: {
  projectName: string;
  outputDir: string;
  projectSlug: string;
  selectedCommand: string;
  urlCount: number;
  os: SelectedOs;
}): string[] {
  const runTs = '20260219-194500';
  const sampleDuration = `${Math.max(2, input.urlCount)}.${input.os === 'windows' ? '9' : '3'}s`;

  return [
    '$ activeset-capture-local ...',
    `> project: ${input.projectName}`,
    `> urls: ${input.urlCount || 0}`,
    `> output: ${input.outputDir}/${input.projectSlug}-${runTs}`,
    `> command: ${input.selectedCommand}`,
    '[1/3] Launching browser...',
    '[2/3] Warmup scrolling animated content...',
    '[3/3] Capturing desktop + mobile full page...',
    `SUCCESS in ${sampleDuration}`,
    `Manifest: ${input.outputDir}/${input.projectSlug}-${runTs}/manifest.json`,
  ];
}

type SelectedOs = 'mac' | 'windows';

export default function ScreenshotRunnerPage() {
  const { user, loading, signInWithGoogle } = useAuth();

  const [projectName, setProjectName] = useState('New Client Project');
  const [urlsInput, setUrlsInput] = useState('https://example.com\nhttps://example.com/pricing');
  const [outputDir, setOutputDir] = useState('./captures');
  const [selectedOs, setSelectedOs] = useState<SelectedOs>('mac');
  const [inputFilePath, setInputFilePath] = useState('');
  const [sitemapUrl, setSitemapUrl] = useState('https://www.activeset.co/sitemap.xml');
  const [isImportingSitemap, setIsImportingSitemap] = useState(false);
  const [sitemapMessage, setSitemapMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const normalizedUrls = useMemo(() => normalizeAndValidateUrls(parseUrlsText(urlsInput)), [urlsInput]);

  const projectSlug = useMemo(() => slugify(projectName), [projectName]);
  const urlFileName = `${projectSlug}-urls.txt`;
  const urlsFileText = normalizedUrls.join('\n');
  const effectiveMacFilePath = inputFilePath.trim() || `./${urlFileName}`;
  const effectiveWindowsFilePath = inputFilePath.trim() || `.\\${urlFileName}`;

  const hostedInstallCommand = 'npx @activeset/capture';
  const runWizardCommand = 'activeset-capture';
  const localInstallMacCommand = 'bash ./install-local-capture.sh';
  const localInstallWindowsCommand = 'powershell -ExecutionPolicy Bypass -File .\\install-local-capture.ps1';

  const macCommand = useMemo(() => {
    return `activeset-capture-local --project "${quoteForShell(projectName)}" --file "${quoteForShell(effectiveMacFilePath)}" --out "${quoteForShell(outputDir)}" --devices desktop,mobile --warmup always`;
  }, [projectName, outputDir, effectiveMacFilePath]);

  const windowsCommand = useMemo(() => {
    return `activeset-capture-local --project "${quoteForShell(projectName)}" --file "${quoteForShell(effectiveWindowsFilePath)}" --out "${quoteForShell(outputDir)}" --devices desktop,mobile --warmup always`;
  }, [projectName, outputDir, effectiveWindowsFilePath]);

  const selectedCommand = selectedOs === 'mac' ? macCommand : windowsCommand;
  const previewLines = useMemo(
    () =>
      buildPreviewLines({
        projectName,
        outputDir,
        projectSlug,
        selectedCommand,
        urlCount: normalizedUrls.length,
        os: selectedOs,
      }),
    [normalizedUrls.length, outputDir, projectName, projectSlug, selectedCommand, selectedOs]
  );
  const [visiblePreviewLineCount, setVisiblePreviewLineCount] = useState(1);

  useEffect(() => {
    setVisiblePreviewLineCount(1);
    const timer = setInterval(() => {
      setVisiblePreviewLineCount((current) => {
        if (current >= previewLines.length) {
          return previewLines.length;
        }
        return current + 1;
      });
    }, 320);

    return () => clearInterval(timer);
  }, [previewLines]);

  const copyText = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000);
    } catch {
      // no-op
    }
  };

  const mergeParsedUrlsIntoInput = (incomingUrls: string[]) => {
    const existingUrls = parseUrlsText(urlsInput);
    const merged = normalizeAndValidateUrls([...existingUrls, ...incomingUrls]);
    setUrlsInput(merged.join('\n'));
    return merged.length;
  };

  const importFromSitemapUrl = async () => {
    setSitemapMessage(null);
    const candidate = sitemapUrl.trim();

    if (!candidate) {
      setSitemapMessage('Please enter a sitemap URL first.');
      return;
    }

    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setSitemapMessage('Sitemap URL must start with http:// or https://');
        return;
      }
    } catch {
      setSitemapMessage('Please enter a valid sitemap URL.');
      return;
    }

    setIsImportingSitemap(true);
    try {
      const response = await fetch(`/api/sitemap-links?url=${encodeURIComponent(candidate)}`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || `Failed to fetch sitemap (${response.status}).`);
      }

      const payload = (await response.json()) as { urls?: string[]; count?: number; error?: string };
      const parsedUrls = Array.isArray(payload.urls) ? normalizeAndValidateUrls(payload.urls) : [];

      if (parsedUrls.length === 0) {
        throw new Error('No <loc> links found in sitemap.');
      }

      const total = mergeParsedUrlsIntoInput(parsedUrls);
      setSitemapMessage(`Imported ${parsedUrls.length} links. Total in list: ${total}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import sitemap.';
      setSitemapMessage(
        `${message} If browser fetch is blocked (CORS), paste sitemap XML below and click "Parse pasted sitemap XML".`
      );
    } finally {
      setIsImportingSitemap(false);
    }
  };

  const parsePastedSitemapXml = () => {
    setSitemapMessage(null);
    try {
      const parsedUrls = extractSitemapUrlsFromXml(urlsInput);
      if (parsedUrls.length === 0) {
        setSitemapMessage('No <loc> links found in pasted XML.');
        return;
      }

      setUrlsInput(parsedUrls.join('\n'));
      setSitemapMessage(`Parsed ${parsedUrls.length} links from pasted sitemap XML.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not parse pasted sitemap XML.';
      setSitemapMessage(message);
    }
  };

  const downloadUrlsFile = () => {
    const blob = new Blob([`${urlsFileText}\n`], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = urlFileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  };

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
        <p className="text-sm text-muted-foreground">Sign in to access the local screenshot runner helper.</p>
        <Button onClick={signInWithGoogle}>Sign in with Google</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNavigation title="Screenshot Runner" showBackButton backHref="/" />

      <main className="container mx-auto space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <Card className="relative overflow-hidden border-cyan-200/60 bg-gradient-to-br from-cyan-50 via-white to-blue-50">
          <div className="blob blob-a" />
          <div className="blob blob-b" />
          <CardContent className="relative py-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="gap-1 bg-cyan-600 text-white hover:bg-cyan-600">
                <Sparkles className="h-3 w-3" />
                Local-Only
              </Badge>
              <Badge variant="outline" className="bg-white/70">No server compute</Badge>
              <Badge variant="outline" className="bg-white/70">Desktop + Mobile</Badge>
            </div>

            <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Capture screenshots in 3 easy steps
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
              Paste URLs, download URL file, run one command. Animated pages are warmed up with full scroll before capture.
            </p>

            <div className="mt-5 rounded-xl border bg-black/90 p-3 font-mono text-sm text-green-400 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="break-all">{hostedInstallCommand}</span>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                  onClick={() => copyText(hostedInstallCommand, 'hero-install')}
                >
                  {copiedKey === 'hero-install' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="step-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="step-dot">1</span>
                Install / Open Wizard
              </CardTitle>
              <CardDescription>Most users only need the hosted command.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border bg-muted/40 p-3 font-mono text-xs">{hostedInstallCommand}</div>
              <Button className="w-full" onClick={() => copyText(hostedInstallCommand, 'install-hosted')}>
                {copiedKey === 'install-hosted' ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                Copy Hosted Install
              </Button>
              <div className="rounded-md border bg-muted/40 p-3 font-mono text-xs">{runWizardCommand}</div>
              <Button variant="outline" className="w-full" onClick={() => copyText(runWizardCommand, 'run-wizard')}>
                {copiedKey === 'run-wizard' ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                Copy Run Command
              </Button>
            </CardContent>
          </Card>

          <Card className="step-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="step-dot">2</span>
                Add Project + URLs
              </CardTitle>
              <CardDescription>Paste your own URL file path, or generate one from sitemap/import and download it.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Project name" />
              <div className="space-y-1">
                <Input
                  value={inputFilePath}
                  onChange={(event) => setInputFilePath(event.target.value)}
                  placeholder="Optional: paste your URL file path (e.g. /Users/me/urls.txt or C:\\urls.txt)"
                />
                <p className="text-xs text-muted-foreground">
                  Command will use: <code>{selectedOs === 'mac' ? effectiveMacFilePath : effectiveWindowsFilePath}</code>
                </p>
              </div>
              <div className="rounded-lg border border-cyan-200 bg-cyan-50/60 p-3">
                <p className="mb-2 text-xs font-semibold text-cyan-900">Quick import from sitemap.xml</p>
                <div className="flex flex-col gap-2">
                  <Input
                    value={sitemapUrl}
                    onChange={(event) => setSitemapUrl(event.target.value)}
                    placeholder="https://example.com/sitemap.xml"
                  />
                  <Button onClick={importFromSitemapUrl} disabled={isImportingSitemap}>
                    {isImportingSitemap ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Import Sitemap URL
                  </Button>
                </div>
              </div>
              <Textarea
                value={urlsInput}
                onChange={(event) => setUrlsInput(event.target.value)}
                className="min-h-28"
                placeholder="https://example.com\nhttps://example.com/pricing"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={parsePastedSitemapXml}>
                  Parse pasted sitemap XML
                </Button>
                {sitemapMessage ? <p className="text-xs text-muted-foreground">{sitemapMessage}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className={normalizedUrls.length > 0 ? 'animate-pulse' : ''}>
                  Valid URLs: {normalizedUrls.length}
                </Badge>
                <Badge variant="outline">{urlFileName}</Badge>
                <Badge variant="outline">
                  {inputFilePath.trim() ? 'Using pasted file path' : 'Using downloaded file name'}
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={downloadUrlsFile} disabled={normalizedUrls.length === 0}>
                  <Download className="mr-2 h-4 w-4" />
                  Download URL File
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => copyText(urlsFileText, 'copy-urls')} disabled={normalizedUrls.length === 0}>
                  {copiedKey === 'copy-urls' ? <Check className="mr-2 h-4 w-4" /> : <ClipboardList className="mr-2 h-4 w-4" />}
                  Copy URLs
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="step-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="step-dot">3</span>
                Run Capture Command
              </CardTitle>
              <CardDescription>Choose your OS and run one command.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={selectedOs === 'mac' ? 'default' : 'outline'}
                  className="w-full"
                  onClick={() => setSelectedOs('mac')}
                >
                  macOS / Linux
                </Button>
                <Button
                  variant={selectedOs === 'windows' ? 'default' : 'outline'}
                  className="w-full"
                  onClick={() => setSelectedOs('windows')}
                >
                  Windows
                </Button>
              </div>

              <div className="rounded-md border bg-muted/40 p-3 font-mono text-xs break-all">{selectedCommand}</div>
              <Button className="w-full" onClick={() => copyText(selectedCommand, 'selected-command')} disabled={normalizedUrls.length === 0}>
                {copiedKey === 'selected-command' ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                Copy Capture Command
              </Button>
              <div className="rounded-md border bg-muted/40 p-3 font-mono text-xs">{selectedOs === 'mac' ? localInstallMacCommand : localInstallWindowsCommand}</div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-green-300/60 bg-gradient-to-r from-green-50 to-emerald-50">
          <CardContent className="py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-green-900">
                  <PartyPopper className="h-4 w-4" />
                  Ready to run
                </p>
                <p className="text-sm text-green-800">
                  Output: <code>{`${outputDir}/${projectSlug}-{timestamp}`}</code> with <code>manifest.json</code>, device screenshots, and optional <code>errors.json</code>.
                </p>
              </div>
              <Button
                size="lg"
                className="group"
                onClick={() => copyText(`${hostedInstallCommand}\n${runWizardCommand}`, 'all-in-one')}
              >
                {copiedKey === 'all-in-one' ? <Check className="mr-2 h-4 w-4" /> : <MonitorSmartphone className="mr-2 h-4 w-4" />}
                Copy Start Commands
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-zinc-800 bg-zinc-950 text-zinc-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
              <Terminal className="h-4 w-4 text-cyan-300" />
              Live Terminal Preview
            </CardTitle>
            <CardDescription className="text-zinc-400">
              This updates as you change project, URLs, OS, and command settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 font-mono text-xs sm:text-sm">
            {previewLines.slice(0, visiblePreviewLineCount).map((line, index) => (
              <div
                key={`${line}-${index}`}
                className="animate-[fade-in_240ms_ease] break-all text-zinc-300"
              >
                {line.startsWith('SUCCESS') ? (
                  <span className="text-emerald-300">{line}</span>
                ) : line.startsWith('[2/3]') ? (
                  <span className="text-amber-300">{line}</span>
                ) : line.startsWith('Manifest:') ? (
                  <span className="text-cyan-300">{line}</span>
                ) : (
                  line
                )}
              </div>
            ))}
            {visiblePreviewLineCount < previewLines.length ? (
              <div className="inline-flex h-4 w-2 animate-pulse rounded-sm bg-zinc-500" />
            ) : null}
          </CardContent>
        </Card>
      </main>

      <style jsx>{`
        .step-card {
          transition: transform 180ms ease, box-shadow 180ms ease;
          animation: card-in 420ms ease both;
        }

        .step-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 10px 24px rgba(2, 132, 199, 0.12);
        }

        .step-dot {
          display: inline-flex;
          height: 1.35rem;
          width: 1.35rem;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          background: linear-gradient(135deg, #06b6d4, #2563eb);
          color: white;
          font-size: 0.75rem;
          font-weight: 700;
          box-shadow: 0 2px 6px rgba(37, 99, 235, 0.35);
        }

        .blob {
          position: absolute;
          border-radius: 9999px;
          filter: blur(24px);
          opacity: 0.35;
        }

        .blob-a {
          right: -36px;
          top: -36px;
          height: 140px;
          width: 140px;
          background: #22d3ee;
          animation: float-a 6s ease-in-out infinite;
        }

        .blob-b {
          left: -28px;
          bottom: -30px;
          height: 120px;
          width: 120px;
          background: #60a5fa;
          animation: float-b 7s ease-in-out infinite;
        }

        @keyframes card-in {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes float-a {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(10px);
          }
        }

        @keyframes float-b {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }
      `}</style>
    </div>
  );
}
