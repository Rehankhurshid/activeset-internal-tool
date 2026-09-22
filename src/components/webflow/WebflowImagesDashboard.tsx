'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  ImageIcon,
  Loader2,
  RefreshCw,
  Wand2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useCmsImages } from '@/hooks/useCmsImages';
import { useWebflowAssets } from '@/hooks/useWebflowAssets';
import { formatBytes } from '@/modules/site-monitoring/domain/image-budget';
import { imageFingerprint } from '@/modules/site-monitoring/domain/audit-findings';
import { cmsSourceAssetIds } from '@/modules/site-monitoring/domain/webflow-assets';
import {
  isConfidentDraft,
  useLibraryOptimise,
  type LibraryGroupRef,
  type LibraryOptimise,
} from '@/modules/site-monitoring/ui/hooks/useLibraryOptimise';
import type { WorkerJobDoc } from '@/modules/site-monitoring/infrastructure/worker.repository';
import type { CmsImageEntry, WebflowConfig } from '@/types/webflow';

/**
 * A site's Webflow images, one section per group, one button per section.
 *
 * General assets first, then each CMS collection. Every section says how many
 * images it has and how many are missing ALT, and its Optimise button does
 * everything for that group in one go: describes what is missing, writes the
 * ALT it is sure of, holds the rest for a person, and optimises the images —
 * swapped in place for CMS, a ready-made copy for Designer where Webflow does
 * not allow a swap. "Optimise everything" runs every section.
 *
 * It replaced a flat list of every image on the site with checkboxes, two
 * action buttons and a filter menu — 1,653 rows on PeakXV — which Rehan
 * called complicated, and which was: the question is per group, so the
 * screen is too. Rows are there when you open a section, for the few drafts
 * that need a look.
 */

interface WebflowImagesDashboardProps {
  projectId: string;
  projectName?: string;
  userEmail?: string;
  webflowConfig: WebflowConfig;
}

interface GroupRow {
  ref: LibraryGroupRef;
  key: string;
  name: string;
  isCms: boolean;
  /** Undefined while still loading. */
  rows?: ImageRow[];
}

interface ImageRow {
  id: string;
  src: string;
  fingerprint: string;
  title: string;
  subtitle?: string;
  currentAlt: string;
  missing: boolean;
}

/** Webflow marks an inherited-but-unset alt with this sentinel. */
const BLANK_ALTS = new Set(['', '__wf_reserved_inherit']);
const isBlank = (value: string | null | undefined) => BLANK_ALTS.has((value ?? '').trim());

/** Measured on Goliath: roughly ten seconds to describe one image. */
const SECONDS_PER_IMAGE = 10;
const PAGE = 100;

type Phase = 'describing' | 'optimising';
const PHASE_LABEL: Record<Phase, string> = { describing: 'Reading', optimising: 'Shrinking' };

/**
 * The image the worker is on, animated by what is happening to it: a scan
 * line while it is being described, a squeeze while it is being shrunk. A
 * progress bar says how far through a run is; this says which image, which is
 * what someone watching actually wants to know.
 */
