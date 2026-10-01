'use client';

import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PortalWorkItemView, PortalWorkstreamView, WorkState } from '../../domain/client-portal.types';
import { formatDay } from './portal-format';
import { PortalSectionHeading } from './PortalSectionHeading';
import { WORK_STATE, WORK_STATE_ORDER } from './portal-states';

type Filter = 'all' | 'in_review' | 'in_progress' | 'done';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'in_review', label: 'Ready for your review' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'done', label: 'Done' },
];

function matches(item: PortalWorkItemView, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'done') return item.state === 'done' || item.state === 'not_needed';
  if (filter === 'in_progress') return item.state === 'in_progress' || item.state === 'changes' || item.state === 'blocked';
  return item.states.includes('in_review');
}

/** Done out of what counts, per track: "Design 4 of 9". */
function TrackBars({ stream }: { stream: PortalWorkstreamView }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
      {stream.tracks.map((track, t) => {
        const key = `${t}-${track}`;
        const states = stream.items.map((i) => i.states[t]).filter((s): s is WorkState => !!s && s !== 'not_needed');
        const total = states.length;
        const count = (s: WorkState) => states.filter((x) => x === s).length;
        if (total === 0) return null;
        return (
          <div key={key} className="min-w-0 space-y-1">
            <p className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-foreground">{track}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {count('done')} of {total}
              </span>
            </p>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              {(['done', 'in_review', 'changes', 'in_progress'] as WorkState[]).map((s) =>
                count(s) ? <span key={s} className={WORK_STATE[s].cell} style={{ width: `${(count(s) / total) * 100}%` }} /> : null,
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Stream({ stream, filter, now }: { stream: PortalWorkstreamView; filter: Filter; now: Date }) {
  const rows = stream.items.filter((item) => matches(item, filter));
  let lastGroup: string | undefined;
  const single = stream.tracks.length <= 1;

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">{stream.title}</h3>
        <p className="text-xs tabular-nums text-muted-foreground">
          {stream.items.filter((i) => i.state === 'done' || i.state === 'not_needed').length} of {stream.items.length} done
        </p>
      </div>
      {!single && <TrackBars stream={stream} />}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here matches this filter.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
          <table className="w-full min-w-[28rem] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th scope="col" className="pb-2 pr-3 text-left text-[11px] font-medium text-muted-foreground">
                  Item
                </th>
                {stream.tracks.map((track, t) => (
                  <th key={`${t}-${track}`} scope="col" className="w-16 px-1 pb-2 text-left text-[11px] font-medium text-muted-foreground">
                    {track}
                  </th>
                ))}
                <th scope="col" className="w-20 pb-2 pl-2 text-right text-[11px] font-medium text-muted-foreground">
                  Due
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const heading = item.group && item.group !== lastGroup ? item.group : null;
                lastGroup = item.group;
                return [
                  heading ? (
                    <tr key={`${item.id}-group`}>
                      <td colSpan={stream.tracks.length + 2} className="pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {heading}
                      </td>
                    </tr>
                  ) : null,
                  <tr key={item.id}>
                    <td className="border-t border-border py-2 pr-3 align-middle">
                      <span className="font-medium text-foreground">{item.title}</span>
                      {item.links.length > 0 && (
                        <span className="ml-2 inline-flex flex-wrap gap-x-2">
                          {item.links.map((link) => (
                            <a
                              key={link.id}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                            >
                              {link.title}
                              <ExternalLink aria-hidden="true" className="h-3 w-3" />
                            </a>
                          ))}
                        </span>
                      )}
                    </td>
                    {item.states.map((state, t) => (
                      <td key={t} className="border-t border-border px-1 py-2 align-middle">
                        {single ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
                            <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', WORK_STATE[state].dot)} />
                            {WORK_STATE[state].label}
                          </span>
                        ) : (
                          <span
                            title={`${stream.tracks[t]}: ${WORK_STATE[state].label}`}
                            className={cn('block h-4 rounded', WORK_STATE[state].cell)}
                          >
                            <span className="sr-only">
                              {stream.tracks[t]}: {WORK_STATE[state].label}
                            </span>
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="border-t border-border py-2 pl-2 text-right align-middle text-xs tabular-nums text-muted-foreground">
                      {item.targetDate ? formatDay(item.targetDate, now) : (item.targetText ?? '')}
                    </td>
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface PortalWorkProps {
  work: PortalWorkstreamView[];
  /** The projection's clock, as an ISO string so it crosses to the browser intact. */
  generatedAt: string;
}

/**
 * The work in the project sheet's trackers: every page, deliverable or
 * animation, where each stands on each track, and a filter for "what is
 * waiting on me". The one interactive section of the page besides approval.
 */
export function PortalWork({ work, generatedAt }: PortalWorkProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const now = useMemo(() => new Date(generatedAt), [generatedAt]);
  const counts = useMemo(() => {
    const items = work.flatMap((w) => w.items);
    return Object.fromEntries(FILTERS.map((f) => [f.id, items.filter((i) => matches(i, f.id)).length])) as Record<Filter, number>;
  }, [work]);
  const used = useMemo(() => new Set(work.flatMap((w) => w.items.flatMap((i) => i.states))), [work]);

  if (work.length === 0) return null;

  return (
    <section aria-labelledby="portal-work-heading" className="space-y-5">
      <div className="space-y-3">
        <PortalSectionHeading id="portal-work-heading">The work</PortalSectionHeading>
        <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              disabled={f.id !== 'all' && counts[f.id] === 0}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-40',
                filter === f.id
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-card text-foreground hover:border-foreground/40',
              )}
            >
              {f.label}
              <span className="ml-1 tabular-nums opacity-70">{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>
      {work.map((stream) => (
        <Stream key={stream.id} stream={stream} filter={filter} now={now} />
      ))}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="What the colours mean">
        {WORK_STATE_ORDER.filter((s) => used.has(s)).map((s) => (
          <li key={s} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cn('h-2.5 w-2.5 rounded-sm', WORK_STATE[s].cell)} />
            {WORK_STATE[s].label}
          </li>
        ))}
      </ul>
    </section>
  );
}
