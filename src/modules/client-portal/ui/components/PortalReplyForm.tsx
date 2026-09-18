'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PortalAskView } from '../../domain/client-portal.types';
import { PortalSectionHeading } from './PortalSectionHeading';

/** Mirrors the server's own cap so the browser never sends what would be cut. */
const MAX_BODY_CHARS = 4000;
/** The counter stays out of the way until the limit is actually in sight. */
const COUNTER_VISIBLE_FROM = MAX_BODY_CHARS - 200;

/**
 * Window event the "Reply" affordance on an ask dispatches. The form is the
 * single place a client can write, so the rows next to each ask only point at
 * it: they carry an ask id, the form selects it and takes focus.
 */
const REPLY_EVENT = 'portal:reply';

interface ReplyEventDetail {
  askId: string;
}

const HONEYPOT_STYLE = {
  position: 'absolute' as const,
  left: '-9999px',
  width: '1px',
  height: '1px',
  opacity: 0,
  overflow: 'hidden' as const,
};

const FIELD_CLASS =
  'w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60';

interface PortalAskReplyButtonProps {
  askId: string;
  askTitle: string;
}

/**
 * The per-ask "Reply" affordance. Deliberately tiny: it holds no state and
 * sends no request, it just aims the one form at this ask.
 */
export function PortalAskReplyButton({ askId, askTitle }: PortalAskReplyButtonProps) {
  const onClick = () => {
    window.dispatchEvent(new CustomEvent<ReplyEventDetail>(REPLY_EVENT, { detail: { askId } }));
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      Reply
      <span className="sr-only"> about {askTitle}</span>
    </button>
  );
}

interface PortalReplyFormProps {
  token: string;
  asks: PortalAskView[];
  repliesOpen: boolean;
}

type Status = 'idle' | 'sending' | 'sent';

/**
 * "Send us a message": the client's only write path. Posts to
 * `/api/portal/[token]/messages`, which validates the token, the honeypot and
 * the hourly cap; every error it returns is already safe to show as-is.
 */
export function PortalReplyForm({ token, asks, repliesOpen }: PortalReplyFormProps) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const honeypotRef = useRef<HTMLInputElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);

  const [body, setBody] = useState('');
  const [name, setName] = useState('');
  const [askId, setAskId] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  // Bumped whenever something asks for the composer. Focusing from an effect
  // rather than from the handler means the textarea is mounted by then, even
  // when the form was showing the thank-you a moment earlier.
  const [focusRequest, setFocusRequest] = useState(0);

  useEffect(() => {
    if (!repliesOpen) return;
    const onReply = (event: Event) => {
      const detail = (event as CustomEvent<ReplyEventDetail>).detail;
      if (!detail?.askId) return;
      setStatus('idle');
      setError(null);
      setAskId(detail.askId);
      setFocusRequest((n) => n + 1);
    };
    window.addEventListener(REPLY_EVENT, onReply);
    return () => window.removeEventListener(REPLY_EVENT, onReply);
  }, [repliesOpen]);

  useEffect(() => {
    if (focusRequest === 0) return;
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    textareaRef.current?.focus({ preventScroll: true });
  }, [focusRequest]);

  if (!repliesOpen) return null;

  const trimmed = body.trim();
  const sending = status === 'sending';

  const startAnother = () => {
    setStatus('idle');
    setError(null);
    setBody('');
    setAskId('');
    setFocusRequest((n) => n + 1);
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    if (!trimmed) {
      setError('Write a message first');
      textareaRef.current?.focus();
      return;
    }

    setStatus('sending');
    setError(null);

    try {
      const response = await fetch(`/api/portal/${encodeURIComponent(token)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: trimmed,
          askTaskId: askId || undefined,
          name: name.trim() || undefined,
          company: honeypotRef.current?.value ?? '',
        }),
      });

      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (!response.ok || !payload?.ok) {
        // The route's wording is written for this audience — show it verbatim.
        setError(payload?.error || 'That didn’t send. Please try again.');
        setStatus('idle');
        return;
      }

      // The draft is only cleared once it is safely on the other side.
      setStatus('sent');
      setBody('');
      setAskId('');
      // Picks up the ask that has just been answered.
      router.refresh();
    } catch {
      setError('That didn’t send. Check your connection and try again.');
      setStatus('idle');
    }
  };

  if (status === 'sent') {
    return (
      <section ref={sectionRef} aria-labelledby="portal-reply-heading" className="space-y-5">
        <PortalSectionHeading id="portal-reply-heading">Send us a message</PortalSectionHeading>
        <div role="status" className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <p className="text-sm font-medium text-foreground">Thanks — we have it.</p>
          <p className="mt-1.5 text-sm text-muted-foreground">We reply within one working day.</p>
          <button
            type="button"
            onClick={startAnother}
            className="mt-4 text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Send another message
          </button>
        </div>
      </section>
    );
  }

  const remaining = MAX_BODY_CHARS - body.length;
  const showCounter = body.length >= COUNTER_VISIBLE_FROM;

  return (
    <section ref={sectionRef} aria-labelledby="portal-reply-heading" className="space-y-5">
      <PortalSectionHeading id="portal-reply-heading">Send us a message</PortalSectionHeading>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
        noValidate
      >
        {asks.length > 0 && (
          <div className="space-y-1.5">
            <label htmlFor="portal-reply-subject" className="block text-xs font-medium text-muted-foreground">
              About
            </label>
            <select
              id="portal-reply-subject"
              value={askId}
              disabled={sending}
              onChange={(event) => setAskId(event.target.value)}
              className={cn(FIELD_CLASS, 'appearance-none bg-card')}
            >
              <option value="">Something else</option>
              {asks.map((ask) => (
                <option key={ask.id} value={ask.id}>
                  {ask.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="portal-reply-body" className="block text-xs font-medium text-muted-foreground">
            Message
          </label>
          <textarea
            id="portal-reply-body"
            ref={textareaRef}
            value={body}
            disabled={sending}
            maxLength={MAX_BODY_CHARS}
            rows={5}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Anything you want us to know, or the answer to one of the questions above."
            className={cn(FIELD_CLASS, 'min-h-32 resize-y leading-relaxed')}
          />
          {showCounter && (
            <p className="text-right text-xs text-muted-foreground">{remaining} characters left</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="portal-reply-name" className="block text-xs font-medium text-muted-foreground">
            Your name <span className="font-normal">(optional)</span>
          </label>
          <input
            id="portal-reply-name"
            type="text"
            value={name}
            disabled={sending}
            maxLength={120}
            autoComplete="name"
            onChange={(event) => setName(event.target.value)}
            className={FIELD_CLASS}
          />
        </div>

        {/* Honeypot: hidden from people and assistive tech, left empty by both. */}
        <input
          ref={honeypotRef}
          type="text"
          name="company"
          defaultValue=""
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={HONEYPOT_STYLE}
        />

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">Goes straight to your ActiveSet contact.</p>
          <button
            type="submit"
            disabled={sending}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
          >
            {sending ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Send aria-hidden="true" className="h-4 w-4" />
            )}
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </section>
  );
}