function WorkingThumb({ src, phase, size }: { src: string; phase: Phase; size: 'sm' | 'md' }) {
  return (
    <span
      className={`relative shrink-0 overflow-hidden rounded border border-primary/60 bg-background ${
        size === 'sm' ? 'h-7 w-7' : 'h-10 w-10'
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className={`h-full w-full object-cover ${phase === 'optimising' ? 'animate-image-squeeze' : ''}`}
      />
      {phase === 'describing' && (
        <span className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-transparent via-primary/70 to-transparent animate-image-scan" />
      )}
    </span>
  );
}

/** One row per distinct image — the same image in five fields is one image. */
function toRows(entries: CmsImageEntry[]): ImageRow[] {
  const byFingerprint = new Map<string, ImageRow>();
  for (const entry of entries) {
    const fingerprint = imageFingerprint(entry.imageUrl);
    const existing = byFingerprint.get(fingerprint);
    if (existing) {
      if (entry.isMissingAlt) existing.missing = true;
      continue;
    }
    byFingerprint.set(fingerprint, {
      id: entry.id,
      src: entry.imageUrl,
      fingerprint,
      title: entry.itemName,
      subtitle: entry.fieldDisplayName,
      currentAlt: entry.currentAlt ?? '',
      missing: entry.isMissingAlt,
    });
  }
  return [...byFingerprint.values()];
}

function duration(seconds: number): string {
  if (seconds < 90) return 'about a minute';
  if (seconds < 3600) return `about ${Math.round(seconds / 60)} min`;
  const hours = seconds / 3600;
  return `about ${hours < 10 ? hours.toFixed(1).replace(/\.0$/, '') : Math.round(hours)} h`;
}

function ago(iso?: string): string {
  if (!iso) return '';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / (60 * 24))} d ago`;
}

/** One line on what the last run of a group did. */
function resultLine(job: WorkerJobDoc): { ok: boolean; text: string } {
  if (job.status === 'failed') return { ok: false, text: `Failed ${ago(job.finishedAt)}: ${job.error ?? 'no reason recorded'}` };
  const r = job.result as
    | {
        alt?: { added?: number; held?: number; decorative?: number; failed?: number };
        optimise?: { optimised?: number; resized?: number; designerCopies?: number; bytesSaved?: number };
        errors?: string[];
      }
    | undefined;
  if (!r) return { ok: true, text: `Done ${ago(job.finishedAt)}` };
  const parts = [
    `${r.alt?.added ?? 0} ALT added`,
    r.alt?.decorative ? `${r.alt.decorative} marked decorative` : '',
    r.alt?.held ? `${r.alt.held} to review` : '',
    r.optimise
      ? r.optimise.optimised || r.optimise.designerCopies
        ? [
            r.optimise.optimised ? `${r.optimise.optimised} images optimised` : '',
            r.optimise.designerCopies ? `${r.optimise.designerCopies} copies ready for Designer` : '',
            r.optimise.bytesSaved ? `${formatBytes(r.optimise.bytesSaved)} saved` : '',
          ]
            .filter(Boolean)
            .join(' · ')
        : 'images already optimal'
      : '',
  ].filter(Boolean);
  const errors = r.errors?.length ? ` — ${r.errors.join('; ')}` : '';
  return { ok: !r.errors?.length, text: `Done ${ago(job.finishedAt)} · ${parts.join(' · ')}${errors}` };
}

export function WebflowImagesDashboard({ projectId, projectName, userEmail, webflowConfig }: WebflowImagesDashboardProps) {
  const assetsHook = useWebflowAssets(projectId, webflowConfig);
  const cms = useCmsImages(projectId, webflowConfig);
  const library = useLibraryOptimise(projectId, projectName, userEmail ?? 'team');
  const [publish, setPublish] = useState(false);

  // ── what is there ──────────────────────────────────────────────────────────
  // Each collection's images, keyed by collection, filled in as they arrive so
  // the counts appear section by section rather than all at the end.
  const [cmsRows, setCmsRows] = useState<Record<string, ImageRow[]>>({});

  const loadCollection = useCallback(
    async (collectionId: string) => {
      try {
        const rows = toRows(await cms.loadCollectionImages(collectionId));
        setCmsRows((previous) => ({ ...previous, [collectionId]: rows }));
      } catch {
        toast.error('Could not load one of the CMS collections');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId],
  );

  const load = useCallback(async () => {
    setCmsRows({});
    await Promise.all([
      assetsHook.fetchAssets('all').catch(() => toast.error('Could not load the asset library')),
      cms.discoverCollections().catch(() => toast.error('Could not list the CMS collections')),
    ]);
    // These hooks re-create their functions each render; load once per project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (webflowConfig.hasApiToken) void load();
  }, [load, webflowConfig.hasApiToken]);

  // One collection at a time: sequential is kinder to Webflow's rate limit
  // than twelve at once, and the first sections fill in within seconds.
  const collectionIds = cms.collections.map((collection) => collection.id).join(',');
  useEffect(() => {
    if (!collectionIds) return;
    let cancelled = false;
    (async () => {
      for (const id of collectionIds.split(',')) {
        if (cancelled) return;
        await loadCollection(id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [collectionIds, loadCollection]);

  const allCmsLoaded = cms.collections.length > 0 && cms.collections.every((collection) => cmsRows[collection.id]);

  // Site assets that are only the upload behind a CMS image — their alt is on
  // the CMS field, so they are not "general" and not missing anything.
  const sourceIds = useMemo(
    () => cmsSourceAssetIds(Object.values(cmsRows).flatMap((rows) => rows.map((row) => row.src))),
    [cmsRows],
  );

  const assetRows = useMemo<ImageRow[]>(
    () =>
      assetsHook.assets
        // A library holds PDFs, videos and fonts too; they are not pictures.
        .filter((asset) => asset.hostedUrl && asset.contentType?.startsWith('image/'))
        .filter((asset) => !sourceIds.has(asset.id.toLowerCase()))
        .map((asset) => ({
          id: asset.id,
          src: asset.hostedUrl,
          fingerprint: imageFingerprint(asset.hostedUrl),
          title: asset.displayName || asset.originalFileName,
          currentAlt: asset.altText ?? '',
          missing: isBlank(asset.altText),
        })),
    [assetsHook.assets, sourceIds],
  );

  // General assets can only be counted once every collection is in, because
  // until then some of them may yet turn out to be CMS uploads.
  const generalReady = !assetsHook.loading && (allCmsLoaded || (cms.collections.length === 0 && !cms.discoveryLoading));

  const groups = useMemo<GroupRow[]>(
    () => [
      {
        ref: { kind: 'assets' },
        key: 'assets',
        name: 'General assets',
        isCms: false,
        rows: generalReady ? assetRows : undefined,
      },
      ...cms.collections.map((collection) => ({
        ref: { kind: 'collection' as const, collectionId: collection.id, name: collection.displayName },
        key: collection.id,
        name: collection.displayName,
        isCms: true,
        rows: cmsRows[collection.id],
      })),
    ],
    [assetRows, generalReady, cms.collections, cmsRows],
  );

  // When a group's run finishes, re-read that group so its counts are current.
  const seenFinished = useRef(new Set<string>());
  useEffect(() => {
    for (const group of groups) {
      const last = library.lastFor(group.key);
      if (!last || seenFinished.current.has(last.id)) continue;
      seenFinished.current.add(last.id);
      const fresh = last.finishedAt && Date.now() - new Date(last.finishedAt).getTime() < 5 * 60_000;
      if (!fresh) continue;
      if (group.isCms) void loadCollection(group.key);
      else void assetsHook.fetchAssets('all').catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, library]);

  const totals = useMemo(() => {
    const known = groups.filter((group) => group.rows);
    return {
      images: known.reduce((sum, group) => sum + group.rows!.length, 0),
      missing: known.reduce((sum, group) => sum + group.rows!.filter((row) => row.missing).length, 0),
      stillCounting: known.length < groups.length,
    };
  }, [groups]);

  const running = groups.filter((group) => library.activeFor(group.key));
  const loading = assetsHook.loading || cms.discoveryLoading;

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
      <CardHeader className="pb-3 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ImageIcon className="h-4 w-4" />
              Images
            </CardTitle>
            <CardDescription>
              {totals.images === 0 && loading
                ? 'Reading the asset library and CMS collections…'
                : `${totals.images} images · ${totals.missing} missing ALT${totals.stillCounting ? ' · still counting…' : ''}`}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            title="Reload from Webflow"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => library.optimise(groups.map((group) => group.ref), publish)}
            disabled={library.busy || groups.length === 0 || running.length === groups.length}
          >
            {library.busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
            Optimise everything
          </Button>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={publish} onCheckedChange={(value) => setPublish(value === true)} />
            Publish when done
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Adds ALT text where it’s missing and optimises the images. ALT the model isn’t sure of is held for you to
          check. Originals are backed up to Bunny first.
          {totals.missing > 0 &&
            ` Describing takes ${duration(totals.missing * SECONDS_PER_IMAGE)} for ${totals.missing} images — it runs in the background, so you can close this tab.`}
          {library.online.length === 0 && ' No worker is online right now; it starts when one is.'}
        </p>
      </CardHeader>

      <CardContent className="p-0">
        {groups.map((group) => (
          <GroupSection key={group.key} group={group} library={library} publish={publish} />
        ))}
      </CardContent>
    </Card>
  );
}

function GroupSection({
  group,
  library,
  publish,
}: {
  group: GroupRow;
  library: LibraryOptimise;
  publish: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const rows = group.rows;
  const loadingRows = rows === undefined;
  const images = rows?.length;
  const missing = rows?.filter((row) => row.missing).length;
  const active = library.activeFor(group.key);
  const last = library.lastFor(group.key);
  const outcome = last ? resultLine(last) : null;

  const current =
    active?.status === 'running' && active.currentSrc
      ? {
          src: active.currentSrc,
          fingerprint: imageFingerprint(active.currentSrc),
          phase: (active.currentPhase ?? 'describing') as Phase,
        }
      : null;
  const currentRow = current ? rows?.find((row) => row.fingerprint === current.fingerprint) : undefined;

  /** Open the section and bring the row being worked on into view. */
  const showCurrent = () => {
    if (!current || !rows) return;
    setOpen(true);
    setReviewOnly(false);
    const index = rows.findIndex((row) => row.fingerprint === current.fingerprint);
    if (index >= shown) setShown(index + PAGE);
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document
          .querySelector(`[data-fingerprint="${CSS.escape(current.fingerprint)}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      ),
    );
  };

  const needsLook = useCallback(
    (row: ImageRow) => {
      if (!row.missing) return false;
      const draft = library.draftFor(row.src);
      return !!draft && !isConfidentDraft(draft);
    },
    [library],
  );

  const reviewCount = rows ? rows.filter(needsLook).length : undefined;
  const visible = (rows ?? []).filter((row) => !reviewOnly || needsLook(row));

  return (
    <section className="border-t">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          {group.isCms ? (
            <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate font-medium">{group.name}</span>
          {group.isCms && (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
              CMS
            </Badge>
          )}
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {images === undefined ? 'counting…' : `${images} images · ${missing} missing ALT`}
            {reviewCount ? ` · ${reviewCount} to review` : ''}
          </span>
        </button>
        <Button
          size="sm"
          variant={active ? 'secondary' : 'outline'}
          disabled={!!active || library.busy || images === 0}
          onClick={() => library.optimise([group.ref], publish)}
        >
          {active ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
          {active ? (active.status === 'running' ? 'Working…' : 'Queued') : 'Optimise'}
        </Button>

        {active?.status === 'running' && (
          <div className="w-full space-y-1.5 pl-6">
            <Progress value={Math.round((active.fraction ?? 0) * 100)} className="h-1.5" />
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              {current && <WorkingThumb src={current.src} phase={current.phase} size="sm" />}
              <span className="min-w-0 truncate">
                {current ? (
                  <>
                    <span className="font-medium text-foreground">{PHASE_LABEL[current.phase]}</span>{' '}
                    {currentRow ? currentRow.title : 'an image'}
                    {currentRow?.subtitle ? ` · ${currentRow.subtitle}` : ''}
                    <span className="tabular-nums"> — {active.progress}</span>
                  </>
                ) : (
                  active.progress ?? 'Starting'
                )}
              </span>
              {currentRow && (
                <Button variant="link" size="sm" className="h-auto shrink-0 p-0 text-xs" onClick={showCurrent}>
                  Show
                </Button>
              )}
            </div>
          </div>
        )}
        {!active && outcome && (
          <p className={`w-full pl-6 text-xs flex items-start gap-1.5 ${outcome.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
            {outcome.ok ? (
              <CheckCircle2 className="h-3.5 w-3.5 mt-px shrink-0 text-green-600 dark:text-green-400" />
            ) : (
              <XCircle className="h-3.5 w-3.5 mt-px shrink-0" />
            )}
            {outcome.text}
          </p>
        )}
        {!group.isCms && images ? (
          <p className="w-full pl-6 text-[11px] text-muted-foreground">
            Webflow can’t swap a site asset’s file, so oversized ones get an optimised copy in the “ActiveSet ·
            optimised” folder — in Designer, select the image, Replace, and pick it.
          </p>
        ) : null}
      </div>

      {open && (
        <div className="border-t bg-muted/20">
          {loadingRows ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading {group.name}…
            </div>
          ) : (
            <>
              {!!reviewCount && (
                <div className="flex items-center gap-2 px-4 py-2 text-xs">
                  <Checkbox checked={reviewOnly} onCheckedChange={(value) => setReviewOnly(value === true)} />
                  Only the {reviewCount} the model wasn’t sure about
                </div>
              )}
              {visible.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">No images here.</p>
              ) : (
                <ul className="divide-y">
                  {visible.slice(0, shown).map((row) => (
                    <ImageLine
                      key={row.id}
                      row={row}
                      library={library}
                      needsLook={needsLook(row)}
                      working={current?.fingerprint === row.fingerprint ? current.phase : undefined}
                    />
                  ))}
                </ul>
              )}
              {visible.length > shown && (
                <div className="px-4 py-2 text-center">
                  <Button variant="ghost" size="sm" onClick={() => setShown((value) => value + PAGE)}>
                    Show {Math.min(PAGE, visible.length - shown)} more of {visible.length - shown}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function ImageLine({
  row,
  library,
  needsLook,
  working,
}: {
  row: ImageRow;
  library: LibraryOptimise;
  needsLook: boolean;
  /** Set while the worker is on this image. */
  working?: Phase;
}) {
  const draft = library.draftFor(row.src);
  const seed = row.missing ? (draft && draft.kind !== 'decorative' ? draft.alt : '') : row.currentAlt;
  const [value, setValue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const text = value ?? seed;
  const changed = text.trim() !== row.currentAlt.trim() && (value !== null || needsLook);

  return (
    <li
      data-fingerprint={row.fingerprint}
      className={`flex items-center gap-3 px-4 py-2 transition-colors ${
        working ? 'bg-primary/5 ring-1 ring-inset ring-primary/40' : ''
      }`}
    >
      {working ? (
        <WorkingThumb src={row.src} phase={working} size="md" />
      ) : (
        <a
          href={row.src}
          target="_blank"
          rel="noreferrer"
          className="h-10 w-10 shrink-0 overflow-hidden rounded border bg-background"
          title={row.src}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={row.src} alt="" loading="lazy" className="h-full w-full object-cover" />
        </a>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="truncate font-medium">{row.title}</span>
          {row.subtitle && <span className="truncate text-muted-foreground">{row.subtitle}</span>}
          {working ? (
            <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              {PHASE_LABEL[working]}…
            </span>
          ) : (
            <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
              {!row.missing ? 'has ALT' : needsLook ? 'to review' : draft ? 'drafted' : 'missing'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={text}
            onChange={(event) => setValue(event.target.value)}
            placeholder={draft?.kind === 'decorative' ? 'Reads as decorative — leave empty' : 'No ALT text yet'}
            key={draft?.alt ?? 'empty'}
            className={`h-8 text-sm ${needsLook ? 'border-amber-500/50' : ''} ${draft && row.missing && value === null ? 'animate-in fade-in duration-700' : ''}`}
          />
          {changed && (
            <Button
              size="sm"
              className="h-8 shrink-0"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await library.saveAlt({ fingerprint: row.fingerprint, src: row.src, alt: text });
                  setValue(null);
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
