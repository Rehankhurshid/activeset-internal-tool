'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, CornerUpRight, Loader2, MailOpen } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { ClientMessage, Task } from '@/types';
import { cn } from '@/lib/utils';
import { requestsService } from '@/services/database';
import { clientPortalRepository } from '../../infrastructure/client-portal.repository';

/** "just now", "12m ago", "3h ago", "4d ago", then a plain date. */
function relativeLabel(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Full page load so the detail screen re-reads `?tab=` on mount. */
function openTasksTab(): void {
  const url = new URL(window.location.href);
  url.searchParams.set('tab', 'tasks');
  window.location.assign(url.toString());
}

interface MessageRowProps {
  message: ClientMessage;
  askTitle: string | null;
  busy: boolean;
  onMarkRead: () => void;
  onConvert: () => void;
}

function MessageRow({ message, askTitle, busy, onMarkRead, onConvert }: MessageRowProps) {
  const unread = !message.readAt;
  const converted = Boolean(message.convertedRequestId);

  return (
    <div
      className={cn(
        'space-y-1.5 rounded-md border px-3 py-2',
        unread ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-transparent',
        busy && 'opacity-60',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-medium">
          {message.authorName?.trim() || 'The client'}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{relativeLabel(message.createdAt)}</span>
      </div>

      <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">{message.body}</p>

      {message.askTaskId && (
        <p className="text-[11px] text-muted-foreground">
          {askTitle ? `Answers the ask “${askTitle}”` : 'Replies to something we asked them for'}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {unread ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={busy}
            onClick={onMarkRead}
          >
            <Check className="h-3.5 w-3.5" />
            Mark read
          </Button>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            Read{message.readBy ? ` by ${message.readBy}` : ''}
          </span>
        )}

        {converted ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <CornerUpRight className="h-3 w-3" />
            Turned into a request
          </span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={busy}
            onClick={onConvert}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CornerUpRight className="h-3.5 w-3.5" />}
            Convert to request
          </Button>
        )}
      </div>
    </div>
  );
}

interface ClientMessagesInboxProps {
  projectId: string;
  /** Stamped onto the message as `readBy` and onto the request as `createdBy`. */
  userEmail: string;
  /** Optional: lets a reply name the ask it answers. Safe to omit. */
  tasks?: Task[];
}

/**
 * What the client wrote back. Unread first, because that is the part of the
 * Client tab that needs a human. A message never becomes internal work on its
 * own — "Convert to request" is the deliberate hand-off into the Tasks flow.
 */
export function ClientMessagesInbox({ projectId, userEmail, tasks }: ClientMessagesInboxProps) {
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = clientPortalRepository.subscribeToMessages(projectId, (next) => {
      setMessages(next);
      setLoading(false);
    });
    return unsubscribe;
  }, [projectId]);

  const askTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tasks ?? []) map.set(t.id, t.title);
    return map;
  }, [tasks]);

  const { unread, read } = useMemo(() => {
    const byNewest = (a: ClientMessage, b: ClientMessage) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    return {
      unread: messages.filter((m) => !m.readAt).sort(byNewest),
      read: messages.filter((m) => Boolean(m.readAt)).sort(byNewest),
    };
  }, [messages]);

  const handleMarkRead = async (message: ClientMessage) => {
    setBusyId(message.id);
    try {
      await clientPortalRepository.markMessageRead(projectId, message.id, userEmail);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark the message read');
    } finally {
      setBusyId(null);
    }
  };

  const handleConvert = async (message: ClientMessage) => {
    setBusyId(message.id);
    try {
      const requestId = await requestsService.createRequest({
        projectId,
        rawText: message.body,
        // Client messages arrive through the portal, not Slack or email: 'paste'
        // is the closest source the request model has.
        source: 'paste',
        sender: message.authorName?.trim() || undefined,
        createdBy: userEmail,
      });
      await clientPortalRepository.linkMessageToRequest(projectId, message.id, requestId);
      toast.success('Request created from the client’s message', {
        description: 'Parse it into tasks from the Tasks tab.',
        action: { label: 'Open Tasks', onClick: openTasksTab },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to convert the message');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading replies…</p>;
  }

  if (messages.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <MailOpen className="h-4 w-4 shrink-0" />
        Nothing from the client yet — their replies land here.
      </p>
    );
  }

  const renderRow = (m: ClientMessage) => (
    <MessageRow
      key={m.id}
      message={m}
      askTitle={m.askTaskId ? askTitles.get(m.askTaskId) ?? null : null}
      busy={busyId === m.id}
      onMarkRead={() => void handleMarkRead(m)}
      onConvert={() => void handleConvert(m)}
    />
  );

  return (
    <div className="space-y-3">
      {unread.length > 0 && <div className="space-y-2">{unread.map(renderRow)}</div>}
      {read.length > 0 && (
        <div className="space-y-2">
          {unread.length > 0 && (
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Read</h3>
          )}
          {read.map(renderRow)}
        </div>
      )}
    </div>
  );
}
