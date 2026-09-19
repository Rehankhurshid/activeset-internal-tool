'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, ArrowRight, Check, CircleDashed, Copy, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AuditFindings, FixGroup, FixGroupId } from '../../../domain/audit-findings';
import { relativeTime } from './relative-time';

/**
 * The one header for the whole audit screen. It answers "can this ship" with
 * the only thing that actually blocks — placeholder copy — named and linked,
 * and then shows every open finding rolled up by what someone would do about
 * it. The three tabs below read from this same roll-up, so the numbers agree.
 */

export interface AuditTotals {
  pages: number;
  scanned: number;
  scannedToday: number;
  lastScanAt: string | null;
}

export type FixTarget = 'alt' | 'links';

const GROUP_COPY: Record<FixGroupId, { label: string; target: FixTarget; hint?: string }> = {
  alt_shared: { label: 'Template images need alt text', target: 'alt', hint: 'One image, many pages' },
  alt_single: { label: 'Page images need alt text', target: 'alt' },
  alt_decorative_likely: { label: 'Probably decorative — confirm', target: 'alt', hint: 'Jev thinks an empty alt is right' },
  links_shared: { label: 'Dead links in nav or footer', target: 'links', hint: 'Same link, many pages' },
  links_single: { label: 'Dead links in page copy', target: 'links' },
  links_unverifiable: { label: "Links we couldn't verify", target: 'links', hint: 'Bot-blocked; check by hand' },
};

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export interface AuditHeaderProps {
  findings: AuditFindings;
  rollup: FixGroup[];
  totals: AuditTotals;
  onShowBlocked: () => void;
  onShowFailed: () => void;
  onOpenTab: (target: FixTarget) => void;
  onCopyFixList: () => void;
  /** The scan controls, supplied by the screen so scan state stays in one place. */
  actions?: ReactNode;
}

export function AuditHeader({
  findings,
  rollup,
  totals,
  onShowBlocked,
  onShowFailed,
  onOpenTab,
  onCopyFixList,
  actions,
}: AuditHeaderProps) {
  const blocked = findings.blocked.length;
  const failed = findings.failed.length;
  const openFixes = rollup
    .filter((g) => g.id !== 'links_unverifiable' && g.id !== 'alt_decorative_likely')
    .reduce((n, g) => n + g.fixes, 0);

  let tone: 'red' | 'amber' | 'green' | 'neutral';
  let headline: string;
  let detail: ReactNode = null;

  if (totals.scanned === 0) {
    tone = 'neutral';
    headline = 'Not scanned yet';
    detail = 'Run a scan to find out whether this site is ready.';
  } else if (blocked > 0) {
    tone = 'red';
    headline = `No — ${plural(blocked, 'page has', 'pages have')} placeholder copy`;
    detail = (
      <span className="inline-flex flex-wrap items-center gap-x-1">
        <span className="truncate max-w-[60vw] sm:max-w-md">
          {findings.blocked.map((p) => p.title).slice(0, 2).join(', ')}
          {blocked > 2 ? ` and ${blocked - 2} more` : ''}
        </span>
      </span>
    );
  } else if (openFixes > 0) {
    tone = 'amber';
    headline = `Nearly — ${plural(openFixes, 'fix')} open, none blocks launch`;
  } else {
    tone = 'green';
    headline = 'Yes — nothing open';
  }

  const toneClass = {
    red: 'border-red-500/40 bg-red-500/5 text-red-700 dark:text-red-400',
    amber: 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400',
    green: 'border-green-500/40 bg-green-500/5 text-green-700 dark:text-green-400',
    neutral: 'border-border bg-muted/30 text-muted-foreground',
  }[tone];
  const Icon = { red: AlertTriangle, amber: HelpCircle, green: Check, neutral: CircleDashed }[tone];

  return (
    <div className="space-y-3">
      <div className={cn('rounded-md border px-3 py-2.5', toneClass)}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 min-w-0">
            <Icon className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-5">
                <span className="text-foreground/70 font-normal">Ready to ship? </span>
                {headline}
              </p>
              {detail && <p className="text-xs opacity-80 mt-0.5">{detail}</p>}
              {failed > 0 && (
                <button
                  type="button"
                  onClick={onShowFailed}
                  className="text-xs underline-offset-2 hover:underline mt-0.5 opacity-80"
                >
                  {plural(failed, 'page')} could not be scanned
                </button>
              )}
            </div>
          </div>
          {blocked > 0 && (
            <Button size="sm" variant="outline" className="h-8 shrink-0 self-start sm:self-auto" onClick={onShowBlocked}>
              Show {blocked === 1 ? 'it' : 'them'}
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground tabular-nums">
          {plural(totals.pages, 'page')} · {totals.scanned} scanned
          {totals.scannedToday > 0 ? ` · ${totals.scannedToday} today` : ''} · last scan{' '}
          {relativeTime(totals.lastScanAt)}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {rollup.length > 0 && (
            <Button size="sm" variant="ghost" className="h-8" onClick={onCopyFixList}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy fix list
            </Button>
          )}
          {actions}
        </div>
      </div>

      {rollup.length > 0 && (
        <div className="rounded-md border overflow-hidden">
          <div className="hidden sm:grid grid-cols-[1fr_auto_auto] gap-x-6 px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40">
            <span>Fixes</span>
            <span className="text-right">Effort</span>
            <span className="text-right w-40">Clears</span>
          </div>
          <ul className="divide-y">
            {rollup.map((group) => {
              const copy = GROUP_COPY[group.id];
              const unverifiable = group.id === 'links_unverifiable';
              return (
                <li key={group.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTab(copy.target)}
                    className="w-full text-left px-3 py-2.5 hover:bg-muted/40 transition-colors grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-x-6 gap-y-1 items-center"
                  >
                    <span className="min-w-0">
                      <span className="text-sm font-medium block truncate">{copy.label}</span>
                      {copy.hint && <span className="text-xs text-muted-foreground block">{copy.hint}</span>}
                    </span>
                    <span className="text-sm tabular-nums sm:text-right">
                      {unverifiable ? <span className="text-muted-foreground">—</span> : plural(group.fixes, 'fix', 'fixes')}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums sm:text-right sm:w-40">
                      {unverifiable
                        ? `${plural(group.fixes, 'link')} on ${plural(group.pagesCleared, 'page')}`
                        : `${plural(group.pagesCleared, 'page')}${group.flagsCleared !== group.pagesCleared ? ` · ${plural(group.flagsCleared, 'flag')}` : ''}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
