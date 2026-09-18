'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, Copy, ExternalLink, Eye, Link2, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/alert-dialog-confirm';
import { ViewsPopover } from '@/components/views/ViewsPopover';
import type { Project } from '@/types';
import { clientPortalRepository, type PortalLinkAction, type PortalLinkState } from '../../infrastructure/client-portal.repository';
import { copyText } from './copy-text';

interface PortalLinkCardProps {
  projectId: string;
  /** Live project doc — supplies the open counters written by the portal beacon. */
  project: Pick<Project, 'clientPortal' | 'clientFacing'>;
  /** Fired after every load/enable/rotate/disable so the parent can expose the URL. */
  onStateChange?: (state: PortalLinkState) => void;
}

function formatIssued(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function relativeLabel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return '';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * The portal link itself: enable, copy, preview, rotate, disable. Token
 * operations go through the admin-only link route; the card re-reads the
 * state whenever the project's `clientPortal.enabled` flag changes so a
 * second tab or teammate flipping it is reflected here.
 */
export function PortalLinkCard({ projectId, project, onStateChange }: PortalLinkCardProps) {
  const [state, setState] = useState<PortalLinkState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<PortalLinkAction | null>(null);
  const [confirm, setConfirm] = useState<'rotate' | 'disable' | null>(null);
  const requestRef = useRef(0);
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  const enabledFlag = project.clientPortal?.enabled === true;

  const load = useCallback(async () => {
    const id = ++requestRef.current;
    setError(null);
    try {
      const next = await clientPortalRepository.getLinkState(projectId);
      if (id !== requestRef.current) return;
      setState(next);
      onStateChangeRef.current?.(next);
    } catch (err) {
      if (id !== requestRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load portal link');
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    // enabledFlag is a deliberate trigger: re-read when another session flips the portal.
  }, [load, enabledFlag]);

  const run = async (action: PortalLinkAction) => {
    if (busy) return;
    setBusy(action);
    try {
      const next = await clientPortalRepository.setLink(projectId, action);
      requestRef.current += 1; // drop any in-flight GET that would overwrite this
      setState(next);
      setError(null);
      onStateChangeRef.current?.(next);
      if (action === 'enable') toast.success('Client portal enabled');
      if (action === 'rotate') toast.success('New portal link issued — the old one no longer works');
      if (action === 'disable') toast.success('Client portal disabled');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update portal link');
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async () => {
    if (!state?.url) return;
    const copied = await copyText(state.url);
    if (copied) toast.success('Client portal link copied');
    else toast.info(`Portal link: ${state.url}`, { duration: 12000 });
  };

  const handlePreview = () => {
    if (!state?.url) return;
    window.open(`${state.url}?preview=1`, '_blank', 'noopener');
  };

  if (error && !state) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-8 w-40" />
      </div>
    );
  }

  if (!state.enabled) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          The portal is off. Enabling it issues a private link the client can open without signing in —
          status, plan and deliverables only, nothing internal.
        </p>
        <Button size="sm" className="h-8 text-xs" onClick={() => void run('enable')} disabled={busy !== null}>
          {busy === 'enable' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
          Enable portal
        </Button>
      </div>
    );
  }

  const facing = project.clientFacing;
  const viewCount = facing?.viewCount ?? 0;
  const lastViewed = facing?.lastViewedAt ? relativeLabel(facing.lastViewedAt) : '';
  const viewsLine = viewCount > 0
    ? [`Opened ${viewCount}×`, lastViewed && `last ${lastViewed}`, facing?.lastViewCity]
        .filter(Boolean)
        .join(' · ')
    : 'Not opened yet';

  return (
    <div className="space-y-3">
      {state.url ? (
        <div className="space-y-1.5">
          <Input
            readOnly
            value={state.url}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Client portal link"
            className="h-8 font-mono text-xs"
          />
          <p className="text-[11px] text-amber-700 dark:text-amber-300/90">
            Anyone with this link can see the client view. Rotate it if it leaks.
            {!state.retrievable && ' It is shown once — copy it now; after a reload only Rotate can give you a new one.'}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          The portal is on and the link is live, but it can&apos;t be shown again on this deployment (tokens are not
          stored in a readable form). Rotate to issue a fresh link you can copy.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {state.url && (
          <>
            <Button size="sm" className="h-8 text-xs" onClick={() => void handleCopy()} disabled={busy !== null}>
              <Copy className="h-3.5 w-3.5" />
              Copy link
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handlePreview} disabled={busy !== null}>
              <ExternalLink className="h-3.5 w-3.5" />
              Preview as client
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground"
          onClick={() => setConfirm('rotate')}
          disabled={busy !== null}
        >
          {busy === 'rotate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Rotate
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground hover:text-destructive"
          onClick={() => setConfirm('disable')}
          disabled={busy !== null}
        >
          {busy === 'disable' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
          Disable
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {state.issuedAt && <span>Issued {formatIssued(state.issuedAt)}</span>}
        <ViewsPopover
          endpoint={`/api/client-portal/${encodeURIComponent(projectId)}/views`}
          viewCount={viewCount}
          subtitle="Client portal · viewer identity not captured"
        >
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3 w-3" aria-hidden="true" />
            {viewsLine}
          </span>
        </ViewsPopover>
      </div>

      <ConfirmDialog
        open={confirm === 'rotate'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Rotate the portal link?"
        description="The current link stops working immediately and a new one is issued."
        confirmText="Rotate link"
        onConfirm={() => {
          setConfirm(null);
          void run('rotate');
        }}
      />
      <ConfirmDialog
        open={confirm === 'disable'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Disable the client portal?"
        description="The link stops working immediately. Status, plan and branding are kept, so enabling it again issues a fresh link with the same content."
        confirmText="Disable portal"
        variant="destructive"
        onConfirm={() => {
          setConfirm(null);
          void run('disable');
        }}
      />
    </div>
  );
}
