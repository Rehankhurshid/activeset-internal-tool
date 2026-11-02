import { ArrowRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { contentSyncTone, isContentSyncStale, type ContentSyncTone } from '../../domain/content-syncs';
import type { PortalContentSyncView } from '../../domain/client-portal.types';
import { PortalSectionHeading } from './PortalSectionHeading';
import { formatRelativeTime } from './portal-format';

/** Light-only tones, like the status chip. */
const TONES: Record<ContentSyncTone, { chip: string; dot: string }> = {
  ok: { chip: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20', dot: 'bg-emerald-500' },
  attention: { chip: 'bg-amber-50 text-amber-900 ring-amber-600/25', dot: 'bg-amber-500' },
  error: { chip: 'bg-rose-50 text-rose-800 ring-rose-600/20', dot: 'bg-rose-500' },
};

/**
 * "Data syncs": one row per sync carrying the client's data into their site
 * (Airtable → Webflow through Whalesync), each with a chip saying whether it
 * is running, when it last ran and how many issues are open. Nothing when the
 * project has none.
 */
export function PortalSyncs({ syncs, now }: { syncs?: PortalContentSyncView[]; now: Date }) {
  if (!syncs?.length) return null;
  return (
    <section aria-labelledby="portal-syncs-heading" className="space-y-5">
      <PortalSectionHeading id="portal-syncs-heading">Data syncs</PortalSectionHeading>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {syncs.map((sync) => {
          const tone = TONES[contentSyncTone(sync, now)];
          const ran = formatRelativeTime(sync.lastRunAt, now);
          const stale = isContentSyncStale(sync, now);
          const issues = sync.openIssues > 0 ? `${sync.openIssues} ${sync.openIssues === 1 ? 'issue' : 'issues'}` : null;
          return (
            <li key={sync.id} className="space-y-1.5 px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{sync.name}</span>
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
                    tone.chip,
                  )}
                >
                  <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
                  {[sync.stateLabel, issues].filter(Boolean).join(' · ')}
                </span>
              </div>
              {(sync.source || sync.destination || sync.provider) && (
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {sync.source && <span>{sync.source}</span>}
                  {sync.source && sync.destination && <ArrowRight className="h-3 w-3" aria-label="to" />}
                  {sync.destination && <span>{sync.destination}</span>}
                  {sync.provider && <span>{sync.source || sync.destination ? `· via ${sync.provider}` : sync.provider}</span>}
                </p>
              )}
              <p className={cn('flex items-center gap-1.5 text-xs', stale ? 'text-amber-800' : 'text-muted-foreground')}>
                <RefreshCw className="h-3 w-3 shrink-0" aria-hidden="true" />
                {ran ? `Last ran ${ran}` : 'Not run yet'}
                {stale && ' · later than usual'}
              </p>
              {sync.note && <p className="text-sm text-foreground">{sync.note}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
