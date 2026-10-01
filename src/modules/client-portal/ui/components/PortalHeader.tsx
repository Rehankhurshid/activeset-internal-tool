import type { PortalFactsView } from '../../domain/client-portal.types';
import { brandInitial, formatDay, parseIsoDay } from './portal-format';

interface PortalHeaderProps {
  brandName: string;
  brandLogoUrl?: string;
  projectName: string;
  welcome?: string;
  /** From the project sheet's Overview: what this engagement is, and when it launches. */
  facts?: PortalFactsView;
  now: Date;
}

function daysUntil(iso: string, now: Date): number | null {
  const day = parseIsoDay(iso);
  if (!day) return null;
  const target = Date.UTC(day.year, day.month - 1, day.day);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

function Facts({ facts, now }: { facts: PortalFactsView; now: Date }) {
  const launchIn = facts.targetLaunchDate ? daysUntil(facts.targetLaunchDate, now) : null;
  const items = [
    facts.kickoffDate ? { label: 'Kicked off', value: formatDay(facts.kickoffDate, now) } : null,
    facts.targetLaunchDate
      ? {
          label: 'Target launch',
          value: `${formatDay(facts.targetLaunchDate, now)}${launchIn !== null && launchIn > 0 ? `, in ${launchIn} day${launchIn === 1 ? '' : 's'}` : ''}`,
        }
      : facts.targetLaunchText
        ? { label: 'Target launch', value: facts.targetLaunchText }
        : null,
  ].filter((x): x is { label: string; value: string } => x !== null);

  return (
    <div className="space-y-3">
      {facts.engagement && <p className="text-sm text-muted-foreground">{facts.engagement}</p>}
      {items.length > 0 && (
        <dl className="flex flex-wrap gap-x-8 gap-y-2">
          {items.map((item) => (
            <div key={item.label}>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{item.label}</dt>
              <dd className="text-sm font-medium tabular-nums text-foreground">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function PortalHeader({ brandName, brandLogoUrl, projectName, welcome, facts, now }: PortalHeaderProps) {
  return (
    <header className="space-y-5">
      <div className="flex items-center gap-3">
        {brandLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brandLogoUrl}
            alt={brandName}
            className="h-10 w-10 rounded-xl border border-border bg-card object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-sm font-semibold text-background"
          >
            {brandInitial(brandName)}
          </span>
        )}
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{brandName}</span>
      </div>
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">{projectName}</h1>
        {welcome && <p className="max-w-prose text-base leading-relaxed text-muted-foreground sm:text-lg">{welcome}</p>}
      </div>
      {facts && <Facts facts={facts} now={now} />}
    </header>
  );
}
