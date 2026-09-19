'use client';

import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  ShieldQuestion,
  Undo2,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { LinkFinding, UnverifiableLink } from '../../../domain/audit-findings';
import { FindingPages } from './FindingPages';
import { relativeTime } from './relative-time';

/**
 * Links, by destination. One row per dead URL with every page that points at
 * it, so a footer link on forty pages is one decision, not forty rows. Broken
 * and "couldn't verify" never share a list: a bot-block is not a dead link.
 *
 * Nothing here fixes a link in place — Webflow's API cannot change a link
 * target — so the actions are decide (ignore, with a reason), open the page,
 * and recheck.
 */

export interface LinksTabProps {
  broken: LinkFinding[];
  unverifiable: UnverifiableLink[];
  isReadOnly: boolean;
  onIgnore: (finding: LinkFinding, reason: string) => Promise<void>;
  onUndo: (finding: LinkFinding) => Promise<void>;
  /** Re-check every link on one page. */
  onRecheckPage: (pageId: string) => Promise<void>;
  recheckingPageIds: Set<string>;
  checkAll: {
    running: boolean;
    current: number;
    total: number;
    currentUrl?: string;
    start: () => void;
    cancel: () => void;
    disabled: boolean;
  };
  checkedPages: number;
  scannedPages: number;
}

function statusLabel(status: number, error?: string): string {
  if (status === 0) return error || 'unreachable';
  return String(status);
}

function mattersLine(matters?: number): { text: string; tone: string } | null {
  if (matters === undefined) return null;
  const pct = Math.round(matters * 100);
  if (matters >= 0.75) return { text: `Jev: visitors would click this (${pct}%)`, tone: 'text-red-600 dark:text-red-400' };
  if (matters <= 0.35) return { text: `Jev: rarely clicked (${pct}%)`, tone: 'text-muted-foreground' };
  return { text: `Jev unsure whether visitors click it (${pct}%)`, tone: 'text-amber-600 dark:text-amber-400' };
}

