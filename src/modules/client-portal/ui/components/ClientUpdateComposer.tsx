'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Pin, PinOff, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ui/alert-dialog-confirm';
import type { ClientUpdate } from '@/types';
import { cn } from '@/lib/utils';
import { clientPortalRepository } from '../../infrastructure/client-portal.repository';

const BODY_MAX = 2000;
const TITLE_MAX = 80;
/** The counter only appears once the body is close enough to the cap to matter. */
const COUNTER_FROM = BODY_MAX - 200;

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

/** Pinned first, then newest — the same order the client's page uses. */
function sortForPortal(updates: ClientUpdate[]): ClientUpdate[] {
  return [...updates].sort((a, b) => {
    const pin = Number(b.pinned === true) - Number(a.pinned === true);
    if (pin !== 0) return pin;
    return (b.postedAt ?? '').localeCompare(a.postedAt ?? '');
  });
}

interface ClientUpdateComposerProps {
  projectId: string;
  /** Stamped onto the update as `postedBy`. */
  userEmail: string;
}

/**
 * The team's side of the conversation: post a short note the client reads
 * verbatim on their portal page, and manage the notes already posted. The
 * list is a live subscription, so a teammate's post shows up here too.
 */
export function ClientUpdateComposer({ projectId, userEmail }: ClientUpdateComposerProps) {
  const [updates, setUpdates] = useState<ClientUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [posting, setPosting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ClientUpdate | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = clientPortalRepository.subscribeToUpdates(projectId, (next) => {
      setUpdates(next);
      setLoading(false);
    });
    return unsubscribe;
  }, [projectId]);

  const ordered = useMemo(() => sortForPortal(updates), [updates]);
  const trimmed = body.trim();
  const canPost = trimmed.length > 0 && !posting;

  const handlePost = async () => {
    if (!canPost) return;
    setPosting(true);
    try {
      await clientPortalRepository.postUpdate(
        projectId,
        { title: title.trim() || undefined, body: trimmed, pinned: pinned || undefined },
        userEmail,
      );
      setTitle('');
      setBody('');
      setPinned(false);
      toast.success('Update posted to the portal');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to post the update');
    } finally {
      setPosting(false);
    }
  };

  const handleTogglePin = async (update: ClientUpdate) => {
    setBusyId(update.id);
    try {
      await clientPortalRepository.editUpdate(projectId, update.id, { pinned: update.pinned !== true });
      toast.success(update.pinned === true ? 'Unpinned' : 'Pinned to the top');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update the pin');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (update: ClientUpdate) => {
    setBusyId(update.id);
    try {
      await clientPortalRepository.deleteUpdate(projectId, update.id);
      toast.success('Update removed from the portal');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete the update');
    } finally {
      setBusyId(null);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          maxLength={TITLE_MAX}
          className="h-8 text-sm"
          aria-label="Update title"
        />
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
          placeholder="What should the client know? They see this exactly as typed."
          rows={3}
          maxLength={BODY_MAX}
          className="text-sm"
          aria-label="Update message"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="portal-update-pinned"
              checked={pinned}
              onCheckedChange={(v) => setPinned(v === true)}
            />
            <Label htmlFor="portal-update-pinned" className="cursor-pointer text-xs text-muted-foreground">
              Pin to the top
            </Label>
          </div>
          <div className="flex items-center gap-2">
            {body.length >= COUNTER_FROM && (
              <span
                className={cn(
                  'text-[11px] tabular-nums',
                  body.length >= BODY_MAX ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {body.length}/{BODY_MAX}
              </span>
            )}
            <Button size="sm" className="h-8 text-xs" onClick={() => void handlePost()} disabled={!canPost}>
              {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Post
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Posted</h3>
        {loading ? (
          <p className="py-2 text-sm text-muted-foreground">Loading updates…</p>
        ) : ordered.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Nothing posted yet. The client sees these on their page, newest first.
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {ordered.map((u) => (
              <div key={u.id} className={cn('flex items-start gap-2 py-2', busyId === u.id && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                  {u.title && <p className="truncate text-sm font-medium">{u.title}</p>}
                  <p className="line-clamp-2 text-sm text-foreground/90">{u.body}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {[u.pinned === true ? 'Pinned' : '', relativeLabel(u.postedAt), u.postedBy]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    disabled={busyId === u.id}
                    onClick={() => void handleTogglePin(u)}
                    title={u.pinned === true ? 'Unpin' : 'Pin to the top'}
                    aria-label={u.pinned === true ? 'Unpin update' : 'Pin update to the top'}
                  >
                    {u.pinned === true ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    disabled={busyId === u.id}
                    onClick={() => setConfirmDelete(u)}
                    title="Delete"
                    aria-label="Delete update"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Delete this update?"
        description="It disappears from the client's portal page straight away. This cannot be undone."
        confirmText="Delete"
        variant="destructive"
        onConfirm={() => {
          if (confirmDelete) void handleDelete(confirmDelete);
        }}
      />
    </div>
  );
}
