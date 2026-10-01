import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PortalAskView } from '../../domain/client-portal.types';
import { formatDay } from './portal-format';
import { todayIso } from './portal-states';
import { PortalSectionHeading } from './PortalSectionHeading';

interface PortalAsksProps {
  asks: PortalAskView[];
  /** Inputs from the project sheet already received: counted, not listed. */
  received?: number;
  now: Date;
}

const KIND_LABEL: Partial<Record<NonNullable<PortalAskView['kind']>, string>> = {
  decision: 'Decision',
  fill: 'In the project sheet',
};

/**
 * "What we need from you": overdue first, then by date. Renders nothing when
 * there are no open asks.
 *
 * Read-only by design: the portal is a status page, and the client replies in
 * the shared Slack channel that kickoff opens, or fills the sheet's
 * `[Fill this]` tabs. An inbox nobody watches is worse than none.
 */
export function PortalAsks({ asks, received, now }: PortalAsksProps) {
  if (asks.length === 0) return null;
  const today = todayIso(now);

  return (
    <section aria-labelledby="portal-asks-heading" className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <PortalSectionHeading id="portal-asks-heading">What we need from you</PortalSectionHeading>
        {received ? (
          <p className="text-sm text-muted-foreground">
            <span className="tabular-nums">{received}</span> already received, thank you
          </p>
        ) : null}
      </div>
      <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {asks.map((ask, index) => {
          const overdue = !!ask.dueDate && ask.dueDate < today;
          const due = ask.dueDate ? formatDay(ask.dueDate, now) : (ask.dueText ?? '');
          // "Decisions · Decision" says it twice: the section name is enough.
          const kindLabel = ask.kind && KIND_LABEL[ask.kind];
          const meta = [
            ask.group,
            kindLabel && !ask.group?.toLowerCase().includes(kindLabel.toLowerCase()) ? kindLabel : '',
            ask.owner ? `With ${ask.owner}` : '',
            ask.progress ? `${ask.progress.done} of ${ask.progress.total} filled` : '',
          ].filter(Boolean);
          return (
            <li key={ask.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                  overdue ? 'bg-rose-100 text-rose-900' : 'bg-amber-100 text-amber-900',
                )}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="sm:flex sm:items-baseline sm:justify-between sm:gap-4">
                  <p className="text-sm font-medium text-foreground">
                    {ask.url ? (
                      <a href={ask.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                        {ask.title}
                        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                      </a>
                    ) : (
                      ask.title
                    )}
                  </p>
                  {due && (
                    <p className={cn('mt-0.5 text-xs sm:mt-0 sm:shrink-0', overdue ? 'font-medium text-rose-700' : 'text-muted-foreground')}>
                      {overdue ? `Overdue, needed by ${due}` : ask.dueDate ? `Due ${due}` : due}
                    </p>
                  )}
                </div>
                {ask.why && <p className="text-xs text-muted-foreground">{ask.why}</p>}
                {meta.length > 0 && <p className="text-[11px] text-muted-foreground/80">{meta.join(' · ')}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
