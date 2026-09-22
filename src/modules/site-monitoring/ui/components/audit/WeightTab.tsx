'use client';

import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Gauge,
  ImageIcon,
  Loader2,
  Search,
  ShieldQuestion,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { formatBytes } from '../../../domain/image-budget';
import { fileNameOf } from '../../../domain/audit-findings';
import type { WeightFindingDoc, WorkerDoc, WorkerJobDoc } from '../../../infrastructure/worker.repository';
import { relativeTime } from './relative-time';

/**
 * What every image weighs against what the page actually displays it at.
 *
 * The rule is one line: an image wants to be twice its display width, so it
 * is sharp on a retina screen and not a byte heavier. Everything above that
 * is download nobody sees; everything below is a soft image on every modern
 * laptop. Both are findings, and the second one matters as much as the first
 * — it is the one that makes a client's site look cheap.
 */

export interface WeightTabProps {
  findings: WeightFindingDoc[];
  isReadOnly: boolean;
  workers: WorkerDoc[];
  online: WorkerDoc[];
  activeJob?: WorkerJobDoc;
  lastRun?: WorkerJobDoc;
  onMeasure: () => Promise<void>;
}

function Thumb({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="h-12 w-12 shrink-0 rounded border bg-muted/30 overflow-hidden flex items-center justify-center"
      title={src}
    >
      {failed ? (
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      )}
    </a>
  );
}

