'use client';

import { useState } from 'react';
import type { PortalReviewView } from '../../domain/client-portal.types';
import { formatDay } from './portal-format';
import { PortalSectionHeading } from './PortalSectionHeading';

interface PortalReviewProps {
  review: PortalReviewView | undefined;
  token: string;
  now: Date;
  /** An agency preview must not be able to approve on the client's behalf. */
  preview?: boolean;
}

/**
 * The one thing the client can actually do here.
 *
 * The rest of the portal is a status page on purpose — they reply in Slack, not
 * in an inbox nobody watches. Approval is the exception, because "yes, go ahead"
 * needs to exist somewhere other than a chat message that nobody can find three
 * months later when the question is whether they signed it off.
 *
 * It deliberately shows no checklist items. The steps behind a review stage are
 * ours; what they need is the work itself, which is above this on the page, and
 * one thing to say yes to.
 */
export function PortalReview({ review, token, now, preview = false }: PortalReviewProps) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [approvedAt, setApprovedAt] = useState(review?.approvedAt);
  const [failed, setFailed] = useState(false);

  if (!review) return null;

  const settled = approvedAt ?? review.approvedAt;

  async function approve() {
    if (preview || saving) return;
    setSaving(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/portal/${encodeURIComponent(token)}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageKey: review!.stageKey, note: note.trim() || undefined }),
      });
      if (!res.ok) throw new Error('rejected');
      const data = (await res.json()) as { approvedAt?: string };
      // Held locally as well as returned, so the confirmation is immediate: the
      // page is server-rendered and would otherwise need a reload to change.
      setApprovedAt(data.approvedAt ?? new Date().toISOString());
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="portal-review-heading" className="space-y-5">
      <PortalSectionHeading id="portal-review-heading">
        {settled ? 'Your approval' : 'Ready for your approval'}
      </PortalSectionHeading>

      <div className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{review.title}</p>
          {settled ? (
            <p className="text-sm text-muted-foreground">
              Approved on {formatDay(settled, now)}. Thank you — we have it on record.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Have a look through the work above. When you are happy, approve it here so we have it
              in writing and can carry on.
            </p>
          )}
        </div>

        {settled && review.approvedNote && (
          <p className="rounded-xl bg-muted/50 px-3 py-2 text-sm text-foreground">
            &ldquo;{review.approvedNote}&rdquo;
          </p>
        )}

        {!settled && (
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Anything to add? Optional.
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
                rows={2}
                disabled={saving}
                className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/30 disabled:opacity-60"
                placeholder="Anything you want on the record alongside your approval."
              />
            </label>

            <button
              type="button"
              onClick={approve}
              disabled={saving || preview}
              title={preview ? 'Preview only — the client approves from their own link' : undefined}
              className="w-full rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto"
            >
              {saving ? 'Sending…' : 'Approve'}
            </button>

            {preview && (
              <p className="text-xs text-muted-foreground">
                You are viewing a preview, so this is disabled.
              </p>
            )}

            {failed && (
              <p className="text-sm text-rose-600">
                That did not go through. Please try again, or tell us in Slack and we will record it
                for you.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
