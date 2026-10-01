import type { PortalChangeView } from '../../domain/client-portal.types';
import { formatDay } from './portal-format';
import { PortalSectionHeading } from './PortalSectionHeading';

const STATE: Record<PortalChangeView['state'], { label: string; className: string }> = {
  proposed: { label: 'Waiting for your approval', className: 'bg-amber-100 text-amber-900' },
  approved: { label: 'Approved', className: 'bg-emerald-50 text-emerald-800' },
  done: { label: 'Done', className: 'bg-emerald-600 text-white' },
  declined: { label: 'Not going ahead', className: 'bg-muted text-muted-foreground' },
};

/** "$350", "350 USD", "₹40,000" → a currency mark and an amount, when the cell is that simple. */
function parseAmount(raw: string | undefined): { mark: string; amount: number } | null {
  if (!raw) return null;
  const m = raw.trim().match(/^([^\d\s.,-]{0,3})\s*([\d,]+(?:\.\d+)?)\s*([A-Za-z]{3})?$/);
  if (!m) return null;
  const amount = Number(m[2].replace(/,/g, ''));
  if (!Number.isFinite(amount)) return null;
  return { mark: m[1] || (m[3] ? `${m[3].toUpperCase()} ` : ''), amount };
}

/** The approved total, when every approved estimate is a plain amount in the same currency. */
function approvedTotal(changes: PortalChangeView[]): string | null {
  const agreed = changes.filter((c) => c.state === 'approved' || c.state === 'done');
  if (agreed.length === 0) return null;
  const amounts = agreed.map((c) => parseAmount(c.estimate));
  if (amounts.some((a) => a === null)) return null;
  const marks = new Set(amounts.map((a) => a!.mark));
  if (marks.size !== 1) return null;
  const total = amounts.reduce((n, a) => n + a!.amount, 0);
  return `${[...marks][0]}${total.toLocaleString('en-US')}`;
}

/** Work outside the signed scope: what was asked for, what it costs, and whether it is agreed. */
export function PortalChanges({ changes, now }: { changes?: PortalChangeView[]; now: Date }) {
  if (!changes?.length) return null;
  const total = approvedTotal(changes);
  return (
    <section aria-labelledby="portal-changes-heading" className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <PortalSectionHeading id="portal-changes-heading">Changes outside the agreed scope</PortalSectionHeading>
        {total && <p className="text-sm text-muted-foreground">Approved so far: <span className="font-medium tabular-nums text-foreground">{total}</span></p>}
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {changes.map((change) => (
          <li key={change.id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-5">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                {change.ref && <span className="mr-2 font-mono text-xs text-muted-foreground">{change.ref}</span>}
                {change.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {[
                  change.affects,
                  change.raisedDate ? `Raised ${formatDay(change.raisedDate, now)}` : '',
                  [change.estimate, change.days ? `${change.days} days` : ''].filter(Boolean).join(' · '),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <span className={`shrink-0 self-start rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE[change.state].className}`}>
              {STATE[change.state].label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