function Row({ finding }: { finding: WeightFindingDoc }) {
  const saving = finding.optimisedBytes !== undefined
    ? Math.max(0, finding.bytes - finding.optimisedBytes)
    : finding.estimatedSaving;
  const after = finding.optimisedBytes ?? finding.estimatedBytes;
  const measured = finding.optimisedBytes !== undefined;

  return (
    <li className="px-3 py-2.5 sm:px-4">
      <div className="flex gap-3">
        <Thumb src={finding.src} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-xs truncate max-w-[55vw] sm:max-w-sm" title={finding.src}>
              {fileNameOf(finding.src)}
            </span>
            {finding.isBackground && (
              <Badge variant="outline" className="h-4 px-1.5 text-[10px]">CSS background</Badge>
            )}
            {finding.everyVisitorPays && finding.verdict === 'oversized' && (
              <Badge variant="outline" className="h-4 px-1.5 text-[10px] border-red-500/40 text-red-700 dark:text-red-400">
                no srcset
              </Badge>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Displays at <span className="tabular-nums text-foreground">{finding.renderedWidth}px</span>
            {finding.widestAt ? ` (widest on a ${finding.widestAt}px screen)` : ''} · file is{' '}
            <span className="tabular-nums text-foreground">{finding.intrinsicWidth}px</span>
            {finding.targetWidth > 0 && (
              <>
                {' '}· wants <span className="tabular-nums text-foreground">{finding.targetWidth}px</span>
              </>
            )}
          </p>

          {finding.verdict === 'oversized' && finding.worthDoing && (
            <p className="text-xs">
              <span className="tabular-nums">{formatBytes(finding.bytes)}</span>
              <span className="text-muted-foreground"> → </span>
              <span className="tabular-nums text-green-600 dark:text-green-400">{formatBytes(after)}</span>
              <span className="text-muted-foreground tabular-nums">
                {' '}saves {formatBytes(saving)}
                {measured ? '' : ' (estimated)'}
              </span>
            </p>
          )}

          {finding.verdict === 'undersized' && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Soft on a retina screen — it needs a {finding.targetWidth}px original, not a resize.
            </p>
          )}

          <p className="text-[11px] text-muted-foreground">
            {finding.pages.length === 1 ? 'on 1 page' : `on ${finding.pages.length} pages`}
            {finding.bytes > 0 ? ` · ${formatBytes(finding.bytes)}` : ''}
            {finding.optimisedPath ? ` · resized file: ${finding.optimisedPath}` : ''}
          </p>
        </div>
      </div>
    </li>
  );
}

function Section({
  title,
  count,
  hint,
  defaultOpen,
  children,
}: {
  title: string;
  count: number;
  hint?: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <section className="border-t first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 sm:px-4 py-2 bg-muted/30 text-left"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className="text-sm font-medium">{title}</span>
        <Badge variant="secondary" className="h-5 px-1.5 text-[11px] tabular-nums">{count}</Badge>
        {hint && <span className="text-xs text-muted-foreground hidden sm:inline truncate">{hint}</span>}
      </button>
      {open && <ul className="divide-y">{children}</ul>}
    </section>
  );
}

export function WeightTab({ findings, isReadOnly, online, activeJob, lastRun, onMeasure }: WeightTabProps) {
  const [query, setQuery] = useState('');
  const [queueing, setQueueing] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return findings;
    return findings.filter(
      (f) => f.src.toLowerCase().includes(q) || f.pages.some((page) => page.toLowerCase().includes(q)),
    );
  }, [findings, query]);

  const groups = useMemo(
    () => ({
      oversized: filtered.filter((f) => f.verdict === 'oversized' && f.worthDoing),
      marginal: filtered.filter((f) => f.verdict === 'oversized' && !f.worthDoing),
      undersized: filtered.filter((f) => f.verdict === 'undersized'),
      right: filtered.filter((f) => f.verdict === 'right'),
    }),
    [filtered],
  );

  const totalSaving = groups.oversized.reduce(
    (sum, f) => sum + (f.optimisedBytes !== undefined ? f.bytes - f.optimisedBytes : f.estimatedSaving),
    0,
  );

  const running = activeJob?.kind === 'image_budget' && activeJob.status === 'running';
  const queued = activeJob?.kind === 'image_budget' && activeJob.status === 'queued';

  const measure = async () => {
    setQueueing(true);
    try {
      await onMeasure();
    } finally {
      setQueueing(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-3 px-3 sm:px-4 border-b">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Image weight</CardTitle>
            <CardDescription>
              {findings.length === 0
                ? 'Not measured yet. Every image wants to be twice the width it is displayed at.'
                : groups.oversized.length === 0
                  ? `${findings.length} images measured — none are meaningfully oversized.`
                  : `${groups.oversized.length} oversized · ${formatBytes(totalSaving)} to save`}
              {lastRun?.finishedAt && findings.length > 0 && ` · measured ${relativeTime(lastRun.finishedAt)}`}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {findings.length > 0 && (
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by file or page"
                  className="h-8 pl-7 text-sm w-full sm:w-52"
                />
              </div>
            )}
            {!isReadOnly && (
              <Button size="sm" variant="outline" className="h-8" onClick={measure} disabled={queueing || running || queued}>
                {queueing || running || queued ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Gauge className="h-3.5 w-3.5 mr-1.5" />
                )}
                {running ? 'Measuring…' : queued ? 'Queued' : findings.length > 0 ? 'Measure again' : 'Measure sizes'}
              </Button>
            )}
          </div>
        </div>

        {(running || queued) && (
          <div className="mt-3 space-y-1">
            <Progress value={Math.round((activeJob?.fraction ?? 0) * 100)} className="h-1.5" />
            <p className="text-xs text-muted-foreground truncate">
              {queued
                ? online.length > 0
                  ? `Waiting for ${online[0].workerId}`
                  : 'Waiting for the worker machine to come online'
                : `${activeJob?.claimedBy ?? 'worker'}: ${activeJob?.progress ?? 'working'}`}
            </p>
          </div>
        )}

        {activeJob?.status === 'failed' && activeJob.kind === 'image_budget' && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">Last run failed: {activeJob.error}</p>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {findings.length === 0 ? (
          <div className="px-4 py-10 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Measuring opens each page in a real browser at three screen widths and reads how wide every
              image is actually drawn. That number is not in the HTML, so it is the only way to know.
            </p>
            {online.length === 0 && !isReadOnly && (
              <p className="text-xs text-muted-foreground">
                No worker machine is online. Start one with{' '}
                <code className="font-mono">npm run worker run</code> — the job will wait until it does.
              </p>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing matches that filter.</div>
        ) : (
          <>
            <Section
              title="Oversized"
              count={groups.oversized.length}
              hint="Biggest saving first"
              defaultOpen
            >
              {groups.oversized.map((f) => <Row key={f.id} finding={f} />)}
            </Section>
            <Section
              title="Too small for retina"
              count={groups.undersized.length}
              hint="Needs a better original, not a resize"
              defaultOpen
            >
              {groups.undersized.map((f) => <Row key={f.id} finding={f} />)}
            </Section>
            <Section
              title="Oversized, but not worth the churn"
              count={groups.marginal.length}
              hint="Under 30 KB to save"
              defaultOpen={false}
            >
              {groups.marginal.map((f) => <Row key={f.id} finding={f} />)}
            </Section>
            <Section title="Right size" count={groups.right.length} defaultOpen={false}>
              {groups.right.map((f) => <Row key={f.id} finding={f} />)}
            </Section>
          </>
        )}
      </CardContent>

      {groups.oversized.length > 0 && (
        <div className="border-t px-3 sm:px-4 py-2.5 flex flex-wrap items-center gap-2">
          <ShieldQuestion className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground flex-1 min-w-0">
            Webflow&apos;s API cannot replace an existing asset&apos;s file, so these are resized on the worker
            and left for you to drop into Designer.
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={async () => {
              const lines = groups.oversized.map(
                (f) =>
                  `${fileNameOf(f.src)} — displays at ${f.renderedWidth}px, file is ${f.intrinsicWidth}px, resize to ${f.targetWidth}px (saves ${formatBytes(f.optimisedBytes !== undefined ? f.bytes - f.optimisedBytes : f.estimatedSaving)})`,
              );
              await navigator.clipboard.writeText(
                `# Oversized images\n\n${lines.join('\n')}\n\nTotal saving: ${formatBytes(totalSaving)}\n`,
              );
              toast.success('Resize list copied');
            }}
          >
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copy list
          </Button>
        </div>
      )}
    </Card>
  );
}
