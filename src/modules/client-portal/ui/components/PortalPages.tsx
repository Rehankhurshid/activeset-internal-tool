import { ExternalLink, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PortalPageFeedbackLink, PortalPageState, PortalPageView } from '../../domain/client-portal.types';
import { PortalSectionHeading } from './PortalSectionHeading';

interface PortalPagesProps {
  pages: PortalPageView[];
  feedback?: PortalPageFeedbackLink[];
}

const STATE_LABEL: Record<PortalPageState, string> = {
  ready: 'Ready for your review',
  building: 'Being built',
  waiting: 'Waiting on your part',
  planned: 'Not started',
};

/**
 * The pages, one by one (Rehan, 2026-10-13). Design and development run side
 * by side, so a page we have built can be reviewed on staging while others are
 * still being designed. Comments go in MarkUp, linked at the top; there is no
 * per-page sign-off.
 */
export function PortalPages({ pages, feedback }: PortalPagesProps) {
  const count = (state: PortalPageState) => pages.filter((p) => p.state === state).length;
  const summary = (['ready', 'building', 'waiting'] as const)
    .map((state) => [state, count(state)] as const)
    .filter(([, n]) => n > 0)
    .map(([state, n]) => `${n} ${STATE_LABEL[state].toLowerCase()}`)
    .join(' · ');

  return (
    <section aria-labelledby="portal-pages-heading" className="space-y-5">
      <div className="space-y-1">
        <PortalSectionHeading id="portal-pages-heading">Your pages</PortalSectionHeading>
        <p className="text-sm text-muted-foreground">
          Each page is ready to review as soon as we have built it, even while others are still being designed. Open it
          on staging and leave your comments. When a new version of a design arrives, we build it.
        </p>
        {summary && <p className="text-xs tabular-nums text-muted-foreground">{summary}</p>}
      </div>

      {feedback && feedback.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {feedback.map((link) => (
            <span key={link.url} className="inline-flex items-center gap-2">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-foreground underline-offset-2 hover:underline"
              >
                {link.label}
                <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
              </a>
              {link.help && (
                <a
                  href={link.help.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={link.help.label}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  <PlayCircle aria-hidden="true" className="h-3 w-3" />
                  Watch how
                  <span className="sr-only">: {link.help.label}</span>
                </a>
              )}
            </span>
          ))}
        </div>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {pages.map((page) => (
          <li
            key={page.id}
            className={cn(
              'flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5',
              page.state === 'ready' && 'bg-amber-50/60',
            )}
          >
            <div className="min-w-0 space-y-0.5">
              <p className={cn('text-sm font-medium', page.state === 'ready' || page.state === 'building' ? 'text-foreground' : 'text-foreground/70')}>
                {page.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {STATE_LABEL[page.state]}
                {page.theirs?.length ? ` · ${page.theirs.join(' · ')}` : ''}
              </p>
            </div>
            {page.stagingUrl && (page.state === 'ready' || page.state === 'building') && (
              <a
                href={page.stagingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground underline-offset-2 hover:underline"
              >
                Open on staging
                <ExternalLink aria-hidden="true" className="h-3 w-3" />
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
