import { Pin } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PortalUpdateView } from '../../domain/client-portal.types';
import { formatRelativeDay } from './portal-format';
import { PortalSectionHeading } from './PortalSectionHeading';

interface PortalUpdatesFeedProps {
  updates: PortalUpdateView[];
  now: Date;
}

/**
 * "Recent updates": the team's posts, pinned first then newest first (the
 * projection already ordered them). Plain text only — bodies keep their line
 * breaks but are never rendered as markup.
 */
export function PortalUpdatesFeed({ updates, now }: PortalUpdatesFeedProps) {
  if (updates.length === 0) return null;

  return (
    <section aria-labelledby="portal-updates-heading" className="space-y-5">
      <PortalSectionHeading id="portal-updates-heading">Recent updates</PortalSectionHeading>

      <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {updates.map((update) => {
          const relative = formatRelativeDay(update.postedAt, now);
          return (
            <li key={update.id} className="px-4 py-5 sm:px-6 sm:py-6">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {update.pinned && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    <Pin aria-hidden="true" className="h-3 w-3" />
                    Pinned
                  </span>
                )}
                {relative && <p className="text-xs text-muted-foreground">{relative}</p>}
              </div>

              {update.title && (
                <h3 className={cn('text-sm font-semibold text-foreground', (update.pinned || relative) && 'mt-2')}>
                  {update.title}
                </h3>
              )}

              <p
                className={cn(
                  'max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-foreground',
                  update.title ? 'mt-1.5' : (update.pinned || relative) && 'mt-2',
                )}
              >
                {update.body}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
