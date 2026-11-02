import { ArrowUpRight } from 'lucide-react';
import type { PortalDeliverableVersionView, PortalDeliverableView } from '../../domain/client-portal.types';
import { formatDay } from './portal-format';
import { PortalSectionHeading } from './PortalSectionHeading';

interface PortalDeliverablesProps {
  deliverables?: PortalDeliverableView[];
  now: Date;
}

/** "v2 · Shared 12 Oct with Shruthi": what we know about one version. */
function versionLine(version: PortalDeliverableVersionView, now: Date): string {
  const shared = version.sharedAt
    ? `Shared ${formatDay(version.sharedAt, now)}${version.sharedWith ? ` with ${version.sharedWith}` : ''}`
    : version.sharedWith
      ? `Shared with ${version.sharedWith}`
      : '';
  return [version.version ? `v${version.version}` : '', shared].filter(Boolean).join(' · ');
}

/**
 * "What we've handed over": each deliverable once, its latest version up front
 * with the day it was shared and who got it, earlier versions behind a
 * disclosure. Renders nothing when there are none.
 */
export function PortalDeliverables({ deliverables, now }: PortalDeliverablesProps) {
  if (!deliverables || deliverables.length === 0) return null;

  return (
    <section aria-labelledby="portal-deliverables-heading" className="space-y-5">
      <PortalSectionHeading id="portal-deliverables-heading">What we&apos;ve handed over</PortalSectionHeading>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {deliverables.map((deliverable) => {
          const [latest, ...earlier] = deliverable.versions;
          if (!latest) return null;
          const line = versionLine(latest, now);
          return (
            <li key={deliverable.id} className="px-4 py-3.5 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <a
                    href={latest.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
                  >
                    <span className="break-words">{latest.title}</span>
                    <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  {line && <p className="mt-0.5 text-xs text-muted-foreground">{line}</p>}
                </div>
                {earlier.length > 0 && (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                    Latest
                  </span>
                )}
              </div>
              {earlier.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-foreground">
                    {earlier.length === 1 ? 'Earlier version' : `${earlier.length} earlier versions`}
                  </summary>
                  <ul className="mt-1.5 space-y-1 border-l border-border pl-3">
                    {earlier.map((version) => {
                      const meta = versionLine(version, now);
                      return (
                        <li key={version.id} className="text-xs">
                          <a
                            href={version.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
                          >
                            {version.title}
                            <span className="sr-only"> (opens in a new tab)</span>
                          </a>
                          {meta && <span className="text-muted-foreground"> · {meta}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
