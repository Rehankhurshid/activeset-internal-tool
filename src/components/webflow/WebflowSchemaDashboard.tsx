'use client';

/**
 * WebflowSchemaDashboard — Schema.org generation tab.
 *
 * Mirrors the CMS ALT Image Scan UX: the user copies a CLI command, runs it
 * locally against their Ollama, and this page streams the live terminal
 * output from the CLI via the /api/webflow/schema/progress/events poll. A
 * separate "Import JSON" action is retained for offline runs that produced a
 * `schema-output.json` without live streaming.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  Copy,
  Check,
  Loader2,
  Terminal,
  Upload,
  ChevronRight,
  Activity,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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

import type { WebflowConfig, WebflowPageWithQC } from '@/types/webflow';
import {
  collection as fsCollection,
  doc as fsDoc,
  writeBatch,
  onSnapshot,
  query as fsQuery,
  where as fsWhere,
} from 'firebase/firestore';
import { db as fsDb } from '@/lib/firebase';
import type {
  SchemaAnalysisDoc,
  SchemaRecommendation,
} from '@/types/schema-markup';

interface WebflowSchemaDashboardProps {
  projectId: string;
  webflowConfig: WebflowConfig;
  pages: WebflowPageWithQC[];
}

// ─── CLI command builder ────────────────────────────────────────────────────

function escapeCliArg(v: string): string {
  return v.replace(/"/g, '\\"');
}

interface CliArgs {
  siteId: string;
  siteName?: string;
  apiToken?: string;
  domain: string;
  model: string;
  concurrency: number;
  only?: string;
}

function buildCommand(args: CliArgs): string {
  const parts = [`npx @activeset/schema-gen@latest generate --site ${args.siteId}`];
  if (args.apiToken) parts.push(`--token ${args.apiToken}`);
  parts.push(`--domain ${args.domain}`);
  if (args.model) parts.push(`--model ${args.model}`);
  if (args.concurrency > 1) parts.push(`--concurrency ${args.concurrency}`);
  if (args.only && args.only.trim()) {
    parts.push(`--only ${escapeCliArg(args.only.trim())}`);
  }
  if (args.siteName) parts.push(`--site-name "${escapeCliArg(args.siteName)}"`);
  return parts.join(' ');
}

function fmtDuration(totalSec: number): string {
  if (totalSec <= 0) return '0s';
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ─── Live terminal (poll /progress/events) ─────────────────────────────────

interface RunEvent {
  id: string;
  step: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
  detail: string | null;
  current: number | null;
  total: number | null;
  durationMs: number | null;
  at: number;
}

interface RunState {
  status: 'awaiting' | 'running' | 'completed' | 'aborted';
  eventCount: number;
  lastStep: string | null;
  lastMessage: string | null;
  expectedPages: number;
}

function levelColor(level: RunEvent['level']): string {
  switch (level) {
    case 'success':
      return 'text-emerald-500';
    case 'warn':
      return 'text-amber-500';
    case 'error':
      return 'text-rose-500';
    default:
      return 'text-muted-foreground';
  }
}

function stepGlyph(step: string, level: RunEvent['level']): string {
  if (level === 'error') return '✗';
  if (level === 'success') return '✓';
  if (step === 'done') return '✓';
  if (step === 'abort') return '✗';
  return '▸';
}

function RunTerminal({
  runId,
  secret,
  startedAt,
  onReset,
}: {
  runId: string;
  secret: string;
  startedAt: number;
  onReset: () => void;
}) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [run, setRun] = useState<RunState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const lastAtRef = useRef<number>(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const terminal = run?.status === 'completed' || run?.status === 'aborted';

  useEffect(() => {
    if (terminal) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [terminal]);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const since = lastAtRef.current;
        const res = await fetch(
          `/api/webflow/schema/progress/events?runId=${encodeURIComponent(runId)}&secret=${encodeURIComponent(secret)}${since ? `&since=${since}` : ''}`,
          { cache: 'no-store' }
        );
        if (!res.ok) {
          const msg =
            res.status === 404
              ? 'run not found'
              : res.status === 401
                ? 'unauthorized'
                : `HTTP ${res.status}`;
          if (!cancelled) setConnectionError(msg);
          return;
        }
        const data = (await res.json()) as { run: RunState; events: RunEvent[] };
        if (cancelled) return;
        setConnectionError(null);
        setRun(data.run);
        if (data.events.length > 0) {
          setEvents((prev) => [...prev, ...data.events]);
          lastAtRef.current = data.events[data.events.length - 1].at;
        }
      } catch (err) {
        if (!cancelled) {
          setConnectionError(err instanceof Error ? err.message : 'poll failed');
        }
      }
    }
    tick();
    const id = setInterval(tick, terminal ? 5000 : 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [runId, secret, terminal]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  const elapsed = Math.floor(
    ((terminal && events.length ? events[events.length - 1].at : now) - startedAt) / 1000
  );
  const status = run?.status ?? 'awaiting';
  const statusDot =
    status === 'completed'
      ? 'bg-emerald-500'
      : status === 'aborted'
        ? 'bg-rose-500'
        : status === 'running'
          ? 'bg-emerald-500 animate-pulse'
          : 'bg-amber-500 animate-pulse';
  const statusLabel =
    status === 'completed'
      ? 'completed'
      : status === 'aborted'
        ? 'aborted'
        : status === 'running'
          ? 'live'
          : 'awaiting CLI…';

  const lastProgressEvent = [...events]
    .reverse()
    .find((e) => e.current != null && e.total != null);
  const progressHint = lastProgressEvent
    ? `${lastProgressEvent.step} ${lastProgressEvent.current}/${lastProgressEvent.total}`
    : null;

  return (
    <div className="rounded-md border bg-zinc-950 text-zinc-100 overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/80 px-2.5 py-1.5 text-[11px] font-mono">
        <span className="flex gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
        </span>
        <span className="ml-1 text-zinc-400">schema-gen · {runId.slice(0, 8)}</span>
        <span className={`ml-2 h-1.5 w-1.5 rounded-full ${statusDot}`} />
        <span className="text-zinc-300">{statusLabel}</span>
        {progressHint ? <span className="text-zinc-500">· {progressHint}</span> : null}
        <span className="ml-auto text-zinc-500 tabular-nums">{fmtDuration(elapsed)}</span>
        <button
          type="button"
          onClick={onReset}
          className="ml-2 rounded px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          title="Clear"
        >
          reset
        </button>
      </div>
      <div
        ref={scrollRef}
        className="max-h-56 min-h-[84px] overflow-y-auto px-3 py-2 font-mono text-[11px] leading-snug"
      >
        {events.length === 0 ? (
          <div className="text-zinc-500">
            {connectionError ? (
              <>
                <span className="text-rose-400">!</span> {connectionError} — retrying…
              </>
            ) : (
              <>
                <span className="animate-pulse">▌</span> waiting for CLI to connect… paste the
                command into your terminal
              </>
            )}
          </div>
        ) : (
          events.map((ev) => {
            const ts = new Date(ev.at).toLocaleTimeString('en-US', { hour12: false });
            return (
              <div key={ev.id} className="whitespace-pre-wrap break-words">
                <span className="text-zinc-600">{ts}</span>{' '}
                <span className={levelColor(ev.level)}>{stepGlyph(ev.step, ev.level)}</span>{' '}
                <span className="text-zinc-500">{ev.step.padEnd(8, ' ')}</span>{' '}
                <span className="text-zinc-200">{ev.message}</span>
                {ev.current != null && ev.total != null ? (
                  <span className="text-zinc-500">
                    {' '}
                    [{ev.current}/{ev.total}]
                  </span>
                ) : null}
                {ev.durationMs != null ? (
                  <span className="text-zinc-600"> · {(ev.durationMs / 1000).toFixed(1)}s</span>
                ) : null}
                {ev.detail ? <div className="pl-6 text-zinc-500">{ev.detail}</div> : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Execution plan panel ──────────────────────────────────────────────────

function PlanPanel({
  pageCount,
  model,
  concurrency,
  open,
  onToggle,
}: {
  pageCount: number;
  model: string;
  concurrency: number;
  open: boolean;
  onToggle: () => void;
}) {
  // Rough per-page timing on a mid-range laptop w/ Gemma 4 / Gemma 3
  const secPerPage = model.startsWith('gemma3') ? 12 : 18;
  const perWorker = Math.max(1, concurrency);
  const analyzeSec = Math.round((pageCount * secPerPage) / perWorker);
  const scrapeSec = Math.round(pageCount * 0.8);
  const writeSec = 2;
  const totalSec = scrapeSec + analyzeSec + writeSec;

  const steps = [
    { key: 'fetch', label: 'fetch', detail: `Webflow pages API`, eta: '~1s' },
    {
      key: 'scrape',
      label: 'scrape',
      detail: `${pageCount} live URL${pageCount === 1 ? '' : 's'}`,
      eta: `~${fmtDuration(scrapeSec)}`,
    },
    {
      key: 'analyze',
      label: 'analyze',
      detail: `${pageCount} page${pageCount === 1 ? '' : 's'} · ${model}${perWorker > 1 ? ` · ${perWorker}× parallel` : ''}`,
      eta: `~${fmtDuration(analyzeSec)}`,
    },
    {
      key: 'upload',
      label: 'upload',
      detail: `stream results → dashboard cache`,
      eta: `~${fmtDuration(writeSec)}`,
    },
  ];

  return (
    <div className="rounded-md border bg-background/50">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium hover:bg-accent/50"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <Activity className="h-3.5 w-3.5 text-muted-foreground" />
        <span>execution plan</span>
        <span className="ml-2 text-muted-foreground font-mono">
          {pageCount} page{pageCount === 1 ? '' : 's'} · ~{fmtDuration(totalSec)}
        </span>
      </button>
      {open ? (
        <div className="border-t bg-muted/30 px-3 py-2 font-mono text-[11px] leading-relaxed">
          <div className="text-muted-foreground mb-1">
            $ npx @activeset/schema-gen generate
          </div>
          {steps.map((s, i) => {
            const prefix = i === steps.length - 1 ? '└─' : '├─';
            return (
              <div key={s.key} className="tabular-nums">
                <span className="text-muted-foreground">{prefix}</span>{' '}
                <span className="text-emerald-500">▸</span>{' '}
                <span className="w-16 inline-block">{s.label.padEnd(9, ' ')}</span>
                <span className="text-muted-foreground">│</span>{' '}
                <span className="w-56 inline-block">{s.detail}</span>
                <span className="text-muted-foreground">│</span>{' '}
                <span>{s.eta}</span>
              </div>
            );
          })}
          <div className="mt-1 pt-1 border-t border-dashed text-muted-foreground">
            ≈ {fmtDuration(totalSec)} total · Ollama must be running locally
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Contextual CLI bar ─────────────────────────────────────────────────────

interface StartPayload {
  projectId: string;
  siteId: string;
  siteLabel: string;
  domain: string;
  expectedPages: number;
  model: string;
  concurrency: number;
  only: string[];
}

interface ActiveRun {
  runId: string;
  secret: string;
  startedAt: number;
}

function CliBar({
  command,
  disabled,
  model,
  onModelChange,
  concurrency,
  onConcurrencyChange,
  only,
  onOnlyChange,
  hint,
  pageCount,
  startPayload,
}: {
  command: string;
  disabled?: boolean;
  model: string;
  onModelChange: (v: string) => void;
  concurrency: number;
  onConcurrencyChange: (v: number) => void;
  only: string;
  onOnlyChange: (v: string) => void;
  hint?: string;
  pageCount: number;
  startPayload?: StartPayload;
}) {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    };
  }, []);

  const handleCopy = async () => {
    if (disabled || copying) return;
    setCopying(true);
    try {
      let runSuffix = '';
      let newRun: ActiveRun | null = null;
      if (startPayload) {
        try {
          const res = await fetch('/api/webflow/schema/progress/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(startPayload),
          });
          if (res.ok) {
            const data = (await res.json()) as { runId: string; secret: string };
            const origin = typeof window !== 'undefined' ? window.location.origin : '';
            runSuffix =
              ` --run-id ${data.runId} --run-secret ${data.secret}` +
              ` --progress-url ${origin}/api/webflow/schema/progress/event` +
              ` --upload-url ${origin}/api/webflow/schema/progress/upload`;
            newRun = { runId: data.runId, secret: data.secret, startedAt: Date.now() };
          } else {
            toast.warning('Live terminal unavailable — command still copied');
          }
        } catch {
          toast.warning('Live terminal unavailable — command still copied');
        }
      }
      const finalCommand = command + runSuffix;
      await navigator.clipboard.writeText(finalCommand);
      setCopied(true);
      if (newRun) setActiveRun(newRun);
      toast.success('Command copied · paste into your terminal');
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setCopied(false), 1500);
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="rounded-md border border-dashed p-2.5 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium mr-1">Run on your machine</span>
        <Select value={model} onValueChange={onModelChange}>
          <SelectTrigger className="h-7 w-[160px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gemma4:e4b">gemma4:e4b (default)</SelectItem>
            <SelectItem value="gemma3:4b">gemma3:4b (faster)</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={String(concurrency)}
          onValueChange={(v) => onConcurrencyChange(parseInt(v, 10) || 1)}
        >
          <SelectTrigger className="h-7 w-[110px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1× parallel</SelectItem>
            <SelectItem value="2">2× parallel</SelectItem>
            <SelectItem value="3">3× parallel</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={only}
          onChange={(e) => onOnlyChange(e.target.value)}
          placeholder="--only slug,path (optional)"
          className="h-7 w-[240px] text-xs"
        />
        {hint ? (
          <span className="ml-auto text-[10px] text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap rounded bg-muted px-2.5 py-1.5 font-mono text-[11px]">
          {disabled ? '— need siteId + custom domain to build command —' : command}
        </code>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0"
          onClick={handleCopy}
          disabled={disabled || copying}
          title="Copy command"
        >
          {copying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : copied ? (
            <Check className="h-3.5 w-3.5 text-green-600" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      {!disabled ? (
        <PlanPanel
          pageCount={pageCount}
          model={model}
          concurrency={concurrency}
          open={planOpen}
          onToggle={() => setPlanOpen((o) => !o)}
        />
      ) : null}
      {activeRun != null && !disabled ? (
        <RunTerminal
          runId={activeRun.runId}
          secret={activeRun.secret}
          startedAt={activeRun.startedAt}
          onReset={() => setActiveRun(null)}
        />
      ) : null}
    </div>
  );
}

// ─── Results list — reads schema_analyses from Firestore ──────────────────

function confidenceColor(c: string): string {
  if (c === 'high') return 'bg-green-500/15 text-green-700 dark:text-green-300';
  if (c === 'low') return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
  return 'bg-blue-500/15 text-blue-700 dark:text-blue-300';
}

function RecommendationCard({ rec }: { rec: SchemaRecommendation }) {
  const [copied, setCopied] = useState(false);
  const scriptTag = useMemo(
    () =>
      `<script type="application/ld+json">\n${JSON.stringify(rec.jsonLd, null, 2)}\n</script>`,
    [rec.jsonLd]
  );
  const copy = async () => {
    await navigator.clipboard.writeText(scriptTag);
    setCopied(true);
    toast.success(`Copied ${rec.type} JSON-LD`);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant="secondary" className="font-mono text-[10px]">
            {rec.type}
          </Badge>
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${confidenceColor(rec.confidence)}`}
          >
            {rec.confidence}
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={copy} className="h-7 text-xs">
          {copied ? (
            <Check className="h-3 w-3 mr-1" />
          ) : (
            <Copy className="h-3 w-3 mr-1" />
          )}
          {copied ? 'Copied' : 'Copy <script>'}
        </Button>
      </div>
      {rec.reason ? (
        <p className="text-xs text-muted-foreground">{rec.reason}</p>
      ) : null}
      <pre className="text-[11px] leading-relaxed bg-background rounded border p-2 overflow-x-auto max-h-48">
        {scriptTag}
      </pre>
    </div>
  );
}

function ResultRow({
  analysis,
  pageTitle,
}: {
  analysis: SchemaAnalysisDoc;
  pageTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const recs = analysis.result.recommended ?? [];
  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40 transition-colors"
      >
        <ChevronRight
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{pageTitle}</div>
          <div className="text-xs text-muted-foreground truncate">
            {analysis.url}
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] font-mono">
          {analysis.result.pageType}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          {recs.length} rec{recs.length === 1 ? '' : 's'}
        </Badge>
      </button>
      {open ? (
        <div className="border-t p-3 space-y-2 bg-background/50">
          {analysis.result.summary ? (
            <p className="text-xs text-muted-foreground italic">
              {analysis.result.summary}
            </p>
          ) : null}
          {recs.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No recommendations for this page.
            </p>
          ) : (
            recs.map((r, i) => <RecommendationCard key={i} rec={r} />)
          )}
        </div>
      ) : null}
    </div>
  );
}

function ResultsList({
  projectId,
  pages,
}: {
  projectId: string;
  pages: WebflowPageWithQC[];
}) {
  const [analyses, setAnalyses] = useState<SchemaAnalysisDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = fsQuery(
      fsCollection(fsDb, 'schema_analyses'),
      fsWhere('projectId', '==', projectId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => d.data() as SchemaAnalysisDoc);
        // Keep latest per pageId
        const byPage = new Map<string, SchemaAnalysisDoc>();
        for (const r of rows) {
          const prev = byPage.get(r.pageId);
          if (!prev || (r.createdAt ?? 0) > (prev.createdAt ?? 0)) {
            byPage.set(r.pageId, r);
          }
        }
        const latest = Array.from(byPage.values()).sort(
          (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)
        );
        setAnalyses(latest);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [projectId]);

  const pageTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of pages) m.set(p.id, p.title || p.slug || p.id);
    return m;
  }, [pages]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading analyses…
      </div>
    );
  }

  if (analyses.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
        No schema analyses yet. Run the CLI above or import a{' '}
        <code>schema-output.json</code> file.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Results
          <Badge variant="secondary" className="text-[10px]">
            {analyses.length}
          </Badge>
        </div>
        <div className="text-[11px] text-muted-foreground">
          Click a row to view recommendations · paste script tags into Webflow →
          Page Settings → Custom Code (head)
        </div>
      </div>
      <div className="space-y-2">
        {analyses.map((a) => (
          <ResultRow
            key={`${a.pageId}_${a.contentHash}`}
            analysis={a}
            pageTitle={pageTitleById.get(a.pageId) ?? a.pageId}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main dashboard ─────────────────────────────────────────────────────────

export function WebflowSchemaDashboard({
  projectId,
  webflowConfig,
  pages,
}: WebflowSchemaDashboardProps) {
  const [model, setModel] = useState('gemma4:e4b');
  const [concurrency, setConcurrency] = useState(1);
  const [only, setOnly] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const eligiblePages = useMemo(
    () => pages.filter((p) => !p.collectionId && !p.draft && !p.archived),
    [pages]
  );

  const onlySlugs = useMemo(
    () =>
      only
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [only]
  );

  const expectedPages = useMemo(() => {
    if (onlySlugs.length === 0) return eligiblePages.length;
    const filter = new Set(onlySlugs);
    return eligiblePages.filter(
      (p) => filter.has(p.slug) || filter.has(p.publishedPath ?? '')
    ).length;
  }, [eligiblePages, onlySlugs]);

  const canBuild = Boolean(
    webflowConfig.siteId && webflowConfig.customDomain && eligiblePages.length > 0
  );

  const command = canBuild
    ? buildCommand({
        siteId: webflowConfig.siteId,
        siteName: webflowConfig.siteName,
        apiToken: webflowConfig.apiToken,
        domain: webflowConfig.customDomain ?? '',
        model,
        concurrency,
        only,
      })
    : '';

  const startPayload: StartPayload | undefined = canBuild
    ? {
        projectId,
        siteId: webflowConfig.siteId,
        siteLabel: webflowConfig.siteName || webflowConfig.siteId,
        domain: webflowConfig.customDomain ?? '',
        expectedPages,
        model,
        concurrency,
        only: onlySlugs,
      }
    : undefined;

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        version?: number;
        entries?: Array<{
          pageId: string;
          pageTitle?: string;
          url: string;
          contentHash: string;
          result: unknown;
        }>;
        model?: string;
      };
      if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
        toast.error('Invalid schema-output.json (expected version: 1 with entries[])');
        return;
      }
      const batch = writeBatch(fsDb);
      const col = fsCollection(fsDb, 'schema_analyses');
      for (const entry of parsed.entries) {
        if (!entry.pageId || !entry.contentHash) continue;
        const ref = fsDoc(col, `${entry.pageId}_${entry.contentHash}`);
        batch.set(ref, {
          pageId: entry.pageId,
          projectId,
          contentHash: entry.contentHash,
          url: entry.url,
          result: entry.result,
          model: parsed.model ?? 'unknown',
          createdAt: Date.now(),
        });
      }
      await batch.commit();
      toast.success(`Imported ${parsed.entries.length} schema analyses`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Import failed: ${msg}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Schema Markup
              </CardTitle>
              <CardDescription className="mt-1">
                Generate Schema.org JSON-LD recommendations for every published static
                page using a local Ollama model. Runs on your machine; results stream
                back to the dashboard.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImport(f);
                }}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing}
                  >
                    {importing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Import schema-output.json
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Import a previously generated <code>schema-output.json</code> from
                  an offline CLI run (no live streaming).
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              <Badge variant="secondary" className="text-[10px] font-mono">
                {eligiblePages.length}
              </Badge>
              eligible static pages
            </span>
            {onlySlugs.length > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                filtered to{' '}
                <Badge variant="secondary" className="text-[10px] font-mono">
                  {expectedPages}
                </Badge>
              </span>
            ) : null}
            {!webflowConfig.customDomain ? (
              <span className="text-amber-600 dark:text-amber-400">
                Set a custom domain in Webflow settings to enable the CLI command.
              </span>
            ) : null}
          </div>

          <CliBar
            command={command}
            disabled={!canBuild}
            model={model}
            onModelChange={setModel}
            concurrency={concurrency}
            onConcurrencyChange={setConcurrency}
            only={only}
            onOnlyChange={setOnly}
            pageCount={expectedPages}
            startPayload={startPayload}
            hint="Ollama must be running: `ollama serve`"
          />

          <ResultsList projectId={projectId} pages={pages} />

          <div className="rounded-md bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            <div className="font-medium text-foreground mb-1">Prerequisites</div>
            <ol className="list-decimal pl-4 space-y-0.5">
              <li>
                Install Ollama and pull a Gemma model:{' '}
                <code className="text-[11px]">ollama pull gemma4:e4b</code>
              </li>
              <li>
                Run <code className="text-[11px]">ollama serve</code> in a separate
                terminal
              </li>
              <li>Copy the command above and paste it into your terminal</li>
              <li>
                Watch progress stream into the live terminal; results are cached per
                page
              </li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
