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

type StatusFilter = 'all' | 'missing' | 'has-alt';
type FieldTypeFilter = 'all' | 'Image' | 'RichText';

interface CmsImagesDashboardProps {
  webflowConfig: WebflowConfig;
}

// ─── CLI command builders ───────────────────────────────────────────────────

function escapeCliArg(v: string): string {
  return v.replace(/"/g, '\\"');
}

interface CliCommandArgs {
  siteId: string;
  siteName?: string;
  apiToken?: string;
  collectionIds?: string[];
  missingOnly?: boolean;
  csvPath?: string;
  maxCompress?: number;
}

interface CliActions {
  ai: boolean;
  compress: boolean;
  publish: boolean;
}

function buildContextualCommand(args: CliCommandArgs, actions: CliActions, fields?: string[]): string {
  const parts = [`npx @activeset/cms-alt run --site ${args.siteId}`];
  if (args.apiToken) parts.push(`--token ${args.apiToken}`);
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

function RunTicker({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = Math.floor((now - startedAt) / 1000);
  const pulse = elapsed % 2 === 0 ? '●' : '○';
  return (
    <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1.5 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
      <span aria-hidden>{pulse}</span>
      <span>run dispatched · elapsed {fmtDuration(elapsed)}</span>
      <span className="ml-auto text-muted-foreground">
        watch your terminal · Ctrl+C to abort
      </span>
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

function ContextualCliBar({
  command,
  displayCommand,
  disabled,
  actions,
  onActionsChange,
  hint,
  plan,
}: {
  command: string;
  displayCommand?: string;
  disabled?: boolean;
  actions: CliActions;
  onActionsChange: (next: CliActions) => void;
  hint?: string;
  plan?: RunPlan;
}) {
  const [copied, setCopied] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    };
  }, []);

  const handleCopy = () => {
    if (disabled) return;
    navigator.clipboard.writeText(command);
    setCopied(true);
    setRunStartedAt(Date.now());
    toast.success('Command copied · paste into your terminal');
    if (copyResetRef.current) clearTimeout(copyResetRef.current);
    copyResetRef.current = setTimeout(() => setCopied(false), 1500);
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
          disabled={disabled}
          title="Copy command"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
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
      {runStartedAt != null && !disabled ? (
        <div className="flex items-center gap-2">
          <RunTicker startedAt={runStartedAt} />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[10px]"
            onClick={() => setRunStartedAt(null)}
          >
            reset
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const DEFAULT_ACTIONS: CliActions = { ai: true, compress: true, publish: false };

export function CmsImagesDashboard({ webflowConfig }: CmsImagesDashboardProps) {
  const {
    collections,
    discoveryLoading,
    discoverCollections,
    images,
    imagesLoading,
    hasMore,
    fetchImages,
    fetchAllImages,
    error,
    clearError,
    reset,
  } = useCmsImages(webflowConfig);

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
    apiToken: webflowConfig.apiToken,
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
  const cliDisplayCommand = webflowConfig.apiToken
    ? cliCommand.replace(`--token ${webflowConfig.apiToken}`, '--token ••••••••')
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
          disabled={cliDisabled}
          actions={actions}
          onActionsChange={setActions}
          plan={runPlan}
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
              <Button variant="ghost" size="sm" onClick={discoverCollections} disabled={discoveryLoading}>
                <RefreshCw className={`h-4 w-4 ${discoveryLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
          {error && (
            <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
              <Button variant="ghost" size="sm" className="ml-2 h-6" onClick={clearError}>Dismiss</Button>
            </div>
          )}
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
