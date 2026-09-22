'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, ImageIcon, Layers, Loader2, RefreshCw, Search, Send, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCmsImages } from '@/hooks/useCmsImages';
import { useWebflowAssets } from '@/hooks/useWebflowAssets';
import { imageFingerprint } from '@/modules/site-monitoring/domain/audit-findings';
import { useLibraryOptimise } from '@/modules/site-monitoring/ui/hooks/useLibraryOptimise';
import type { AltSuggestionDoc } from '@/modules/site-monitoring/infrastructure/alt-suggestions.repository';
import type { WebflowConfig } from '@/types/webflow';

/**
 * Every image in a site's Webflow library, in one list, with one button.
 *
 * This replaced two screens. "Image Assets" listed site assets, drafted alt on
 * the worker, and saved it from the browser. "CMS Images" listed collection
 * fields under a fake terminal that built a command for a CLI running Gemma
 * on a laptop — its own footer said "web preview only". The good alt path
 * existed for assets but not CMS; the good bytes path for CMS but not assets;
 * the two saves went through different doors.
 *
 * Now: one list with a source badge, one selection, and **Optimise**, which
 * queues one job doing everything safe — drafts alt for anything missing it,
 * and for CMS images resizes, archives, uploads and repoints. Drafts land in
 * the row for a person to read; **Apply ALT** pushes the ones they approve.
 * Bytes are applied unread because a backed-up, perceptually lossless file is
 * safe; a sentence an AI wrote about a client's photograph is not.
 *
 * Site assets get alt only. Webflow's API cannot replace an asset's bytes,
 * and the row says so rather than hiding it.
 */

interface WebflowImagesDashboardProps {
  projectId: string;
  projectName?: string;
  userEmail?: string;
  webflowConfig: WebflowConfig;
}

type Source = 'asset' | 'cms';
type View = 'all' | 'missing' | 'drafted' | 'cms' | 'assets';

interface LibraryImage {
  id: string;
  src: string;
  fingerprint: string;
  source: Source;
  title: string;
  subtitle: string;
  currentAlt: string;
  hasAlt: boolean;
  /** A CMS image that is also in the asset library. Repointable, so it is filed as CMS. */
  alsoAsset?: boolean;
}

/** Webflow marks an inherited-but-unset alt with this sentinel. */
const BLANK_ALTS = new Set(['', '__wf_reserved_inherit']);
const hasAlt = (value: string | null | undefined) => !BLANK_ALTS.has((value ?? '').trim());

const KIND_LABEL: Record<string, string> = {
  decorative: 'Decorative',
  informative: 'Informative',
  functional: 'Functional',
  text_image: 'Text in image',
  complex: 'Complex',
  logo: 'Logo',
  screenshot: 'Screenshot',
  portrait: 'Portrait',
  product: 'Product',
  icon: 'Icon',
};

/** What the alt box shows before anyone touches it. */
function seedFor(row: LibraryImage, draft: AltSuggestionDoc | undefined): string {
  if (row.hasAlt) return row.currentAlt;
  if (!draft || draft.kind === 'decorative') return '';
  return draft.alt;
}

