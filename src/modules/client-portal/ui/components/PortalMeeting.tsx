import { ArrowUpRight, ChevronDown, Video } from 'lucide-react';
import type { PortalMeetingView } from '../../domain/client-portal.types';
import { formatDuration, formatMeetingDay } from './portal-format';
import { PortalSummary } from './PortalSummary';

const EYEBROW = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground';

/**
 * One call the team shared: when, who, what was discussed, what happens next,
 * and the recording. Closed by default; a `<details>` so it opens without any
 * script on the page.
 */
export function PortalMeeting({ meeting, now }: { meeting: PortalMeetingView; now: Date }) {
  const when = [formatMeetingDay(meeting.date, now), formatDuration(meeting.durationMinutes)].filter(Boolean).join(' · ');
  const hasBody = !!meeting.summary || meeting.nextSteps.length > 0 || meeting.attendees.length > 0 || !!meeting.recordingUrl;

  return (
    <details className="group/meeting rounded-xl border border-border bg-card open:shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Video aria-hidden="true" className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{meeting.title}</span>
          {when && <span className="block text-xs tabular-nums text-muted-foreground">{when}</span>}
        </span>
        {hasBody && (
          <ChevronDown
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open/meeting:rotate-180"
          />
        )}
      </summary>

      {hasBody && (
        <div className="space-y-5 border-t border-border px-4 pb-5 pt-4 sm:px-5">
          {meeting.attendees.length > 0 && (
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground">With</span> {meeting.attendees.join(', ')}
            </p>
          )}

          {meeting.summary && (
            <div className="space-y-2">
              <h4 className={EYEBROW}>Summary</h4>
              <PortalSummary markdown={meeting.summary} />
            </div>
          )}

          {meeting.nextSteps.length > 0 && (
            <div className="space-y-2">
              <h4 className={EYEBROW}>Next steps</h4>
              <ul className="space-y-2">
                {meeting.nextSteps.map((step, i) => (
                  <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-foreground">
                    <span aria-hidden="true" className="mt-[0.45rem] h-3 w-3 shrink-0 rounded-[3px] border border-muted-foreground/50" />
                    <span className="min-w-0">
                      {step.text}
                      {step.owner && <span className="text-muted-foreground"> — {step.owner}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {meeting.recordingUrl && (
            <a
              href={meeting.recordingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              Watch the recording
              <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
        </div>
      )}
    </details>
  );
}
