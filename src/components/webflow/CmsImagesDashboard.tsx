'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Database,
  Search,
  RefreshCw,
  Loader2,
  ImageIcon,
  FileText,
  Check,
  Copy,
  Terminal,
  ChevronRight,
  Activity,
} from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useCmsImages } from '@/hooks/useCmsImages';
import type { WebflowConfig, CmsCollectionSummary, CmsImageEntry } from '@/types/webflow';
import { fetchForProject } from '@/lib/api-client';

type StatusFilter = 'all' | 'missing' | 'has-alt';
type FieldTypeFilter = 'all' | 'Image' | 'RichText';

interface CmsImagesDashboardProps {
  projectId: string;
  webflowConfig: WebflowConfig;
}

const TOKEN_PLACEHOLDER = '__WEBFLOW_TOKEN__';

// ─── CLI command builders ───────────────────────────────────────────────────

function escapeCliArg(v: string): string {
  return v.replace(/"/g, '\\"');
}

interface CliCommandArgs {
  siteId: string;
  siteName?: string;
  /** When true the command is built with a token placeholder that is
   *  replaced with the real token at copy time (fetched via the reveal
   *  endpoint). When false, no --token flag is added. */
  includeTokenPlaceholder?: boolean;
  collectionIds?: string[];
  missingOnly?: boolean;
  csvPath?: string;
  maxCompress?: number;
}

interface CliActions {
  ai: boolean;
  compress: boolean;
  publish: boolean;
  cleanup: boolean;
}

function buildContextualCommand(args: CliCommandArgs, actions: CliActions, fields?: string[]): string {
  const parts = [`npx @activeset/cms-alt run --site ${args.siteId}`];
  if (args.includeTokenPlaceholder) parts.push(`--token ${TOKEN_PLACEHOLDER}`);
  if (args.collectionIds && args.collectionIds.length > 0) {
    parts.push(`--collections ${args.collectionIds.join(',')}`);
  }
  if (fields && fields.length > 0) {
    parts.push(`--fields ${fields.join(',')}`);
  }
  if (args.missingOnly) parts.push('--missing-only');
  if (actions.ai) parts.push('--ai');
  if (actions.compress) parts.push('--compress');
  if (actions.publish) parts.push('--publish');
  // Cleanup only makes sense alongside compress + publish.
  if (actions.cleanup && actions.compress && actions.publish) parts.push('--cleanup');
  if (args.siteName) parts.push(`--site-name "${escapeCliArg(args.siteName)}"`);
  return parts.join(' ');
}

interface RunPlan {
  siteLabel: string;
  collectionLabel: string;
  imageCount: number;
  missingCount: number;
  fieldCount: number;
}

function fmtDuration(totalSec: number): string {
  if (totalSec <= 0) return '0s';
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ─── Real backchannel: terminal output streamed from the CLI ───────────────

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
  expectedImages: number;
}

function levelColor(level: RunEvent['level']): string {
  switch (level) {
    case 'success': return 'text-emerald-500';
    case 'warn': return 'text-amber-500';
    case 'error': return 'text-rose-500';
    default: return 'text-muted-foreground';
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

  // Tick clock for elapsed display
  useEffect(() => {
    if (terminal) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [terminal]);

  // Poll events every 1s (2s once terminal) until reset
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const since = lastAtRef.current;
        const res = await fetch(
          `/api/webflow/cms/progress/events?runId=${encodeURIComponent(runId)}&secret=${encodeURIComponent(secret)}${since ? `&since=${since}` : ''}`,
          { cache: 'no-store' }
        );
        if (!res.ok) {
          const msg = res.status === 404 ? 'run not found' : res.status === 401 ? 'unauthorized' : `HTTP ${res.status}`;
          if (!cancelled) setConnectionError(msg);
          return;
        }
        const data = (await res.json()) as { run: RunState; events: RunEvent[] };
        if (cancelled) return;
        setConnectionError(null);
        setRun(data.run);
        if (data.events.length > 0) {
          setEvents(prev => [...prev, ...data.events]);
          lastAtRef.current = data.events[data.events.length - 1].at;
        }
      } catch (err) {
        if (!cancelled) setConnectionError(err instanceof Error ? err.message : 'poll failed');
      }
    }
    tick();
    const id = setInterval(tick, terminal ? 5000 : 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [runId, secret, terminal]);

  // Autoscroll to latest
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  const elapsed = Math.floor(((terminal && events.length ? events[events.length - 1].at : now) - startedAt) / 1000);
  const status = run?.status ?? 'awaiting';
  const statusDot =
    status === 'completed' ? 'bg-emerald-500' :
    status === 'aborted' ? 'bg-rose-500' :
    status === 'running' ? 'bg-emerald-500 animate-pulse' :
    'bg-amber-500 animate-pulse';
  const statusLabel =
    status === 'completed' ? 'completed' :
    status === 'aborted' ? 'aborted' :
    status === 'running' ? 'live' :
    'awaiting CLI…';

  // Progress hint derived from last event with current/total
  const lastProgressEvent = [...events].reverse().find(e => e.current != null && e.total != null);
  const progressHint = lastProgressEvent
    ? `${lastProgressEvent.step} ${lastProgressEvent.current}/${lastProgressEvent.total}`
    : null;

  return (
    <div className="rounded-md border bg-zinc-950 text-zinc-100 overflow-hidden shadow-sm">
      {/* fake titlebar */}
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/80 px-2.5 py-1.5 text-[11px] font-mono">
        <span className="flex gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
        </span>
        <span className="ml-1 text-zinc-400">cms-alt · {runId.slice(0, 8)}</span>
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
      {/* log body */}
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
          events.map(ev => {
            const ts = new Date(ev.at).toLocaleTimeString('en-US', { hour12: false });
            return (
              <div key={ev.id} className="whitespace-pre-wrap break-words">
                <span className="text-zinc-600">{ts}</span>{' '}
                <span className={`${levelColor(ev.level)}`}>{stepGlyph(ev.step, ev.level)}</span>{' '}
                <span className="text-zinc-500">{ev.step.padEnd(8, ' ')}</span>{' '}
                <span className="text-zinc-200">{ev.message}</span>
                {ev.current != null && ev.total != null ? (
                  <span className="text-zinc-500"> [{ev.current}/{ev.total}]</span>
                ) : null}
                {ev.durationMs != null ? (
                  <span className="text-zinc-600"> · {(ev.durationMs / 1000).toFixed(1)}s</span>
                ) : null}
                {ev.detail ? (
                  <div className="pl-6 text-zinc-500">{ev.detail}</div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function PlanPanel({
  plan,
  actions,
  open,
  onToggle,
}: {
  plan: RunPlan;
  actions: CliActions;
  open: boolean;
  onToggle: () => void;
}) {
  // Rough ETA heuristics — per-image seconds on a mid-range laptop w/ Gemma 3 4B
  const altSecPerImage = 8;
  const compressSecPerImage = 2.5;

  const altSubtotal = actions.ai ? Math.round(plan.missingCount * altSecPerImage) : 0;
  const compressSubtotal = actions.compress
    ? Math.round(plan.imageCount * compressSecPerImage)
    : 0;
  const publishOverhead = actions.publish ? 4 : 0;
  const importOverhead = 3;
  const totalSec = altSubtotal + compressSubtotal + publishOverhead + importOverhead;

  const steps: Array<{ key: string; on: boolean; label: string; detail: string; eta: string }> = [
    {
      key: 'export',
      on: true,
      label: 'export',
      detail: `${plan.imageCount} images · ${plan.fieldCount} fields`,
      eta: '~2s',
    },
    {
      key: 'generate',
      on: actions.ai,
      label: 'generate',
      detail: `${plan.missingCount} missing ALT · gemma3:4b`,
      eta: altSubtotal > 0 ? `~${fmtDuration(altSubtotal)}` : '—',
    },
    {
      key: 'compress',
      on: actions.compress,
      label: 'compress',
      detail: `${plan.imageCount} → lossless WebP`,
      eta: compressSubtotal > 0 ? `~${fmtDuration(compressSubtotal)}` : '—',
    },
    {
      key: 'import',
      on: true,
      label: 'import',
      detail: 'PATCH Webflow CMS',
      eta: '~3s',
    },
    {
      key: 'publish',
      on: actions.publish,
      label: 'publish',
      detail: 'push live',
      eta: actions.publish ? '~4s' : '—',
    },
    {
      key: 'cleanup',
      on: actions.cleanup && actions.compress && actions.publish,
      label: 'cleanup',
      detail: 'delete originals',
      eta: actions.cleanup && actions.compress && actions.publish
        ? `~${Math.max(5, Math.round(plan.imageCount * 0.3))}s`
        : '—',
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
          {plan.collectionLabel} · {plan.imageCount} img · ~{fmtDuration(totalSec)}
        </span>
      </button>
      {open ? (
        <div className="border-t bg-muted/30 px-3 py-2 font-mono text-[11px] leading-relaxed">
          <div className="text-muted-foreground mb-1">
            $ npx @activeset/cms-alt run · {plan.siteLabel}
          </div>
          {steps.map((s, i) => {
            const prefix = i === steps.length - 1 ? '└─' : '├─';
            const tag = s.on ? '▸' : '·';
            const color = s.on ? 'text-foreground' : 'text-muted-foreground/60';
            return (
              <div key={s.key} className={`${color} tabular-nums`}>
                <span className="text-muted-foreground">{prefix}</span>{' '}
                <span className={s.on ? 'text-emerald-500' : 'text-muted-foreground/60'}>
                  {tag}
                </span>{' '}
                <span className="w-16 inline-block">{s.label.padEnd(9, ' ')}</span>
                <span className="text-muted-foreground">│</span>{' '}
                <span className="w-48 inline-block">{s.detail}</span>
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

interface StartPayload {
  siteId: string;
  siteLabel: string;
  collectionIds: string[];
  collectionLabel: string;
  expectedImages: number;
  actions: CliActions;
}

interface ActiveRun {
  runId: string;
  secret: string;
  startedAt: number;
}

function ContextualCliBar({
  command,
  displayCommand,
  projectId,
  needsToken,
  disabled,
  actions,
  onActionsChange,
  hint,
  plan,
  startPayload,
}: {
  command: string;
  displayCommand?: string;
  projectId: string;
  needsToken: boolean;
  disabled?: boolean;
  actions: CliActions;
  onActionsChange: (next: CliActions) => void;
  hint?: string;
  plan?: RunPlan;
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
      // Fetch the Webflow API token on-demand. We never keep the token in
      // memory beyond the moment of copy, and we never render it.
      let resolvedCommand = command;
      if (needsToken) {
        try {
          const tokenRes = await fetchForProject(projectId, '/api/webflow/config/reveal-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId }),
          });
          if (!tokenRes.ok) {
            const err = await tokenRes.json().catch(() => ({}));
            toast.error(err.error || 'Unable to read Webflow token');
            return;
          }
          const { apiToken } = (await tokenRes.json()) as { apiToken?: string };
          if (!apiToken) {
            toast.error('No Webflow API token is configured');
            return;
          }
          resolvedCommand = command.split(TOKEN_PLACEHOLDER).join(apiToken);
        } catch {
          toast.error('Unable to read Webflow token');
          return;
        }
      }

      // Provision a real run so the CLI can stream events back to this page.
      let runSuffix = '';
      let newRun: ActiveRun | null = null;
      if (startPayload) {
        try {
          const res = await fetch('/api/webflow/cms/progress/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(startPayload),
          });
          if (res.ok) {
            const data = (await res.json()) as { runId: string; secret: string };
            const origin = typeof window !== 'undefined' ? window.location.origin : '';
            runSuffix = ` --run-id ${data.runId} --run-secret ${data.secret} --progress-url ${origin}/api/webflow/cms/progress/event`;
            newRun = { runId: data.runId, secret: data.secret, startedAt: Date.now() };
          } else {
            toast.warning('Live terminal unavailable — command still copied');
          }
        } catch {
          toast.warning('Live terminal unavailable — command still copied');
        }
      }
      const finalCommand = resolvedCommand + runSuffix;
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

  const toggleClass = (on: boolean) =>
    `h-7 px-2.5 text-xs rounded-md border transition-colors ${
      on
        ? 'bg-primary text-primary-foreground border-primary'
        : 'bg-transparent text-muted-foreground border-border hover:bg-accent'
    }`;

  return (
    <div className="rounded-md border border-dashed p-2.5 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium mr-1">Run on your machine</span>
        <button
          type="button"
          className={toggleClass(actions.ai)}
          onClick={() => onActionsChange({ ...actions, ai: !actions.ai })}
        >
          ALT (Gemma 3 4B)
        </button>
        <button
          type="button"
          className={toggleClass(actions.compress)}
          onClick={() => onActionsChange({ ...actions, compress: !actions.compress })}
        >
          Compress (WebP)
        </button>
        <button
          type="button"
          className={toggleClass(actions.publish)}
          onClick={() => onActionsChange({ ...actions, publish: !actions.publish })}
        >
          Publish
        </button>
        {/*
          Cleanup is only meaningful after compress + publish — the originals
          being deleted are the ones replaced by compressed uploads, and
          deleting before publish would 404 the live site.
        */}
        <button
          type="button"
          className={toggleClass(actions.cleanup && actions.compress && actions.publish)}
          onClick={() => onActionsChange({ ...actions, cleanup: !actions.cleanup })}
          disabled={!actions.compress || !actions.publish}
          title={
            !actions.compress
              ? 'Enable Compress first — cleanup deletes originals replaced by compressed versions'
              : !actions.publish
                ? 'Enable Publish first — deleting before publish would 404 the live site'
                : 'Delete original Webflow assets that were replaced by compressed versions'
          }
        >
          Delete originals
        </button>
        {hint ? <span className="ml-auto text-[10px] text-muted-foreground">{hint}</span> : null}
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap rounded bg-muted px-2.5 py-1.5 font-mono text-[11px]">
          {disabled ? '— pick a collection to build a command —' : (displayCommand ?? command)}
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
      {plan && !disabled ? (
        <PlanPanel
          plan={plan}
          actions={actions}
          open={planOpen}
          onToggle={() => setPlanOpen(o => !o)}
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

const DEFAULT_ACTIONS: CliActions = { ai: true, compress: true, publish: false, cleanup: false };

export function CmsImagesDashboard({ projectId, webflowConfig }: CmsImagesDashboardProps) {
  const {
    collections,
    discoveryLoading,
    discoverCollections,
    scanAltCounts,
    altScanLoading,
    altScanProgress,
    altScanTotals,
    images,
    imagesLoading,
    hasMore,
    fetchImages,
    fetchAllImages,
    error,
    clearError,
    reset,
  } = useCmsImages(projectId, webflowConfig);

  // Local UI state
  const [selectedCollections, setSelectedCollections] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [fieldTypeFilter, setFieldTypeFilter] = useState<FieldTypeFilter>('all');
  const [collectionFilter, setCollectionFilter] = useState<string>('all');
  const [actions, setActions] = useState<CliActions>(DEFAULT_ACTIONS);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());

  // --- Derived state ---
  const filteredImages = useMemo(() => {
    let result = images;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        img =>
          img.itemName.toLowerCase().includes(q) ||
          img.fieldDisplayName.toLowerCase().includes(q) ||
          img.collectionName.toLowerCase().includes(q) ||
          (img.currentAlt || '').toLowerCase().includes(q)
      );
    }

    if (statusFilter === 'missing') {
      result = result.filter(img => img.isMissingAlt);
    } else if (statusFilter === 'has-alt') {
      result = result.filter(img => !img.isMissingAlt);
    }

    if (fieldTypeFilter !== 'all') {
      result = result.filter(img =>
        fieldTypeFilter === 'Image'
          ? img.fieldType === 'Image' || img.fieldType === 'MultiImage'
          : img.fieldType === 'RichText'
      );
    }

    if (collectionFilter !== 'all') {
      result = result.filter(img => img.collectionId === collectionFilter);
    }

    return result;
  }, [images, searchQuery, statusFilter, fieldTypeFilter, collectionFilter]);

  const missingAltCount = useMemo(
    () => images.filter(img => img.isMissingAlt).length,
    [images]
  );

  const visibleIds = useMemo(() => new Set(filteredImages.map(i => i.id)), [filteredImages]);
  const selectedVisibleCount = useMemo(
    () => [...selectedIds].filter(id => visibleIds.has(id)).length,
    [selectedIds, visibleIds]
  );

  // --- Handlers ---
  const toggleCollection = (id: string) => {
    setSelectedCollections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedVisibleCount === filteredImages.length) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        for (const id of visibleIds) next.delete(id);
        return next;
      });
    } else {
      setSelectedIds(prev => new Set([...prev, ...visibleIds]));
    }
  };

  const selectMissingAlt = () => {
    const missing = filteredImages.filter(img => img.isMissingAlt);
    setSelectedIds(new Set(missing.map(m => m.id)));
  };

  const handleLoadImages = async () => {
    const ids = [...selectedCollections];
    if (ids.length === 0) {
      toast.error('Select at least one collection');
      return;
    }
    if (ids.length === 1) {
      await fetchImages(ids[0], 0);
    } else {
      await fetchAllImages(ids);
    }
  };

  const handleLoadMore = async () => {
    const lastImage = images[images.length - 1];
    if (lastImage) {
      const offset = images.filter(i => i.collectionId === lastImage.collectionId).length;
      await fetchImages(lastImage.collectionId, offset);
    }
  };

  // CLI command args derived from current UI state. When collections have been
  // loaded we derive collectionIds from the images themselves (or the active
  // collection filter) so the CLI mirrors whatever the user is looking at.
  const cliCollectionIds = useMemo(() => {
    if (collectionFilter !== 'all') return [collectionFilter];
    if (selectedCollections.size > 0) return [...selectedCollections];
    return [...new Set(images.map(i => i.collectionId))];
  }, [collectionFilter, selectedCollections, images]);

  const cliArgs: CliCommandArgs = {
    siteId: webflowConfig.siteId,
    siteName: webflowConfig.siteName,
    includeTokenPlaceholder: Boolean(webflowConfig.hasApiToken),
    collectionIds: cliCollectionIds,
    missingOnly: statusFilter === 'missing',
  };

  // Contextual field slugs: from explicit field checkboxes first, otherwise
  // derived from the currently filtered images so the CLI mirrors the view.
  const cliFields = useMemo(() => {
    if (selectedFields.size > 0) return [...selectedFields];
    if (images.length === 0) return undefined;
    const slugs = new Set<string>();
    for (const img of filteredImages) slugs.add(img.fieldSlug);
    const allSlugs = new Set(images.map(i => i.fieldSlug));
    // Only narrow the command when the view is actually narrowed.
    if (slugs.size === allSlugs.size) return undefined;
    return [...slugs];
  }, [selectedFields, filteredImages, images]);

  const cliCommand = buildContextualCommand(cliArgs, actions, cliFields);
  const cliDisplayCommand = cliArgs.includeTokenPlaceholder
    ? cliCommand.replace(`--token ${TOKEN_PLACEHOLDER}`, '--token ••••••••')
    : cliCommand;
  const cliDisabled = !cliArgs.collectionIds || cliArgs.collectionIds.length === 0;

  const runPlan: RunPlan | undefined = useMemo(() => {
    const collectionIds = cliArgs.collectionIds ?? [];
    if (collectionIds.length === 0) return undefined;

    // Prefer concrete numbers from loaded images; fall back to collection metadata
    if (images.length > 0) {
      const scoped = statusFilter === 'missing' ? filteredImages : images;
      const fieldSlugs = new Set(scoped.map(i => i.fieldSlug));
      return {
        siteLabel: webflowConfig.siteName || webflowConfig.siteId,
        collectionLabel:
          collectionIds.length === 1
            ? images.find(i => i.collectionId === collectionIds[0])?.collectionName || collectionIds[0]
            : `${collectionIds.length} collections`,
        imageCount: scoped.length,
        missingCount: scoped.filter(i => i.isMissingAlt).length,
        fieldCount: fieldSlugs.size,
      };
    }

    const selected = collections.filter(c => collectionIds.includes(c.id));
    const imageCount = selected.reduce((acc, c) => acc + c.totalItems, 0);
    const fieldCount = selected.reduce(
      (acc, c) => acc + c.imageFields.length + c.richTextFields.length,
      0
    );
    return {
      siteLabel: webflowConfig.siteName || webflowConfig.siteId,
      collectionLabel:
        selected.length === 1 ? selected[0].displayName : `${selected.length} collections`,
      imageCount,
      // Pre-scan we don't know missing count yet; assume all as worst-case ETA
      missingCount: imageCount,
      fieldCount,
    };
  }, [cliArgs.collectionIds, images, filteredImages, collections, statusFilter, webflowConfig.siteId, webflowConfig.siteName]);

  const startPayload: StartPayload | undefined = (cliArgs.collectionIds && cliArgs.collectionIds.length > 0)
    ? {
        siteId: cliArgs.siteId,
        siteLabel: webflowConfig.siteName || webflowConfig.siteId,
        collectionIds: cliArgs.collectionIds,
        collectionLabel: runPlan?.collectionLabel ?? cliArgs.collectionIds.join(','),
        expectedImages: runPlan?.imageCount ?? 0,
        actions,
      }
    : undefined;

  // --- Discovery view ---
  if (collections.length === 0 && images.length === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4" />
                CMS Images — ALT Text & Compression
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
                <Button variant="ghost" size="sm" className="ml-2 h-6" onClick={clearError}>Dismiss</Button>
              </div>
            )}
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <Database className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-medium">Scan CMS collections to find images</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Discovers Image fields and Rich Text inline images across all collections
                </p>
              </div>
              <Button onClick={discoverCollections} disabled={discoveryLoading}>
                {discoveryLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Scanning...</>
                ) : (
                  <><Search className="mr-2 h-4 w-4" />Scan CMS</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Collection selection (after discovery, before loading images) ---
  if (collections.length > 0 && images.length === 0 && !imagesLoading) {
    return (
      <div className="space-y-4">
        <ContextualCliBar
          command={cliCommand}
          displayCommand={cliDisplayCommand}
          projectId={projectId}
          needsToken={Boolean(cliArgs.includeTokenPlaceholder)}
          disabled={cliDisabled}
          actions={actions}
          onActionsChange={setActions}
          plan={runPlan}
          startPayload={startPayload}
          hint={
            selectedCollections.size > 0
              ? `${selectedCollections.size} collection${selectedCollections.size !== 1 ? 's' : ''} selected`
              : 'Select collections below'
          }
        />
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4" />
                CMS Images — ALT Text & Compression
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => scanAltCounts()}
                  disabled={altScanLoading || collections.length === 0}
                  title="Count images missing ALT across every collection — no full load required"
                >
                  {altScanLoading ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Scanning {altScanProgress.completed}/{altScanProgress.total}
                    </>
                  ) : (
                    <>
                      <Activity className="mr-2 h-3.5 w-3.5" />
                      Scan missing ALT
                    </>
                  )}
                </Button>
                <Button variant="ghost" size="sm" onClick={discoverCollections} disabled={discoveryLoading}>
                  <RefreshCw className={`h-4 w-4 ${discoveryLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
          {error && (
            <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
              <Button variant="ghost" size="sm" className="ml-2 h-6" onClick={clearError}>Dismiss</Button>
            </div>
          )}
          {altScanTotals.scannedCollections > 0 ? (
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-md border bg-muted/30 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Images scanned
                </div>
                <div className="text-xl font-semibold tabular-nums">
                  {altScanTotals.totalImages.toLocaleString()}
                </div>
              </div>
              <div
                className={`rounded-md border px-3 py-2 ${
                  altScanTotals.missingAltCount > 0
                    ? 'border-amber-500/40 bg-amber-500/5'
                    : 'border-emerald-500/40 bg-emerald-500/5'
                }`}
              >
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Missing ALT
                </div>
                <div
                  className={`text-xl font-semibold tabular-nums ${
                    altScanTotals.missingAltCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {altScanTotals.missingAltCount.toLocaleString()}
                </div>
                {altScanTotals.totalImages > 0 ? (
                  <div className="text-[11px] text-muted-foreground">
                    {Math.round((altScanTotals.missingAltCount / altScanTotals.totalImages) * 100)}% of images
                  </div>
                ) : null}
              </div>
              <div className="rounded-md border bg-muted/30 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Collections scanned
                </div>
                <div className="text-xl font-semibold tabular-nums">
                  {altScanTotals.scannedCollections} / {collections.length}
                </div>
              </div>
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground mb-4">
            Found {collections.length} collection(s) with images. Select which to load:
          </p>
          <div className="space-y-2 mb-4">
            {collections.map((coll: CmsCollectionSummary) => {
              const isSelected = selectedCollections.has(coll.id);
              const allFields = [...coll.imageFields, ...coll.richTextFields];
              return (
                <div
                  key={coll.id}
                  className="rounded-md border transition-colors"
                >
                  <label className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/50">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleCollection(coll.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm">{coll.displayName}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {coll.totalItems} items
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      {coll.imageFields.length > 0 ? (
                        <Badge variant="secondary" className="text-xs">
                          <ImageIcon className="h-3 w-3 mr-1" />
                          {coll.imageFields.length} image field{coll.imageFields.length !== 1 ? 's' : ''}
                        </Badge>
                      ) : null}
                      {coll.richTextFields.length > 0 ? (
                        <Badge variant="outline" className="text-xs">
                          <FileText className="h-3 w-3 mr-1" />
                          {coll.richTextFields.length} rich text
                        </Badge>
                      ) : null}
                      {coll.altScan ? (
                        coll.altScan.missingAltCount > 0 ? (
                          <Badge
                            variant="outline"
                            className="text-xs border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                          >
                            {coll.altScan.missingAltCount}/{coll.altScan.totalImages} missing ALT
                          </Badge>
                        ) : coll.altScan.totalImages > 0 ? (
                          <Badge
                            variant="outline"
                            className="text-xs border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          >
                            ALT complete ({coll.altScan.totalImages})
                          </Badge>
                        ) : null
                      ) : null}
                    </div>
                  </label>
                  {isSelected && allFields.length > 0 ? (
                    <div className="border-t bg-muted/30 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                        Fields to include (optional — leave empty for all)
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {allFields.map(f => {
                          const on = selectedFields.has(f.slug);
                          const isRich = coll.richTextFields.some(r => r.slug === f.slug);
                          return (
                            <button
                              key={f.slug}
                              type="button"
                              onClick={() => {
                                setSelectedFields(prev => {
                                  const next = new Set(prev);
                                  if (next.has(f.slug)) next.delete(f.slug); else next.add(f.slug);
                                  return next;
                                });
                              }}
                              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
                                on
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background text-muted-foreground hover:bg-accent'
                              }`}
                            >
                              {isRich ? <FileText className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                              {f.displayName}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setSelectedCollections(new Set(collections.map(c => c.id)))}
              variant="outline"
              size="sm"
            >
              Select All
            </Button>
            <Button
              onClick={handleLoadImages}
              disabled={selectedCollections.size === 0 || imagesLoading}
            >
              {imagesLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading...</>
              ) : (
                <>Load Images ({selectedCollections.size} collection{selectedCollections.size !== 1 ? 's' : ''})</>
              )}
            </Button>
          </div>
        </CardContent>
        </Card>
      </div>
    );
  }

  // --- Main dashboard (images loaded) ---
  return (
    <div className="space-y-4">
      <ContextualCliBar
        command={cliCommand}
        displayCommand={cliDisplayCommand}
        projectId={projectId}
        needsToken={Boolean(cliArgs.includeTokenPlaceholder)}
        disabled={cliDisabled}
        actions={actions}
        onActionsChange={setActions}
        plan={runPlan}
        hint={
          cliFields && cliFields.length > 0
            ? `${cliFields.length} field${cliFields.length !== 1 ? 's' : ''} · ${cliArgs.collectionIds?.length ?? 0} collection${(cliArgs.collectionIds?.length ?? 0) !== 1 ? 's' : ''}`
            : `${cliArgs.collectionIds?.length ?? 0} collection${(cliArgs.collectionIds?.length ?? 0) !== 1 ? 's' : ''} · all fields`
        }
      />
      <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" />
            CMS Images — ALT Text & Compression
            <Badge variant="secondary" className="ml-1">{images.length} images</Badge>
            {missingAltCount > 0 && (
              <Badge variant="destructive">{missingAltCount} missing ALT</Badge>
            )}
          </CardTitle>
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                reset();
                setSelectedIds(new Set());
              }}
              title="Back to collections"
            >
              <Database className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLoadImages}
              disabled={imagesLoading}
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${imagesLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
            <Button variant="ghost" size="sm" className="ml-2 h-6" onClick={clearError}>Dismiss</Button>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search items, fields, ALT text..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          <Select value={collectionFilter} onValueChange={v => setCollectionFilter(v)}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Collection" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Collections</SelectItem>
              {[...new Set(images.map(i => i.collectionId))].map(cid => {
                const name = images.find(i => i.collectionId === cid)?.collectionName || cid;
                return <SelectItem key={cid} value={cid}>{name}</SelectItem>;
              })}
            </SelectContent>
          </Select>

          <Select value={fieldTypeFilter} onValueChange={v => setFieldTypeFilter(v as FieldTypeFilter)}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Field Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Image">Image Fields</SelectItem>
              <SelectItem value="RichText">Rich Text</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="missing">Missing ALT</SelectItem>
              <SelectItem value="has-alt">Has ALT</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Selection helpers — used to count rows for CLI commands */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={toggleSelectAll}>
            {selectedVisibleCount === filteredImages.length && filteredImages.length > 0
              ? 'Deselect All'
              : `Select All (${filteredImages.length})`}
          </Button>

          {missingAltCount > 0 && (
            <Button variant="outline" size="sm" onClick={selectMissingAlt}>
              Select Missing ({missingAltCount})
            </Button>
          )}

          {selectedIds.size > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear ({selectedIds.size})
            </Button>
          )}

          <div className="flex-1" />
          <p className="text-xs text-muted-foreground">
            Run the CLI commands above to generate ALT text &amp; compress — web preview only.
          </p>
        </div>

        {imagesLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading images...</span>
          </div>
        )}

        {/* Image table */}
        {!imagesLoading && filteredImages.length > 0 && (
          <div className="rounded-md border overflow-auto max-h-[600px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                <tr className="border-b">
                  <th className="w-10 px-2 py-2">
                    <Checkbox
                      checked={selectedVisibleCount === filteredImages.length && filteredImages.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className="w-16 px-2 py-2 text-left">Preview</th>
                  <th className="px-2 py-2 text-left">Collection</th>
                  <th className="px-2 py-2 text-left">Item</th>
                  <th className="px-2 py-2 text-left">Field</th>
                  <th className="px-2 py-2 text-left min-w-[280px]">Current ALT</th>
                </tr>
              </thead>
              <tbody>
                {filteredImages.map(img => (
                  <ImageRow
                    key={img.id}
                    image={img}
                    selected={selectedIds.has(img.id)}
                    onToggleSelect={() => {
                      setSelectedIds(prev => {
                        const next = new Set(prev);
                        if (next.has(img.id)) next.delete(img.id); else next.add(img.id);
                        return next;
                      });
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!imagesLoading && filteredImages.length === 0 && images.length > 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No images match the current filters.
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {filteredImages.length} of {images.length} images
            {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
          </span>
          {hasMore && (
            <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={imagesLoading}>
              Load More
            </Button>
          )}
        </div>
      </CardContent>
      </Card>
    </div>
  );
}

// --- Row sub-component ---
function ImageRow({
  image,
  selected,
  onToggleSelect,
}: {
  image: CmsImageEntry;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const isMissing = image.isMissingAlt;

  return (
    <tr className="border-b hover:bg-accent/30 transition-colors">
      <td className="px-2 py-1.5 text-center">
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
      </td>
      <td className="px-2 py-1.5">
        <a href={image.imageUrl} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.imageUrl}
            alt={image.currentAlt || 'CMS image'}
            className="h-10 w-10 rounded object-cover border"
            loading="lazy"
          />
        </a>
      </td>
      <td className="px-2 py-1.5">
        <span className="text-xs text-muted-foreground">{image.collectionName}</span>
      </td>
      <td className="px-2 py-1.5">
        <span className="text-xs font-medium truncate max-w-[150px] block">{image.itemName}</span>
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          {image.fieldType === 'RichText' ? (
            <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ImageIcon className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
          <span className="text-xs">{image.fieldDisplayName}</span>
        </div>
      </td>
      <td className="px-2 py-1.5">
        {isMissing ? (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
            missing
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground line-clamp-2 max-w-[400px]">
            {image.currentAlt}
          </span>
        )}
      </td>
    </tr>
  );
}
