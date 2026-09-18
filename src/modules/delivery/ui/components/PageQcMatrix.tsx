'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, SlidersHorizontal } from 'lucide-react';
import type { AuditResult } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { resolveCheck } from '../../domain/delivery.progress';
import type { CheckStatus, ProjectPage, StackCheck } from '../../domain/delivery.types';
import { CheckStatusControl, autoCheckIdOf } from './CheckStatusControl';
import { PageChecksEditor } from './PageChecksEditor';

/**
 * Per-page QC, as a list of pages rather than a grid.
 *
 * Twelve checks across sixty pages is seven hundred cells, and a grid that size
 * is unreadable on a laptop and unanswerable on anything else. What the team
 * actually does before a launch is work through the pages that are not clear
 * yet, so that is what this is: a row per page with its own numbers, opened one
 * at a time, and a filter that hides the pages already done.
 *
 * The questions themselves are the project's, not this component's: they arrive
 * as a prop (from `pageChecksFor`) and are edited here, because per-page QC is
 * the one delivery list the project checklist cannot hold — it has no page axis,
 * so it cannot ask one question of twenty-six pages.
 */

type PageFilter = 'all' | 'attention' | 'failing';

interface ResolvedCheck {
  check: StackCheck;
  status: CheckStatus;
  source: 'person' | 'scan' | 'none';
  /** What the scan says, independent of who answered. Kept so an override stays visible. */
  scanStatus?: CheckStatus;
}

interface PageSummary {
  page: ProjectPage;
  results: ResolvedCheck[];
  passed: number;
  applicable: number;
  failed: number;
  pending: number;
  scanned: boolean;
}

/**
 * Checks in the order they are asked, with any scan signal the scanner does not
 * actually compute dropped — otherwise the row would claim to be automatic and
 * then never be answered by anything.
 */
function normaliseChecks(checks: StackCheck[]): StackCheck[] {
  return [...checks]
    .sort((a, b) => a.order - b.order)
    .map((check) => ({ ...check, auto: autoCheckIdOf(check) }));
}

function summarise(
  page: ProjectPage,
  checks: StackCheck[],
  audit: AuditResult | undefined,
): PageSummary {
  let passed = 0;
  let applicable = 0;
  let failed = 0;
  let pending = 0;

  const results = checks.map((check) => {
    const { status, source } = resolveCheck(check, page.qc?.[check.id], audit);
    // Ask the scan again with no manual answer, so a person's override still
    // shows what it overrode.
    const scanOnly = check.auto ? resolveCheck(check, undefined, audit) : undefined;
    const scanStatus =
      scanOnly && scanOnly.source === 'scan' ? scanOnly.status : undefined;

    if (status !== 'not_required') {
      applicable += 1;
      if (status === 'passed') passed += 1;
      else if (status === 'failed') failed += 1;
      else pending += 1;
    }
    return { check, status, source, scanStatus };
  });

  return { page, results, passed, applicable, failed, pending, scanned: Boolean(audit) };
}

function matchesFilter(summary: PageSummary, filter: PageFilter): boolean {
  if (filter === 'failing') return summary.failed > 0;
  if (filter === 'attention') return summary.failed > 0 || summary.pending > 0;
  return true;
}

/**
 * Checks under their group headings, groups in the order they first appear.
 *
 * The list is editable, so the groups are no longer guaranteed to be contiguous
 * — grouping properly here is what stops a reordered list printing the same
 * heading three times.
 */
function groupResults(results: ResolvedCheck[]): { name: string; results: ResolvedCheck[] }[] {
  const groups: { name: string; results: ResolvedCheck[] }[] = [];
  for (const result of results) {
    const name = result.check.group || 'Checks';
    const existing = groups.find((group) => group.name === name);
    if (existing) existing.results.push(result);
    else groups.push({ name, results: [result] });
  }
  return groups;
}

interface PageBlockProps {
  summary: PageSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (checkId: string, status: CheckStatus) => void;
  disabled?: boolean;
}

