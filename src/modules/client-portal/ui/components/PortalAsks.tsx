import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PortalAskView } from '../../domain/client-portal.types';
import { formatDay } from './portal-format';
import { PortalAskReplyButton } from './PortalReplyForm';
import { PortalSectionHeading } from './PortalSectionHeading';

interface PortalAsksProps {
  asks: PortalAskView[];
  now: Date;
  /** When false, no row offers a way to write back. */
  repliesOpen?: boolean;
}

/**
 * "What we need from you". Renders nothing when there are no open asks.
 *
 * Stays a server component: the only interactive part is the per-row "Reply",
 * which is a tiny client button that points the one reply form at this ask.
 */
export function PortalAsks({ asks, now, repliesOpen = false }: PortalAsksProps) {
  if (asks.length === 0) return null;

  // Answered rows keep their place in the list, so the numbering below counts
  // only what is still open — a client should never see "4." next to the one
  // thing they still owe us.
  let openIndex = 0;

  return (
    <section aria-labelledby="portal-asks-heading" className="space-y-5">
      <PortalSectionHeading id="portal-asks-heading">What we need from you</PortalSectionHeading>
      <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {asks.map((ask) => {
          const answered = Boolean(ask.answeredAt);
          const due = ask.dueDate ? formatDay(ask.dueDate, now) : '';
          const answeredOn = answered ? formatDay(ask.answeredAt, now) : '';
          if (!answered) openIndex += 1;

          return (
            <li
              key={ask.id}
              className={cn('flex items-start gap-3 px-4 py-3.5 sm:px-5', answered && 'opacity-60')}
            >
              {answered ? (
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-semibold text-amber-900"
                >
                  {openIndex}
                </span>
              )}

              <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:justify-between sm:gap-4">
                <p className="text-sm font-medium text-foreground">{ask.title}</p>
                <div className="mt-0.5 flex items-center gap-3 sm:mt-0 sm:shrink-0">
                  {answered ? (
                    <p className="text-xs text-muted-foreground">
                      {answeredOn ? `You answered on ${answeredOn}` : 'You answered'}
                    </p>
                  ) : (
                    <>
                      {due && <p className="text-xs text-muted-foreground">Due {due}</p>}
                      {repliesOpen && <PortalAskReplyButton askId={ask.id} askTitle={ask.title} />}
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
