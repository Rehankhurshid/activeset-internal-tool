import { CheckCircle2 } from 'lucide-react';
import type { PortalSignOffView, PortalStageView } from '../../domain/client-portal.types';
import { SIGN_OFF_CHANNEL_PHRASES, phaseAfterSignOffs } from '../../domain/sign-off-log';
import { formatDay } from './portal-format';
import { PortalSectionHeading } from './PortalSectionHeading';

interface PortalSignOffsProps {
  signOffs: PortalSignOffView[] | undefined;
  stages: PortalStageView[];
  currentStageIndex?: number;
  now: Date;
}

/**
 * "What you have signed off": every approval on record, oldest first, with
 * the client's own words and where they gave it, then where the project goes
 * from here. The record the team keeps of a yes given in Slack or on a call
 * sits beside the ones given on this page. Renders nothing when there are none.
 */
export function PortalSignOffs({ signOffs, stages, currentStageIndex, now }: PortalSignOffsProps) {
  if (!signOffs || signOffs.length === 0) return null;
  const after = phaseAfterSignOffs(stages, currentStageIndex);
  const nextLine = after.done
    ? 'Every stage is done.'
    : after.now && after.next
      ? `Now: ${after.now}. Then: ${after.next}.`
      : after.now
        ? `Now: ${after.now}.`
        : after.next
          ? `Next: ${after.next}.`
          : '';

  return (
    <section aria-labelledby="portal-signoffs-heading" className="space-y-5">
      <PortalSectionHeading id="portal-signoffs-heading">What you have signed off</PortalSectionHeading>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <ol className="divide-y divide-border">
          {signOffs.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
              <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="sm:flex sm:items-baseline sm:justify-between sm:gap-4">
                  <p className="text-sm font-medium text-foreground">{entry.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground sm:mt-0 sm:shrink-0">
                    Approved {formatDay(entry.approvedAt, now)}
                    {entry.via ? ` ${SIGN_OFF_CHANNEL_PHRASES[entry.via]}` : ''}
                  </p>
                </div>
                {entry.note && <p className="text-sm text-muted-foreground">&ldquo;{entry.note}&rdquo;</p>}
              </div>
            </li>
          ))}
        </ol>
        {nextLine && (
          <p className="border-t border-border bg-muted/40 px-4 py-3 text-sm text-foreground sm:px-5">{nextLine}</p>
        )}
      </div>
    </section>
  );
}
