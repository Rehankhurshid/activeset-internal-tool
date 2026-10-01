import { Check } from 'lucide-react';
import type { PortalReadinessView } from '../../domain/client-portal.types';
import { PortalSectionHeading } from './PortalSectionHeading';

/** How ready for launch the project is: one bar per checklist, SEO tags and redirects. Nothing when there is nothing to count. */
export function PortalReadiness({ readiness }: { readiness?: PortalReadinessView[] }) {
  if (!readiness?.length) return null;
  return (
    <section aria-labelledby="portal-ready-heading" className="space-y-5">
      <PortalSectionHeading id="portal-ready-heading">Launch readiness</PortalSectionHeading>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {readiness.map((row) => {
          const pct = row.total ? Math.round((row.done / row.total) * 100) : 0;
          const bar = (
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{row.title}</span>
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted sm:w-40" aria-hidden="true">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </span>
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {row.done} of {row.total}
              </span>
            </div>
          );
          return (
            <li key={row.id} className="px-4 py-3 sm:px-5">
              {row.groups?.length ? (
                <details className="group">
                  <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{bar}</summary>
                  <div className="mt-3 space-y-3">
                    {row.groups.map((group) => (
                      <div key={group.title} className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {group.title} · {group.done} of {group.total}
                        </p>
                        <ul className="space-y-1">
                          {group.checks.map((check, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <span
                                aria-hidden="true"
                                className={
                                  check.done
                                    ? 'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white'
                                    : 'mt-0.5 h-4 w-4 shrink-0 rounded-full border border-muted-foreground/40'
                                }
                              >
                                {check.done && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
                              </span>
                              <span className={check.done ? 'text-muted-foreground' : 'text-foreground'}>
                                {check.title}
                                <span className="sr-only">{check.done ? ', done' : ', not yet'}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </details>
              ) : (
                bar
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
