import type { PortalAskView } from '../../domain/client-portal.types';
import { formatDay } from './portal-format';
import { PortalSectionHeading } from './PortalSectionHeading';

interface PortalAsksProps {
  asks: PortalAskView[];
  now: Date;
}

/**
 * "What we need from you". Renders nothing when there are no open asks.
 *
 * Read-only by design: the portal is a status page, and the client replies in
 * the shared Slack channel that kickoff opens. An inbox nobody watches is worse
 * than none.
 */
export function PortalAsks({ asks, now }: PortalAsksProps) {
  if (asks.length === 0) return null;

  return (
    <section aria-labelledby="portal-asks-heading" className="space-y-5">
      <PortalSectionHeading id="portal-asks-heading">What we need from you</PortalSectionHeading>
      <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {asks.map((ask, index) => {
          const due = ask.dueDate ? formatDay(ask.dueDate, now) : '';
          return (
            <li key={ask.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-semibold text-amber-900"
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:justify-between sm:gap-4">
                <p className="text-sm font-medium text-foreground">{ask.title}</p>
                {due && <p className="mt-0.5 text-xs text-muted-foreground sm:mt-0 sm:shrink-0">Due {due}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