export function WebflowImagesDashboard({ projectId, projectName, userEmail, webflowConfig }: WebflowImagesDashboardProps) {
  const assetsHook = useWebflowAssets(projectId, webflowConfig);
  const cms = useCmsImages(projectId, webflowConfig);
  const library = useLibraryOptimise(projectId, projectName, userEmail ?? 'team');

  const [cmsRequested, setCmsRequested] = useState(false);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Only what a person typed. The display value falls back to the seed. */
  const [boxes, setBoxes] = useState<Record<string, string>>({});
  const [publish, setPublish] = useState(false);

  // ── load both halves of the library ────────────────────────────────────────
  useEffect(() => {
    if (!webflowConfig.hasApiToken) return;
    assetsHook.fetchAssets('all').catch(() => toast.error('Could not load the asset library'));
    cms.discoverCollections().catch(() => toast.error('Could not list the CMS collections'));
    // Intentionally once per project: these hooks re-create their functions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, webflowConfig.hasApiToken]);

  useEffect(() => {
    if (cmsRequested || cms.collections.length === 0) return;
    setCmsRequested(true);
    cms.fetchAllImages(cms.collections.map((collection) => collection.id)).catch(() =>
      toast.error('Could not load the CMS images'),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cms.collections, cmsRequested]);

  const refresh = () => {
    setCmsRequested(false);
    assetsHook.fetchAssets('all').catch(() => undefined);
    cms.discoverCollections().catch(() => undefined);
  };

  // ── one list ───────────────────────────────────────────────────────────────
  const { rows, notImages } = useMemo(() => {
    const byFingerprint = new Map<string, LibraryImage>();
    let skipped = 0;

    // CMS first: an image in a collection field is the repointable one.
    for (const entry of cms.images) {
      const fingerprint = imageFingerprint(entry.imageUrl);
      if (!fingerprint || byFingerprint.has(fingerprint)) continue;
      byFingerprint.set(fingerprint, {
        id: entry.id,
        src: entry.imageUrl,
        fingerprint,
        source: 'cms',
        title: `${entry.collectionName} · ${entry.fieldDisplayName}`,
        subtitle: entry.itemName,
        currentAlt: entry.currentAlt ?? '',
        hasAlt: !entry.isMissingAlt,
      });
    }

    for (const asset of assetsHook.assets) {
      // A library holds PDFs, videos and fonts too. They have no alt and are
      // not pictures — the vision model failed on every one of them on Canopy.
      if (!asset.contentType?.startsWith('image/')) {
        skipped += 1;
        continue;
      }
      const fingerprint = imageFingerprint(asset.hostedUrl);
      if (!fingerprint) continue;
      const existing = byFingerprint.get(fingerprint);
      if (existing) {
        existing.alsoAsset = true;
        continue;
      }
      byFingerprint.set(fingerprint, {
        id: `asset:${asset.id}`,
        src: asset.hostedUrl,
        fingerprint,
        source: 'asset',
        title: asset.displayName || asset.originalFileName,
        subtitle: 'Site asset',
        currentAlt: asset.altText ?? '',
        hasAlt: hasAlt(asset.altText),
      });
    }

    return { rows: [...byFingerprint.values()], notImages: skipped };
  }, [cms.images, assetsHook.assets]);

  const displayValue = useCallback(
    (row: LibraryImage) => boxes[row.id] ?? seedFor(row, library.draftFor(row.src)),
    [boxes, library],
  );

  const statusOf = useCallback(
    (row: LibraryImage): 'edited' | 'has-alt' | 'drafted' | 'missing' => {
      const draft = library.draftFor(row.src);
      if (boxes[row.id] !== undefined && boxes[row.id] !== seedFor(row, draft)) return 'edited';
      if (row.hasAlt) return 'has-alt';
      if (draft) return 'drafted';
      return 'missing';
    },
    [boxes, library],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (view === 'missing' && row.hasAlt) return false;
      if (view === 'drafted' && statusOf(row) !== 'drafted') return false;
      if (view === 'cms' && row.source !== 'cms') return false;
      if (view === 'assets' && row.source !== 'asset') return false;
      if (q && !`${row.title} ${row.subtitle} ${row.src}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, view, query, statusOf]);

  const counts = useMemo(
    () => ({
      missing: rows.filter((row) => !row.hasAlt).length,
      cms: rows.filter((row) => row.source === 'cms').length,
      assets: rows.filter((row) => row.source === 'asset').length,
    }),
    [rows],
  );

  // ── selection ──────────────────────────────────────────────────────────────
  const selectedRows = useMemo(() => rows.filter((row) => selected.has(row.id)), [rows, selected]);
  const selection = useMemo(
    () => ({
      missing: selectedRows.filter((row) => !row.hasAlt).length,
      cms: selectedRows.filter((row) => row.source === 'cms').length,
      assets: selectedRows.filter((row) => row.source === 'asset').length,
    }),
    [selectedRows],
  );

  const toggle = (id: string, on: boolean) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const allVisibleSelected = visible.length > 0 && visible.every((row) => selected.has(row.id));

  // ── actions ────────────────────────────────────────────────────────────────
  const jobRunning = !!library.job;

  const optimise = () =>
    library.optimise(
      selectedRows.map((row) => row.src),
      { altScope: 'missing', publish },
    );

  /** Rows whose box differs from what Webflow has now — drafts approved as-is, or edited. */
  const approvable = useMemo(
    () =>
      selectedRows
        .map((row) => ({ row, alt: displayValue(row) }))
        .filter(({ row, alt }) => alt.trim() !== (row.currentAlt ?? '').trim()),
    [selectedRows, displayValue],
  );

  const applyAlt = () =>
    library.applyAlt(
      approvable.map(({ row, alt }) => ({ fingerprint: row.fingerprint, src: row.src, alt })),
      publish,
    );

  // ── last run summary ───────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const result = library.lastRun?.result as
      | {
          alt?: { drafted?: number; needsReview?: number; failed?: number };
          images?: { resized?: number; recompressedOnly?: number; repointed?: number; skipped?: unknown[]; failed?: unknown[] };
          imagesError?: string;
        }
      | undefined;
    if (!library.lastRun) return null;
    if (library.lastRun.status === 'failed') return `Last run failed: ${library.lastRun.error ?? 'no reason recorded'}`;
    if (!result) return null;
    const alt = result.alt ?? {};
    const images = result.images;
    const parts = [
      `ALT: ${alt.drafted ?? 0} drafted${alt.needsReview ? ` (${alt.needsReview} to review)` : ''}`,
      images
        ? `Images: ${images.resized ?? 0} resized, ${images.recompressedOnly ?? 0} re-encoded, ${images.repointed ?? 0} fields repointed` +
          (images.skipped?.length ? `, ${images.skipped.length} left alone` : '') +
          (images.failed?.length ? `, ${images.failed.length} failed` : '')
        : `Images: ${result.imagesError ?? 'not run'}`,
    ];
    return parts.join(' · ');
  }, [library.lastRun]);

  const loading = assetsHook.loading || cms.discoveryLoading || cms.imagesLoading;

  if (!webflowConfig.hasApiToken) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Add a Webflow API token to this project to see its images.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4" />
              Images
            </CardTitle>
            <CardDescription>
              {loading && rows.length === 0
                ? 'Reading the asset library and every CMS collection…'
                : `${rows.length} images · ${counts.missing} missing ALT · ${counts.cms} in CMS fields · ${counts.assets} site assets` +
                  (notImages ? ` · ${notImages} files that are not pictures` : '')}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading} title="Reload from Webflow">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, item or URL"
              className="h-9 pl-8"
            />
          </div>
          <Select value={view} onValueChange={(value) => setView(value as View)}>
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All images</SelectItem>
              <SelectItem value="missing">Missing ALT</SelectItem>
              <SelectItem value="drafted">Drafted, to review</SelectItem>
              <SelectItem value="cms">CMS fields</SelectItem>
              <SelectItem value="assets">Site assets</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setSelected((previous) => {
                const next = new Set(previous);
                for (const row of visible) {
                  if (allVisibleSelected) next.delete(row.id);
                  else next.add(row.id);
                }
                return next;
              })
            }
            disabled={visible.length === 0}
          >
            {allVisibleSelected ? 'Deselect all' : `Select all (${visible.length})`}
          </Button>
          {counts.missing > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelected(new Set(rows.filter((row) => !row.hasAlt).map((row) => row.id)))}
            >
              Select missing ({counts.missing})
            </Button>
          )}
          {selected.size > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear ({selected.size})
            </Button>
          )}
        </div>

        {/* The one action, and the one that follows it */}
        <div className="rounded-md border bg-muted/30 px-3 py-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={optimise} disabled={selected.size === 0 || jobRunning || library.busy}>
              {jobRunning || library.busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
              {library.job?.status === 'running'
                ? library.job.progress ?? 'Working…'
                : library.job
                  ? 'Queued'
                  : `Optimise ${selected.size || ''}`.trim()}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={applyAlt}
              disabled={approvable.length === 0 || jobRunning || library.busy}
              title="Write the ALT text in the boxes for the selected rows"
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Apply ALT {approvable.length > 0 ? `(${approvable.length})` : ''}
            </Button>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground ml-1">
              <Checkbox checked={publish} onCheckedChange={(value) => setPublish(value === true)} />
              Publish CMS items afterwards
            </label>
            <div className="flex-1" />
            <span className="text-[11px] text-muted-foreground">
              {library.online.length > 0 ? `Runs on ${library.online[0].workerId}` : 'No worker online — will wait in the queue'}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {selected.size === 0
              ? 'Select images, then Optimise: drafts ALT for any missing it, and resizes, backs up and repoints CMS images. Drafts appear in the rows for you to approve.'
              : `Will draft ALT for ${selection.missing} missing it` +
                (selection.cms ? ` · optimise ${selection.cms} CMS image${selection.cms === 1 ? '' : 's'}` : '') +
                (selection.assets ? ` · ${selection.assets} site asset${selection.assets === 1 ? '' : 's'} get ALT only (Webflow cannot replace an asset’s file)` : '')}
          </p>
          {summary && <p className="text-[11px] text-muted-foreground border-t pt-2">{summary}</p>}
        </div>

        {/* Rows */}
        {(assetsHook.error || cms.error) && (
          <p className="text-xs text-destructive">{assetsHook.error ?? cms.error}</p>
        )}
        {rows.length === 0 && loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading…
          </div>
        ) : visible.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Nothing matches that filter.</div>
        ) : (
          <ul className="divide-y rounded-md border">
            {visible.map((row) => {
              const draft = library.draftFor(row.src);
              const status = statusOf(row);
              return (
                <li key={row.id} className="flex items-start gap-3 px-3 py-2.5">
                  <Checkbox
                    className="mt-3"
                    checked={selected.has(row.id)}
                    onCheckedChange={(value) => toggle(row.id, value === true)}
                  />
                  <a
                    href={row.src}
                    target="_blank"
                    rel="noreferrer"
                    className="h-12 w-12 shrink-0 rounded border bg-muted/30 overflow-hidden flex items-center justify-center"
                    title={row.src}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={row.src} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </a>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium truncate">{row.title}</span>
                      <span className="text-xs text-muted-foreground truncate">{row.subtitle}</span>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 gap-1">
                        {row.source === 'cms' ? <Database className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
                        {row.source === 'cms' ? 'CMS' : 'Asset'}
                      </Badge>
                      {row.alsoAsset && <Badge variant="outline" className="text-[10px] h-4 px-1.5">also in assets</Badge>}
                      {draft && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                          {KIND_LABEL[draft.kind] ?? draft.kind}
                        </Badge>
                      )}
                      {draft?.needsReview && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-500/40 text-amber-700 dark:text-amber-400">
                          needs a look
                        </Badge>
                      )}
                      <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                        {status === 'edited' ? 'edited' : status === 'has-alt' ? 'has ALT' : status === 'drafted' ? 'drafted' : 'missing ALT'}
                      </span>
                    </div>
                    <Input
                      value={displayValue(row)}
                      onChange={(event) => setBoxes((previous) => ({ ...previous, [row.id]: event.target.value }))}
                      placeholder={draft?.kind === 'decorative' ? 'Reads as decorative — leave empty' : 'No ALT text yet'}
                      className="h-8 text-sm"
                    />
                    {draft?.kind === 'decorative' && !row.hasAlt && (
                      <p className="text-[11px] text-muted-foreground">
                        Reads as decorative — an empty alt is probably right. Apply writes it as empty.
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
