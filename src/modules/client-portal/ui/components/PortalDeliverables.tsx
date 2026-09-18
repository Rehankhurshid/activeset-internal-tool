import { ArrowUpRight, Globe, Link2, type LucideIcon } from 'lucide-react';
import type { PortalDeliverableView } from '../../domain/client-portal.types';
import { hostnameOf } from './portal-format';
import { PortalSectionHeading } from './PortalSectionHeading';

interface PortalDeliverablesProps {
  deliverables: PortalDeliverableView[];
  websiteUrl?: string;
}

interface Row {
  key: string;
  title: string;
  url: string;
  icon: LucideIcon;
}

/** "Deliverables": the live site (when known) followed by the team's client-visible links. */
export function PortalDeliverables({ deliverables, websiteUrl }: PortalDeliverablesProps) {
  const rows: Row[] = [
    ...(websiteUrl ? [{ key: 'site', title: 'Open site', url: websiteUrl, icon: Globe }] : []),
    ...deliverables.map((d) => ({ key: `link-${d.id}`, title: d.title, url: d.url, icon: Link2 })),
  ];

  return (
    <section aria-labelledby="portal-deliverables-heading" className="space-y-5">
      <PortalSectionHeading id="portal-deliverables-heading">Deliverables</PortalSectionHeading>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Links to your staging site and design files will appear here.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {rows.map((row) => {
            const Icon = row.icon;
            return (
              <li key={row.key}>
                <a
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none sm:px-5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{row.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{hostnameOf(row.url)}</span>
                  </span>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                  />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