function PageBlock({ summary, open, onOpenChange, onChange, disabled }: PageBlockProps) {
  const { page, results } = summary;
  const groups = groupResults(results);

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="border-t first:border-t-0">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
        >
          <ChevronRight
            aria-hidden
            className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
          />
          <span className="truncate text-sm font-medium">{page.title || page.path}</span>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">{page.path}</span>
          <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
            {summary.passed}/{summary.applicable}
          </span>
          {summary.failed > 0 && (
            <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px] font-normal text-rose-600 dark:text-rose-300">
              {summary.failed} failing
            </Badge>
          )}
          {summary.pending > 0 && (
            <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px] font-normal text-muted-foreground">
              {summary.pending} unanswered
            </Badge>
          )}
          {!summary.scanned && (
            <Badge
              variant="outline"
              className="h-5 shrink-0 border-dashed px-1.5 text-[10px] font-normal text-muted-foreground"
            >
              not scanned
            </Badge>
          )}
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-t bg-muted/10">
          {groups.map((group) => (
            <div key={group.name}>
              <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.name}
              </p>
              {group.results.map((result) => {
                const excluded = result.status === 'not_required';
                return (
                  <div
                    key={result.check.id}
                    className="flex items-start justify-between gap-3 px-3 py-1.5 pl-6"
                  >
                    <div className="min-w-0 pt-1">
                      <p className={cn('text-sm leading-snug', excluded && 'text-muted-foreground line-through decoration-muted-foreground/50')}>
                        {result.check.title}
                      </p>
                      {result.check.note && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{result.check.note}</p>
                      )}
                    </div>
                    <CheckStatusControl
                      className="shrink-0"
                      label={`${page.title || page.path} — ${result.check.title}`}
                      value={result.status}
                      source={result.source}
                      scanStatus={result.scanStatus}
                      autoCheck={result.check.auto}
                      onChange={(status) => onChange(result.check.id, status)}
                      disabled={disabled}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export interface PageQcMatrixProps {
  /** Which project's checks are being edited when the editor is opened. */
  projectId: string;
  /**
   * This project's QC questions — `pageChecksFor(stack, delivery)`. The stack's
   * `defaultPageChecks` until the team saves their own list.
   */
  checks: StackCheck[];
  /** The stack's starting set, offered as "reset to the default". */
  defaultChecks: StackCheck[];
  /** The stack's name, for wording the reset, e.g. "Webflow". */
  stackName: string;
  /**
   * True once the project has its own saved list, i.e.
   * `Boolean(delivery?.pageChecks?.length)`. Only wording depends on it.
   */
  checksAreSaved?: boolean;
  pages: ProjectPage[];
  /** Page id → the latest scan for that page, where one exists. */
  auditsByPageId: Record<string, AuditResult | undefined>;
  onChange: (pageId: string, checkId: string, status: CheckStatus) => void;
  /**
   * The list that was just saved. Optional: the project document is the source
   * of truth, and this only lets a screen show the new list before Firestore
   * echoes it back.
   */
  onChecksSaved?: (checks: StackCheck[]) => void;
  disabled?: boolean;
  className?: string;
}

export function PageQcMatrix({
  projectId,
  checks,
  defaultChecks,
  stackName,
  checksAreSaved,
  pages,
  auditsByPageId,
  onChange,
  onChecksSaved,
  disabled,
  className,
}: PageQcMatrixProps) {
  const [filter, setFilter] = useState<PageFilter>('all');
  const [openPageIds, setOpenPageIds] = useState<string[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);

  const pageChecks = useMemo(() => normaliseChecks(checks), [checks]);
  const stackDefaults = useMemo(() => normaliseChecks(defaultChecks), [defaultChecks]);

  const summaries = useMemo(
    () => pages.map((page) => summarise(page, pageChecks, auditsByPageId[page.id])),
    [pages, pageChecks, auditsByPageId],
  );

  // How many pages carry an answer for each check, including checks no longer on
  // the list. The editor warns with these numbers before anything is removed.
  const answeredCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const page of pages) {
      for (const [checkId, status] of Object.entries(page.qc ?? {})) {
        if (!status || status === 'pending') continue;
        counts[checkId] = (counts[checkId] ?? 0) + 1;
      }
    }
    return counts;
  }, [pages]);

  const counts = useMemo(
    () => ({
      all: summaries.length,
      attention: summaries.filter((s) => matchesFilter(s, 'attention')).length,
      failing: summaries.filter((s) => matchesFilter(s, 'failing')).length,
    }),
    [summaries],
  );

  const visible = summaries.filter((summary) => matchesFilter(summary, filter));
  const anyScanned = summaries.some((summary) => summary.scanned);
  const hasAutoChecks = pageChecks.some((check) => check.auto);

  const setOpen = (pageId: string, open: boolean) => {
    setOpenPageIds((prev) => (open ? [...prev, pageId] : prev.filter((id) => id !== pageId)));
  };
  const allVisibleOpen = visible.length > 0 && visible.every((s) => openPageIds.includes(s.page.id));

  const filters: { value: PageFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All pages', count: counts.all },
    { value: 'attention', label: 'Needs attention', count: counts.attention },
    { value: 'failing', label: 'Failing', count: counts.failing },
  ];

  return (
    <Card className={cn('gap-3 py-4', className)}>
      <CardHeader className="px-4">
        <CardTitle className="text-sm">Page checks</CardTitle>
        <CardDescription className="text-xs">
          {pageChecks.length} {pageChecks.length === 1 ? 'question' : 'questions'} asked of every page.
          Open a page to answer its checks.
        </CardDescription>
        <CardAction>
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            className="flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            <SlidersHorizontal className="size-3.5" />
            Edit checks
          </button>
        </CardAction>
      </CardHeader>

      <CardContent className="px-4">
        {pageChecks.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center">
            <p className="text-sm font-medium">No page checks on this project</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Every page counts as answered, so per-page QC gates nothing. Add the questions this
              build should ask, or reset to the {stackName} starting set, under Edit checks.
            </p>
          </div>
        ) : pages.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center">
            <p className="text-sm font-medium">No pages on the tracker yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add the pages you are building on the Pages tab — import them from the sitemap scan
              rather than typing them again. Per-page QC starts from that list.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="Filter pages"
                className="inline-flex h-8 items-center rounded-md border bg-background p-0.5"
              >
                {filters.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={filter === option.value}
                    onClick={() => setFilter(option.value)}
                    className={cn(
                      'h-7 rounded-[5px] px-2 text-xs font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      filter === option.value
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    {option.label}
                    <span className="ml-1 tabular-nums text-muted-foreground">{option.count}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  setOpenPageIds(allVisibleOpen ? [] : visible.map((summary) => summary.page.id))
                }
                disabled={visible.length === 0}
                className="h-8 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                {allVisibleOpen ? 'Collapse all' : 'Expand all'}
              </button>
            </div>

            {hasAutoChecks && !anyScanned && (
              <p className="mb-3 rounded-md border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                No scan data for these pages yet. The checks a scan can answer — titles, meta
                descriptions, alt text, broken links — will fill themselves in after the next scan.
                You can answer them by hand in the meantime; a person&rsquo;s answer always wins.
              </p>
            )}

            <div className="rounded-md border">
              {visible.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {filter === 'failing'
                    ? 'No page has a failing check.'
                    : 'Every page is answered and passing.'}
                </p>
              ) : (
                visible.map((summary) => (
                  <PageBlock
                    key={summary.page.id}
                    summary={summary}
                    open={openPageIds.includes(summary.page.id)}
                    onOpenChange={(open) => setOpen(summary.page.id, open)}
                    onChange={(checkId, status) => onChange(summary.page.id, checkId, status)}
                    disabled={disabled}
                  />
                ))
              )}
            </div>
          </>
        )}
      </CardContent>

      <PageChecksEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        projectId={projectId}
        checks={pageChecks}
        defaultChecks={stackDefaults}
        stackName={stackName}
        saved={Boolean(checksAreSaved)}
        answeredCounts={answeredCounts}
        onSaved={onChecksSaved}
      />
    </Card>
  );
}
