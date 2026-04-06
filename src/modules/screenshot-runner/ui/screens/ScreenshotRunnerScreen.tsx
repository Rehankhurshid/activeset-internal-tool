'use client';

import { type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  FileText,
  FolderOpen,
  Globe,
  Link2,
  Loader2,
  MonitorSmartphone,
  PlayCircle,
  Settings2,
  Sparkles,
  Terminal,
  Upload,
  Wand2,
} from 'lucide-react';
import { useAuth } from '@/modules/auth-access';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Switch } from '@/components/ui/switch';
import { AppNavigation } from '@/shared/ui';
import { cn } from '@/lib/utils';

type SelectedOs = 'mac' | 'windows';
type SourceMode = 'paste' | 'sitemap' | 'path';
type CaptureFormat = 'webp' | 'png';
type WarmupMode = 'always' | 'off';
type FeedbackTone = 'info' | 'success' | 'error';

type Feedback = {
  tone: FeedbackTone;
  text: string;
};

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

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'capture-run';
}

function quoteForBash(value: string): string {
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

function quoteForPowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildRunCommand(input: {
  baseCommand: string;
  os: SelectedOs;
  projectName: string;
  filePath: string;
  outputDir: string;
  devices: string[];
  format: CaptureFormat;
  warmup: WarmupMode;
}): string {
  const quote = input.os === 'windows' ? quoteForPowerShell : quoteForBash;

  return [
    input.baseCommand,
    `--project ${quote(input.projectName)}`,
    `--file ${quote(input.filePath)}`,
    `--out ${quote(input.outputDir)}`,
    `--devices ${input.devices.join(',')}`,
    `--format ${input.format}`,
    `--warmup ${input.warmup}`,
  ].join(' ');
}

function buildTerminalScript(input: {
  os: SelectedOs;
  runCommand: string;
  filePath: string;
  urlsFileText: string;
  sourceMode: SourceMode;
  hasExistingFilePath: boolean;
}): string {
  if (input.sourceMode === 'path' && input.hasExistingFilePath) {
    return input.runCommand;
  }

  if (!input.urlsFileText.trim()) {
    return input.runCommand;
  }

  if (input.os === 'windows') {
    return [
      "@'",
      input.urlsFileText,
      `'@ | Set-Content -Encoding utf8 -Path ${quoteForPowerShell(input.filePath)}`,
      '',
      input.runCommand,
    ].join('\n');
  }

  return [
    `cat <<'EOF' > ${quoteForBash(input.filePath)}`,
    input.urlsFileText,
    'EOF',
    '',
    input.runCommand,
  ].join('\n');
}

function buildPreviewLines(input: {
  projectName: string;
  outputDir: string;
  projectSlug: string;
  command: string;
  sourceLabel: string;
  urlCount: number;
  devices: string[];
  warmup: WarmupMode;
}): string[] {
  const runTs = '20260407-201500';
  const deviceLabel = input.devices.join(' + ');
  const durationBase = Math.max(3.2, input.urlCount * 1.4);

  return [
    `$ ${input.command.split('\n').at(-1) || input.command}`,
    `> project: ${input.projectName}`,
    `> source: ${input.sourceLabel}`,
    `> urls: ${input.urlCount || 0}`,
    `> devices: ${deviceLabel || 'none'}`,
    `> output: ${input.outputDir}/${input.projectSlug}-${runTs}`,
    '[1/4] Launching browser workers...',
    input.warmup === 'always' ? '[2/4] Warmup scrolling animated sections...' : '[2/4] Warmup skipped...',
    `[3/4] Capturing ${deviceLabel || 'selected'} full-page screenshots...`,
    '[4/4] Writing manifest + device folders...',
    `SUCCESS in ${durationBase.toFixed(1)}s`,
    `Manifest: ${input.outputDir}/${input.projectSlug}-${runTs}/manifest.json`,
  ];
}

function AssistantBubble({
  icon: Icon,
  title,
  children,
  tone = 'default',
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  tone?: 'default' | 'success';
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4 shadow-sm',
        tone === 'success'
          ? 'border-emerald-200 bg-emerald-50/80'
          : 'border-slate-200 bg-white/90'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            tone === 'success' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <div className="text-sm leading-6 text-slate-600">{children}</div>
        </div>
      </div>
    </div>
  );
}

function ProgressPill({ done, label }: { done: boolean; label: string }) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        done ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white/80 text-slate-500'
      )}
    >
      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-2 w-2 rounded-full bg-slate-300" />}
      {label}
    </div>
  );
}

