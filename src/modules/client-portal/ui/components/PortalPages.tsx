'use client';

import { useState } from 'react';
import { Check, ExternalLink, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PortalPageFeedbackLink, PortalPageState, PortalPageView } from '../../domain/client-portal.types';
import { formatDay } from './portal-format';
import { PortalSectionHeading } from './PortalSectionHeading';

interface PortalPagesProps {
  pages: PortalPageView[];
  feedback?: PortalPageFeedbackLink[];
  token: string;
  now: Date;
  /** An agency preview must not approve on the client's behalf. */
  preview?: boolean;
}

const STATE_LABEL: Record<PortalPageState, string> = {
  ready: 'Ready for your review',
  approved: 'Approved',
  building: 'Being built',
  waiting: 'Waiting on your part',
  planned: 'Not started',
};

/**
 * The pages, one by one (Rehan, 2026-10-13). Design and development run side
 * by side, so a page we have built can be reviewed on staging while others are
 * still being designed. Each ready page opens on staging and takes one "Looks
 * good"; comments go in MarkUp, linked at the top.
 */
export function PortalPages({ pages, feedback, token, now, preview = false }: PortalPagesProps) {
  // Held locally as well as returned, so the confirmation is immediate on a server-rendered page.
  const [approved, setApproved] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const stateOf = (page: PortalPageView): PortalPageState => (approved[page.id] ? 'approved' : page.state);
  const count = (state: PortalPageState) => pages.filter((p) => stateOf(p) === state).length;
  const summary = (['ready', 'approved', 'building', 'waiting'] as const)
    .map((state) => [state, count(state)] as const)
    .filter(([, n]) => n > 0)
    .map(([state, n]) => `${n} ${STATE_LABEL[state].toLowerCase()}`)
    .join(' · ');

  async function approve(pageId: string) {
    if (preview || saving) return;
    setSaving(pageId);
    setFailed(null);
    try {
      const res = await fetch(`/api/portal/${encodeURIComponent(token)}/pages/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId }),
      });
      if (!res.ok) throw new Error('rejected');
      const data = (await res.json()) as { approvedAt?: string };
      setApproved((prev) => ({ ...prev, [pageId]: data.approvedAt ?? new Date().toISOString() }));
    } catch {
      setFailed(pageId);
    } finally {
      setSaving(null);
    }
  }

  return (
    <section aria-labelledby="portal-pages-heading" className="space-y-5">
      <div className="space-y-1">
        <PortalSectionHeading id="portal-pages-heading">Your pages</PortalSectionHeading>
        <p className="text-sm text-muted-foreground">
          Each page is ready to review as soon as we have built it, even while others are still being designed. Open it
          on staging, leave comments, and tell us when it looks good. When a new version of a design arrives, we build it
          and ask again.
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
        {pages.map((page) => {
          const state = stateOf(page);
          const approvedAt = approved[page.id] ?? page.approvedAt;
          return (
            <li
              key={page.id}
              className={cn(
                'flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5',
                state === 'ready' && 'bg-amber-50/60',
              )}
            >
              <div className="min-w-0 space-y-0.5">
                <p className={cn('text-sm font-medium', state === 'planned' || state === 'waiting' ? 'text-foreground/70' : 'text-foreground')}>
                  {page.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {state === 'approved' && approvedAt ? `Approved · ${formatDay(approvedAt, now)}` : STATE_LABEL[state]}
                  {page.theirs?.length ? ` · ${page.theirs.join(' · ')}` : ''}
                </p>
                {failed === page.id && (
                  <p className="text-xs text-rose-600">That did not go through. Please try again, or tell us in Slack.</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {page.stagingUrl && (state === 'ready' || state === 'approved' || state === 'building') && (
                  <a
                    href={page.stagingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    Open on staging
                    <ExternalLink aria-hidden="true" className="h-3 w-3" />
                  </a>
                )}
                {state === 'ready' && (
                  <button
                    type="button"
                    onClick={() => approve(page.id)}
                    disabled={saving !== null || preview}
                    title={preview ? 'Preview only — the client approves from their own link' : undefined}
                    className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {saving === page.id ? 'Sending…' : 'Looks good'}
                  </button>
                )}
                {state === 'approved' && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                    <Check aria-hidden="true" className="h-3.5 w-3.5" />
                    Looks good
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