function IgnoreButton({ onIgnore }: { onIgnore: (reason: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-8">
          <X className="h-3.5 w-3.5 mr-1.5" />
          Ignore
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2">
        <p className="text-xs text-muted-foreground">Why is this fine as it is? Shown next to the link so nobody re-investigates.</p>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. page goes live next week" className="h-8 text-sm" autoFocus />
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            size="sm"
            className="h-8"
            disabled={!reason.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onIgnore(reason.trim());
                setOpen(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Ignore link
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LinkRow({
  finding,
  isReadOnly,
  onIgnore,
  onUndo,
  onRecheckPage,
  rechecking,
}: {
  finding: LinkFinding;
  isReadOnly: boolean;
  onIgnore: LinksTabProps['onIgnore'];
  onUndo: LinksTabProps['onUndo'];
  onRecheckPage: LinksTabProps['onRecheckPage'];
  rechecking: boolean;
}) {
  const jev = mattersLine(finding.matters);
  const first = finding.pages[0];
  const [busy, setBusy] = useState(false);
  const latestCheck = finding.pages.map((p) => p.checkedAt).filter(Boolean).sort().at(-1);

  return (
    <li className="px-3 py-3 sm:px-4 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
        <Badge variant={finding.state === 'open' ? 'destructive' : 'secondary'} className="h-5 px-1.5 text-[11px] tabular-nums shrink-0">
          {statusLabel(finding.status, finding.error)}
        </Badge>
        <a
          href={finding.href}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs truncate max-w-[70vw] sm:max-w-lg hover:underline"
          title={finding.href}
        >
          {finding.href}
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {finding.texts.length > 0 && (
          <span className="truncate max-w-[70vw] sm:max-w-md">
            “{finding.texts[0]}”{finding.texts.length > 1 ? ` +${finding.texts.length - 1} more` : ''}
          </span>
        )}
        <FindingPages pages={finding.pages} />
        {latestCheck && <span>checked {relativeTime(latestCheck)}</span>}
      </div>
      {jev && <p className={cn('text-xs', jev.tone)}>{jev.text}</p>}

      {finding.state === 'resolved' && finding.decision && (
        <p className="text-xs text-muted-foreground">
          Ignored by {finding.decision.by} {relativeTime(finding.decision.at)}
          {finding.decision.reason ? ` — “${finding.decision.reason}”` : ''}
        </p>
      )}

      {!isReadOnly && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {finding.state === 'open' ? (
            <>
              {first && (
                <Button size="sm" variant="outline" className="h-8" asChild>
                  <a href={first.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Open page
                  </a>
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={async () => {
                  await navigator.clipboard.writeText(finding.href);
                  toast.success('Link copied');
                }}
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copy
              </Button>
              {first && (
                <Button size="sm" variant="ghost" className="h-8" disabled={rechecking} onClick={() => onRecheckPage(first.pageId)}>
                  {rechecking ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                  Recheck
                </Button>
              )}
              <IgnoreButton onIgnore={(reason) => onIgnore(finding, reason)} />
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onUndo(finding);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Undo2 className="h-3 w-3 mr-1" />
              Undo
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function Section({
  title,
  count,
  hint,
  defaultOpen,
  children,
  action,
}: {
  title: string;
  count: number;
  hint?: string;
  defaultOpen: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <section className="border-t first:border-t-0">
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-muted/30">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 text-left min-w-0 flex-1">
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="text-sm font-medium">{title}</span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[11px] tabular-nums">{count}</Badge>
          {hint && <span className="text-xs text-muted-foreground hidden sm:inline truncate">{hint}</span>}
        </button>
        {action}
      </div>
      {open && <ul className="divide-y">{children}</ul>}
    </section>
  );
}

export function LinksTab(props: LinksTabProps) {
  const { broken, unverifiable, isReadOnly, checkAll, checkedPages, scannedPages } = props;
  const [query, setQuery] = useState('');
  const [recheckingUnverifiable, setRecheckingUnverifiable] = useState(false);

  const q = query.trim().toLowerCase();
  const match = (href: string, pages: { url: string; title: string }[], texts: string[] = []) =>
    !q || href.toLowerCase().includes(q) || texts.some((t) => t.toLowerCase().includes(q)) || pages.some((p) => p.url.toLowerCase().includes(q));

  const open = useMemo(() => broken.filter((f) => f.state === 'open' && match(f.href, f.pages, f.texts)), [broken, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const ignored = useMemo(() => broken.filter((f) => f.state === 'resolved' && match(f.href, f.pages, f.texts)), [broken, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const unverified = useMemo(() => unverifiable.filter((u) => match(u.href, u.pages)), [unverifiable, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const pagesTouched = new Set(open.flatMap((f) => f.pages.map((p) => p.pageId))).size;
  const unverifiablePageIds = useMemo(() => Array.from(new Set(unverifiable.flatMap((u) => u.pages.map((p) => p.pageId)))), [unverifiable]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-3 px-3 sm:px-4 border-b">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Links</CardTitle>
            <CardDescription>
              {open.length === 0
                ? `No dead links on the ${checkedPages} page${checkedPages === 1 ? '' : 's'} checked.`
                : `${open.length} dead link${open.length === 1 ? '' : 's'} on ${pagesTouched} page${pagesTouched === 1 ? '' : 's'}`}
              {checkedPages < scannedPages ? ` · ${scannedPages - checkedPages} scanned page${scannedPages - checkedPages === 1 ? '' : 's'} not link-checked yet` : ''}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by URL, text or page" className="h-8 pl-7 text-sm w-full sm:w-56" />
            </div>
            {!isReadOnly &&
              (checkAll.running ? (
                <Button size="sm" variant="outline" className="h-8" onClick={checkAll.cancel}>
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Stop
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="h-8" onClick={checkAll.start} disabled={checkAll.disabled}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Check all pages
                </Button>
              ))}
          </div>
        </div>
        {checkAll.running && (
          <div className="mt-3 space-y-1">
            <Progress value={checkAll.total > 0 ? Math.round((checkAll.current / checkAll.total) * 100) : 0} className="h-1.5" />
            <p className="text-xs text-muted-foreground tabular-nums truncate">
              {checkAll.current}/{checkAll.total} pages · keep this tab open{checkAll.currentUrl ? ` · ${checkAll.currentUrl}` : ''}
            </p>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {open.length + ignored.length + unverified.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {broken.length + unverifiable.length === 0 ? 'Nothing to decide here.' : 'Nothing matches that filter.'}
          </div>
        ) : (
          <>
            <Section title="Broken" count={open.length} hint="Links visitors would click first" defaultOpen>
              {open.map((f) => (
                <LinkRow
                  key={f.fingerprint}
                  finding={f}
                  isReadOnly={isReadOnly}
                  onIgnore={props.onIgnore}
                  onUndo={props.onUndo}
                  onRecheckPage={props.onRecheckPage}
                  rechecking={!!f.pages[0] && props.recheckingPageIds.has(f.pages[0].pageId)}
                />
              ))}
            </Section>
            <Section
              title="Couldn't verify"
              count={unverified.length}
              hint="Bot-blocked or rate-limited; not counted as broken"
              defaultOpen={false}
              action={
                !isReadOnly && unverifiablePageIds.length > 0 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    disabled={recheckingUnverifiable}
                    onClick={async () => {
                      setRecheckingUnverifiable(true);
                      try {
                        for (const pageId of unverifiablePageIds) await props.onRecheckPage(pageId);
                      } finally {
                        setRecheckingUnverifiable(false);
                      }
                    }}
                  >
                    {recheckingUnverifiable ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                    Recheck
                  </Button>
                ) : null
              }
            >
              {unverified.map((u) => (
                <li key={u.fingerprint} className="px-3 py-2.5 sm:px-4 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                    <Badge variant="outline" className="h-5 px-1.5 text-[11px] tabular-nums text-amber-700 dark:text-amber-400 border-amber-500/40 shrink-0">
                      <ShieldQuestion className="h-3 w-3 mr-1" />
                      {u.status}
                    </Badge>
                    <a href={u.href} target="_blank" rel="noreferrer" className="font-mono text-xs truncate max-w-[70vw] sm:max-w-lg hover:underline" title={u.href}>
                      {u.href}
                    </a>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{u.reason}</span>
                    <FindingPages pages={u.pages} />
                  </div>
                </li>
              ))}
            </Section>
            <Section title="Ignored" count={ignored.length} defaultOpen={false}>
              {ignored.map((f) => (
                <LinkRow
                  key={f.fingerprint}
                  finding={f}
                  isReadOnly={isReadOnly}
                  onIgnore={props.onIgnore}
                  onUndo={props.onUndo}
                  onRecheckPage={props.onRecheckPage}
                  rechecking={false}
                />
              ))}
            </Section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