function SourceOptionCard({
  active,
  icon: Icon,
  title,
  description,
  onClick,
  badge,
}: {
  active: boolean;
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group rounded-2xl border p-4 text-left transition-all duration-200 ease-out',
        active
          ? 'border-cyan-400 bg-cyan-50 shadow-[0_12px_30px_-18px_rgba(8,145,178,0.8)]'
          : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_28px_-22px_rgba(15,23,42,0.45)]'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
          <Icon className="h-4 w-4" />
        </div>
        {badge ? <Badge className="bg-white text-slate-700 shadow-none">{badge}</Badge> : null}
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
    </button>
  );
}

function FeedbackBanner({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null;

  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3 text-sm',
        feedback.tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
        feedback.tone === 'error' && 'border-rose-200 bg-rose-50 text-rose-700',
        feedback.tone === 'info' && 'border-slate-200 bg-slate-50 text-slate-700'
      )}
    >
      {feedback.text}
    </div>
  );
}

export default function ScreenshotRunnerPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [projectName, setProjectName] = useState('New Client Project');
  const [sourceMode, setSourceMode] = useState<SourceMode>('paste');
  const [urlsInput, setUrlsInput] = useState('');
  const [inputFilePath, setInputFilePath] = useState('');
  const [outputDir, setOutputDir] = useState('./captures');
  const [selectedOs, setSelectedOs] = useState<SelectedOs>('mac');
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [isImportingSitemap, setIsImportingSitemap] = useState(false);
  const [captureDesktop, setCaptureDesktop] = useState(true);
  const [captureMobile, setCaptureMobile] = useState(true);
  const [captureFormat, setCaptureFormat] = useState<CaptureFormat>('webp');
  const [warmupMode, setWarmupMode] = useState<WarmupMode>('always');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [visiblePreviewLineCount, setVisiblePreviewLineCount] = useState(1);

  const normalizedUrls = useMemo(() => normalizeAndValidateUrls(parseUrlsText(urlsInput)), [urlsInput]);
  const selectedDevices = useMemo(
    () => [captureDesktop ? 'desktop' : null, captureMobile ? 'mobile' : null].filter(Boolean) as string[],
    [captureDesktop, captureMobile]
  );
  const projectSlug = useMemo(() => slugify(projectName), [projectName]);
  const urlFileName = `${projectSlug}-urls.txt`;
  const suggestedFilePath = selectedOs === 'mac' ? `./${urlFileName}` : `.\\${urlFileName}`;
  const hasExistingFilePath = sourceMode === 'path' && inputFilePath.trim().length > 0;
  const commandFilePath = hasExistingFilePath ? inputFilePath.trim() : suggestedFilePath;
  const urlsFileText = normalizedUrls.join('\n');
  const canGenerateFromUrls = sourceMode !== 'path' && normalizedUrls.length > 0;
  const canRun = selectedDevices.length > 0 && (hasExistingFilePath || canGenerateFromUrls);

  const runCommand = useMemo(
    () =>
      buildRunCommand({
        baseCommand: 'npx @activeset/capture run',
        os: selectedOs,
        projectName,
        filePath: commandFilePath,
        outputDir,
        devices: selectedDevices,
        format: captureFormat,
        warmup: warmupMode,
      }),
    [captureFormat, commandFilePath, outputDir, projectName, selectedDevices, selectedOs, warmupMode]
  );

  const globalRunCommand = useMemo(
    () =>
      buildRunCommand({
        baseCommand: 'activeset-capture run',
        os: selectedOs,
        projectName,
        filePath: commandFilePath,
        outputDir,
        devices: selectedDevices,
        format: captureFormat,
        warmup: warmupMode,
      }),
    [captureFormat, commandFilePath, outputDir, projectName, selectedDevices, selectedOs, warmupMode]
  );

  const terminalScript = useMemo(
    () =>
      buildTerminalScript({
        os: selectedOs,
        runCommand,
        filePath: commandFilePath,
        urlsFileText,
        sourceMode,
        hasExistingFilePath,
      }),
    [commandFilePath, hasExistingFilePath, runCommand, selectedOs, sourceMode, urlsFileText]
  );

  const previewLines = useMemo(
    () =>
      buildPreviewLines({
        projectName,
        outputDir,
        projectSlug,
        command: terminalScript,
        sourceLabel:
          sourceMode === 'sitemap' ? 'sitemap import' : sourceMode === 'path' ? 'existing local file' : 'pasted URLs',
        urlCount: hasExistingFilePath ? Math.max(normalizedUrls.length, 2) : normalizedUrls.length,
        devices: selectedDevices,
        warmup: warmupMode,
      }),
    [hasExistingFilePath, normalizedUrls.length, outputDir, projectName, projectSlug, selectedDevices, sourceMode, terminalScript, warmupMode]
  );

  useEffect(() => {
    setVisiblePreviewLineCount(1);
    const timer = setInterval(() => {
      setVisiblePreviewLineCount((current) => {
        if (current >= previewLines.length) {
          return previewLines.length;
        }
        return current + 1;
      });
    }, 220);

    return () => clearInterval(timer);
  }, [previewLines]);

  const setMessage = (tone: FeedbackTone, text: string) => setFeedback({ tone, text });

  const handleDesktopToggle = (checked: boolean) => {
    if (!checked && !captureMobile) {
      setMessage('error', 'Keep at least one device profile enabled.');
      return;
    }
    setCaptureDesktop(checked);
  };

  const handleMobileToggle = (checked: boolean) => {
    if (!checked && !captureDesktop) {
      setMessage('error', 'Keep at least one device profile enabled.');
      return;
    }
    setCaptureMobile(checked);
  };

  const copyText = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((current) => (current === key ? null : current));
      }, 1800);
      setMessage('success', 'Copied to clipboard.');
    } catch {
      setMessage('error', 'Clipboard copy failed. Copy manually from the block.');
    }
  };

  const mergeParsedUrlsIntoInput = (incomingUrls: string[]) => {
    const merged = normalizeAndValidateUrls([...parseUrlsText(urlsInput), ...incomingUrls]);
    setUrlsInput(merged.join('\n'));
    return merged.length;
  };

  const importFromSitemapUrl = async () => {
    setFeedback(null);
    const candidate = sitemapUrl.trim();

    if (!candidate) {
      setMessage('error', 'Enter a sitemap URL first.');
      return;
    }

    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setMessage('error', 'Sitemap URL must start with http:// or https://');
        return;
      }
    } catch {
      setMessage('error', 'Enter a valid sitemap URL.');
      return;
    }

    setIsImportingSitemap(true);
    try {
      const response = await fetch(`/api/sitemap-links?url=${encodeURIComponent(candidate)}`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || `Failed to fetch sitemap (${response.status}).`);
      }

      const payload = (await response.json()) as { urls?: string[] };
      const parsedUrls = Array.isArray(payload.urls) ? normalizeAndValidateUrls(payload.urls) : [];

      if (parsedUrls.length === 0) {
        throw new Error('No <loc> links found in sitemap.');
      }

      const total = mergeParsedUrlsIntoInput(parsedUrls);
      setMessage('success', `Imported ${parsedUrls.length} links. Total ready for capture: ${total}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import sitemap.';
      setMessage('error', `${message} If the site blocks fetches, paste sitemap XML below and parse it locally.`);
    } finally {
      setIsImportingSitemap(false);
    }
  };

  const parsePastedSitemapXml = () => {
    try {
      const parsedUrls = extractSitemapUrlsFromXml(urlsInput);
      if (parsedUrls.length === 0) {
        setMessage('error', 'No <loc> links found in pasted sitemap XML.');
        return;
      }

      setUrlsInput(parsedUrls.join('\n'));
      setMessage('success', `Parsed ${parsedUrls.length} links from pasted sitemap XML.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not parse pasted sitemap XML.';
      setMessage('error', message);
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText.trim()) {
        setMessage('error', 'Clipboard is empty.');
        return;
      }

      const addedCount = mergeParsedUrlsIntoInput(parseUrlsText(clipboardText));
      setSourceMode('paste');
      setMessage('success', `Imported clipboard content. Total ready for capture: ${addedCount}.`);
    } catch {
      setMessage('error', 'Clipboard read failed. Paste the URLs manually instead.');
    }
  };

  const handleImportedFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    try {
      const fileText = await file.text();
      const parsedUrls = normalizeAndValidateUrls(parseUrlsText(fileText));

      if (parsedUrls.length === 0) {
        throw new Error('No valid URLs found in that file.');
      }

      setSourceMode('paste');
      setUrlsInput(parsedUrls.join('\n'));
      setMessage('success', `Imported ${parsedUrls.length} URLs from ${file.name}.`);
    } catch (error) {
      setMessage('error', error instanceof Error ? error.message : 'Could not read that file.');
    }
  };

  const downloadUrlsFile = () => {
    if (!urlsFileText.trim()) return;
    const blob = new Blob([`${urlsFileText}\n`], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = urlFileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    setMessage('success', `Downloaded ${urlFileName}.`);
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
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fcff_0%,#ffffff_38%,#f8fafc_100%)]">
      <AppNavigation title="Screenshot Runner" showBackButton backHref="/" />

      <main className="container mx-auto space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <Card className="relative overflow-hidden border-cyan-200/70 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.14),transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] shadow-[0_20px_70px_-45px_rgba(14,116,144,0.7)]">
          <div className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,transparent,rgba(15,23,42,0.03))]" />
          <CardContent className="relative space-y-6 py-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="gap-1 bg-cyan-600 text-white hover:bg-cyan-600">
                <Sparkles className="h-3 w-3" />
                Easier Flow
              </Badge>
              <Badge variant="outline" className="bg-white/80">One terminal block</Badge>
              <Badge variant="outline" className="bg-white/80">No manual CLI setup</Badge>
              <Badge variant="outline" className="bg-white/80">Desktop + Mobile</Badge>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
              <div className="space-y-3">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                  Screenshot capture that behaves more like an assistant than a docs page
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
                  Start with a sitemap, pasted URLs, or an existing file path. The screen prepares the exact terminal block
                  for you, so the usual “download this file, then run that command” dance becomes one copy-paste step.
                </p>
              </div>

              <div className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Flow Status</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ProgressPill label="Source ready" done={hasExistingFilePath || canGenerateFromUrls} />
                  <ProgressPill label="Capture settings" done={selectedDevices.length > 0} />
                  <ProgressPill label="Run block ready" done={canRun} />
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  Primary path: paste data on the left, copy the terminal block on the right, run it locally.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <Card className="border-slate-200/80 bg-white/90 shadow-[0_24px_60px_-45px_rgba(15,23,42,0.35)]">
              <CardHeader className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="bg-slate-50">Assistant flow</Badge>
                  <Badge variant="outline" className="bg-slate-50">Local only</Badge>
                </div>
                <div>
                  <CardTitle className="text-xl text-slate-950">Tell the runner what you already have</CardTitle>
                  <CardDescription className="mt-2 text-sm leading-6 text-slate-600">
                    The screen adapts the command and the file-handling step based on your input source.
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="space-y-5">
                <AssistantBubble icon={Wand2} title="Choose your starting point">
                  Pick the closest match. The recommended flow is <span className="font-medium text-slate-900">Paste URLs</span>,
                  because it lets the app build the URL file for you automatically.
                </AssistantBubble>

                <div className="grid gap-3 md:grid-cols-3">
                  <SourceOptionCard
                    active={sourceMode === 'paste'}
                    icon={Link2}
                    title="Paste URLs"
                    description="Drop raw URLs here, pull from clipboard, or import a .txt file and I’ll generate the terminal block."
                    badge="Recommended"
                    onClick={() => setSourceMode('paste')}
                  />
                  <SourceOptionCard
                    active={sourceMode === 'sitemap'}
                    icon={Globe}
                    title="Use sitemap.xml"
                    description="Fetch a sitemap URL, or paste sitemap XML if the site blocks browser requests."
                    onClick={() => setSourceMode('sitemap')}
                  />
                  <SourceOptionCard
                    active={sourceMode === 'path'}
                    icon={FolderOpen}
                    title="I already have a file"
                    description="Keep it minimal. Paste the local file path and the screen will output just the run command."
                    onClick={() => setSourceMode('path')}
                  />
                </div>

                {sourceMode === 'path' ? (
                  <AssistantBubble icon={FileText} title="Use your existing file path">
                    Paste the absolute or relative path to your URL file. The generated command stays short because it skips
                    file creation entirely.
                  </AssistantBubble>
                ) : sourceMode === 'sitemap' ? (
                  <AssistantBubble icon={Globe} title="Import from sitemap, then review the list">
                    Start with a live sitemap URL if it is publicly reachable. If not, paste the XML below and parse it locally.
                  </AssistantBubble>
                ) : (
                  <AssistantBubble icon={ClipboardList} title="Paste once, run once" tone="success">
                    Add URLs manually, import them from clipboard, or load a text file. The run block on the right will include
                    both the temporary file creation step and the final capture command.
                  </AssistantBubble>
                )}

                <div className="grid gap-4 lg:grid-cols-[1fr_0.95fr]">
                  <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-900">Project name</label>
                      <Input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="New Client Project" />
                    </div>

                    {sourceMode === 'path' ? (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-900">Existing URL file path</label>
                        <Input
                          value={inputFilePath}
                          onChange={(event) => setInputFilePath(event.target.value)}
                          placeholder={selectedOs === 'mac' ? '/Users/me/client-urls.txt' : 'C:\\Users\\me\\client-urls.txt'}
                        />
                        <p className="text-xs leading-5 text-slate-500">
                          Example: <code>{suggestedFilePath}</code>
                        </p>
                      </div>
                    ) : (
                      <>
                        {sourceMode === 'sitemap' ? (
                          <div className="space-y-3 rounded-2xl border border-cyan-200 bg-white p-3">
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-slate-900">Sitemap URL</label>
                              <Input
                                value={sitemapUrl}
                                onChange={(event) => setSitemapUrl(event.target.value)}
                                placeholder="https://example.com/sitemap.xml"
                              />
                            </div>
                            <Button onClick={importFromSitemapUrl} disabled={isImportingSitemap}>
                              {isImportingSitemap ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />}
                              Import sitemap
                            </Button>
                          </div>
                        ) : null}

                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="text-sm font-medium text-slate-900">
                              {sourceMode === 'sitemap' ? 'URL list or pasted sitemap XML' : 'URL list'}
                            </label>
                            <div className="flex flex-wrap gap-2">
                              <Button variant="outline" size="sm" onClick={pasteFromClipboard}>
                                <ClipboardList className="mr-2 h-4 w-4" />
                                Paste clipboard
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                                <Upload className="mr-2 h-4 w-4" />
                                Import file
                              </Button>
                              <input
                                ref={fileInputRef}
                                type="file"
                                accept=".txt,.csv,.md,text/plain"
                                className="hidden"
                                onChange={handleImportedFile}
                              />
                            </div>
                          </div>
                          <Textarea
                            value={urlsInput}
                            onChange={(event) => setUrlsInput(event.target.value)}
                            className="min-h-40 bg-white"
                            placeholder={
                              sourceMode === 'sitemap'
                                ? '<urlset>...</urlset> or the resolved list of URLs'
                                : 'https://example.com\nhttps://example.com/pricing'
                            }
                          />
                          {sourceMode === 'sitemap' ? (
                            <Button variant="outline" onClick={parsePastedSitemapXml}>
                              Parse pasted sitemap XML
                            </Button>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Ready summary</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        The app keeps the heavy lifting local. This panel just makes the local command easier to run.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-500">URLs</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-950">
                          {hasExistingFilePath ? 'Existing file' : normalizedUrls.length}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Generated file</p>
                        <p className="mt-2 break-all text-sm font-medium text-slate-900">{commandFilePath}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{selectedDevices.length || 0} device profile(s)</Badge>
                      <Badge variant="outline">{captureFormat.toUpperCase()}</Badge>
                      <Badge variant="outline">{warmupMode === 'always' ? 'Warmup on' : 'Warmup off'}</Badge>
                    </div>
                    {!hasExistingFilePath && canGenerateFromUrls ? (
                      <Button variant="outline" onClick={downloadUrlsFile}>
                        <Download className="mr-2 h-4 w-4" />
                        Download URL file
                      </Button>
                    ) : null}
                  </div>
                </div>

                <Accordion type="single" collapsible className="rounded-3xl border border-slate-200 bg-white px-4">
                  <AccordionItem value="advanced">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Settings2 className="h-4 w-4 text-slate-500" />
                        Advanced capture settings
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-5">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-sm font-medium text-slate-900">Devices</p>
                          <label className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                            <span className="text-sm text-slate-700">Desktop 1280×800</span>
                            <Switch checked={captureDesktop} onCheckedChange={handleDesktopToggle} />
                          </label>
                          <label className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                            <span className="text-sm text-slate-700">Mobile 375×812</span>
                            <Switch checked={captureMobile} onCheckedChange={handleMobileToggle} />
                          </label>
                        </div>

                        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-sm font-medium text-slate-900">Output folder</p>
                          <Input value={outputDir} onChange={(event) => setOutputDir(event.target.value)} placeholder="./captures" />
                          <p className="text-xs leading-5 text-slate-500">
                            The run creates a timestamped folder inside this directory.
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-sm font-medium text-slate-900">Format</p>
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              variant={captureFormat === 'webp' ? 'default' : 'outline'}
                              onClick={() => setCaptureFormat('webp')}
                            >
                              WEBP
                            </Button>
                            <Button
                              type="button"
                              variant={captureFormat === 'png' ? 'default' : 'outline'}
                              onClick={() => setCaptureFormat('png')}
                            >
                              PNG
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-sm font-medium text-slate-900">Warmup scroll</p>
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              variant={warmupMode === 'always' ? 'default' : 'outline'}
                              onClick={() => setWarmupMode('always')}
                            >
                              Always
                            </Button>
                            <Button
                              type="button"
                              variant={warmupMode === 'off' ? 'default' : 'outline'}
                              onClick={() => setWarmupMode('off')}
                            >
                              Off
                            </Button>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                <FeedbackBanner feedback={feedback} />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <Card className="overflow-hidden border-slate-200 bg-white shadow-[0_24px_60px_-45px_rgba(15,23,42,0.38)]">
              <CardHeader className="border-b border-slate-100 bg-slate-50/80">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <Terminal className="h-4 w-4" />
                  Copy once, run once
                </div>
                <div className="space-y-2">
                  <CardTitle className="text-xl text-slate-950">Ready terminal block</CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-600">
                    This is the primary path. It uses the public package directly, so there is no separate install step unless
                    you prefer a global install.
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 p-5">
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

                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {sourceMode === 'path' ? 'Existing file path' : 'Inline file creation'}
                  </Badge>
                  <Badge variant="outline">{selectedDevices.join(', ') || 'select a device'}</Badge>
                  <Badge variant="outline">{captureFormat.toUpperCase()}</Badge>
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-100 shadow-inner sm:text-sm">
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono leading-6">
                    {terminalScript}
                  </pre>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button onClick={() => copyText(terminalScript, 'terminal-script')} disabled={!canRun}>
                    {copiedKey === 'terminal-script' ? <Check className="mr-2 h-4 w-4" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                    Copy terminal block
                  </Button>
                  <Button variant="outline" onClick={() => copyText(runCommand, 'raw-command')} disabled={!canRun}>
                    {copiedKey === 'raw-command' ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                    Copy raw command
                  </Button>
                </div>

                <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
                  <p className="text-sm font-medium text-cyan-950">Why this is easier</p>
                  <p className="mt-1 text-sm leading-6 text-cyan-900/80">
                    The block already includes the temporary URL-file creation step when needed. That removes the manual
                    download + file path juggling from the old flow.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-zinc-800 bg-zinc-950 text-zinc-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
                  <MonitorSmartphone className="h-4 w-4 text-cyan-300" />
                  Live run preview
                </CardTitle>
                <CardDescription className="text-zinc-400">
                  This updates as you change source, project name, OS, devices, or warmup settings.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 font-mono text-xs sm:text-sm">
                {previewLines.slice(0, visiblePreviewLineCount).map((line, index) => (
                  <div key={`${line}-${index}`} className="animate-[fade-in_220ms_ease] break-all text-zinc-300">
                    {line.startsWith('SUCCESS') ? (
                      <span className="text-emerald-300">{line}</span>
                    ) : line.startsWith('[2/4]') ? (
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

            <Accordion type="single" collapsible className="rounded-3xl border border-slate-200 bg-white px-4 shadow-sm">
              <AccordionItem value="fallbacks">
                <AccordionTrigger className="hover:no-underline">
                  Fallback commands
                </AccordionTrigger>
                <AccordionContent className="space-y-4">
                  <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-900">Wizard fallback</p>
                    <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100">
                      npx @activeset/capture
                    </div>
                    <Button variant="outline" size="sm" onClick={() => copyText('npx @activeset/capture', 'wizard-command')}>
                      {copiedKey === 'wizard-command' ? <Check className="mr-2 h-4 w-4" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      Copy wizard command
                    </Button>
                  </div>

                  <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-900">Global install option</p>
                    <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100">
                      npm i -g @activeset/capture
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 break-all">
                      {globalRunCommand}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => copyText(globalRunCommand, 'global-command')} disabled={!canRun}>
                      {copiedKey === 'global-command' ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                      Copy global command
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </main>
    </div>
  );
}
