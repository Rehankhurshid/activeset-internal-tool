'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, EyeOff, Link2, Loader2, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  CONTENT_SYNC_STATES,
  CONTENT_SYNC_STATE_LABELS,
  contentSyncTone,
  type ContentSync,
  type ContentSyncInput,
  type ContentSyncState,
  type ContentSyncTone,
} from '../../domain/content-syncs';
import {
  clientPortalRepository,
  type ContentSyncsState,
  type WhalesyncOption,
} from '../../infrastructure/client-portal.repository';
import { formatRelativeTime } from './portal-format';

const TONE: Record<ContentSyncTone, string> = {
  ok: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300',
  attention: 'border-amber-500/40 text-amber-700 dark:text-amber-300',
  error: 'border-rose-500/40 text-rose-700 dark:text-rose-300',
};

/** ISO → the `datetime-local` value in this browser's zone. */
function toLocalInput(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface FormState {
  name: string;
  provider: string;
  source: string;
  destination: string;
  state: ContentSyncState;
  lastRunAt: string;
  openIssues: string;
  clientNote: string;
  notes: string;
  showToClient: boolean;
  whalesyncId: string;
}

function formOf(sync: ContentSync | null): FormState {
  return {
    name: sync?.name ?? '',
    provider: sync?.provider ?? (sync ? '' : 'Whalesync'),
    source: sync?.source ?? '',
    destination: sync?.destination ?? '',
    state: sync?.state ?? 'active',
    lastRunAt: toLocalInput(sync?.lastRunAt),
    openIssues: String(sync?.openIssues ?? 0),
    clientNote: sync?.clientNote ?? '',
    notes: sync?.notes ?? '',
    showToClient: sync?.showToClient ?? true,
    whalesyncId: sync?.whalesyncId ?? '',
  };
}

interface EditorProps {
  projectId: string;
  sync: ContentSync | null;
  connected: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Add or edit one sync. A row linked to Whalesync on a deployment with the key
 * gets its status, last run and issue count from Whalesync, so those fields
 * are read-only here; everything else is the team's.
 */
function SyncEditor({ projectId, sync, connected, onClose, onSaved }: EditorProps) {
  const [form, setForm] = useState<FormState>(() => formOf(sync));
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [options, setOptions] = useState<WhalesyncOption[] | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const fromWhalesync = connected && !!form.whalesyncId.trim();

  useEffect(() => {
    if (!connected) return;
    let live = true;
    clientPortalRepository
      .listSyncs(projectId, { available: true })
      .then((state) => {
        if (!live) return;
        setOptions(state.available ?? []);
        setOptionsError(state.availableError ?? null);
      })
      .catch((err) => live && setOptionsError(err instanceof Error ? err.message : 'Could not list Whalesync syncs'));
    return () => {
      live = false;
    };
  }, [connected, projectId]);

  const pick = (id: string) => {
    const option = options?.find((o) => o.id === id);
    setForm((prev) => ({
      ...prev,
      whalesyncId: id,
      provider: prev.provider || 'Whalesync',
      name: prev.name || option?.name || '',
      source: prev.source || option?.source || '',
      destination: prev.destination || option?.destination || '',
    }));
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Give the sync a name');
      return;
    }
    const lastRun = form.lastRunAt ? new Date(form.lastRunAt) : null;
    const input: ContentSyncInput = {
      name: form.name,
      provider: form.provider,
      source: form.source,
      destination: form.destination,
      clientNote: form.clientNote,
      notes: form.notes,
      showToClient: form.showToClient,
      whalesyncId: form.whalesyncId.trim() || null,
    };
    if (!fromWhalesync) {
      input.state = form.state;
      input.openIssues = Number(form.openIssues) || 0;
      input.lastRunAt = lastRun && !Number.isNaN(lastRun.getTime()) ? lastRun.toISOString() : null;
    }
    setBusy('save');
    try {
      const saved = sync
        ? await clientPortalRepository.updateSync(projectId, sync.id, input)
        : await clientPortalRepository.createSync(projectId, input);
      if (saved.refreshError) toast.warning(`Saved, but ${saved.refreshError}`);
      else toast.success(fromWhalesync ? 'Saved and read from Whalesync' : 'Saved');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!sync) return;
    setBusy('delete');
    try {
      await clientPortalRepository.deleteSync(projectId, sync.id);
      toast.success('Removed');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove');
    } finally {
      setBusy(null);
    }
  };

  const id = sync?.id ?? 'new';
  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{sync ? 'Edit sync' : 'Add a sync'}</DialogTitle>
        <DialogDescription>
          The client sees the name, where data goes, whether it is running, when it last ran, how many issues are open and
          your note to them. Team notes and issue details stay here.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`sync-ws-${id}`} className="text-xs text-muted-foreground">
            Whalesync sync
          </Label>
          {connected && options && options.length > 0 ? (
            <Select value={form.whalesyncId || '__none__'} onValueChange={(v) => (v === '__none__' ? set('whalesyncId', '') : pick(v))}>
              <SelectTrigger id={`sync-ws-${id}`} className="h-9">
                <SelectValue placeholder="Not linked" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Not linked: keep it by hand</SelectItem>
                {form.whalesyncId && !options.some((o) => o.id === form.whalesyncId) && (
                  <SelectItem value={form.whalesyncId}>{form.whalesyncId}</SelectItem>
                )}
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                    {o.source && o.destination ? ` (${o.source} → ${o.destination})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={`sync-ws-${id}`}
              value={form.whalesyncId}
              onChange={(e) => set('whalesyncId', e.target.value)}
              placeholder="sync_… (optional)"
              className="h-9"
            />
          )}
          <p className="text-[11px] text-muted-foreground">
            {connected
              ? optionsError
                ? `Could not list the account's syncs (${optionsError}); paste the id instead.`
                : options === null
                  ? 'Loading Whalesync syncs…'
                  : 'Linked rows read their status from Whalesync every hour and on Refresh.'
              : 'Whalesync is not connected on this deployment, so keep the status by hand. A pasted id is kept for when it is.'}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`sync-name-${id}`} className="text-xs text-muted-foreground">
              Name (the client reads this)
            </Label>
            <Input id={`sync-name-${id}`} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Portfolio companies" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`sync-source-${id}`} className="text-xs text-muted-foreground">
              From
            </Label>
            <Input id={`sync-source-${id}`} value={form.source} onChange={(e) => set('source', e.target.value)} placeholder="Airtable · Portfolio" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`sync-dest-${id}`} className="text-xs text-muted-foreground">
              To
            </Label>
            <Input id={`sync-dest-${id}`} value={form.destination} onChange={(e) => set('destination', e.target.value)} placeholder="Webflow · Companies" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`sync-provider-${id}`} className="text-xs text-muted-foreground">
              Provider
            </Label>
            <Input id={`sync-provider-${id}`} value={form.provider} onChange={(e) => set('provider', e.target.value)} placeholder="Whalesync" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`sync-state-${id}`} className="text-xs text-muted-foreground">
              Status
            </Label>
            <Select value={form.state} onValueChange={(v) => set('state', v as ContentSyncState)} disabled={fromWhalesync}>
              <SelectTrigger id={`sync-state-${id}`} className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTENT_SYNC_STATES.map((state) => (
                  <SelectItem key={state} value={state}>
                    {CONTENT_SYNC_STATE_LABELS[state]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`sync-run-${id}`} className="text-xs text-muted-foreground">
              Last ran
            </Label>
            <Input
              id={`sync-run-${id}`}
              type="datetime-local"
              value={form.lastRunAt}
              onChange={(e) => set('lastRunAt', e.target.value)}
              disabled={fromWhalesync}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`sync-issues-${id}`} className="text-xs text-muted-foreground">
              Open issues
            </Label>
            <Input
              id={`sync-issues-${id}`}
              type="number"
              min={0}
              value={form.openIssues}
              onChange={(e) => set('openIssues', e.target.value)}
              disabled={fromWhalesync}
              className="h-9"
            />
          </div>
          {fromWhalesync && (
            <p className="text-[11px] text-muted-foreground sm:col-span-2">Status, last run and issues come from Whalesync.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`sync-client-note-${id}`} className="text-xs text-muted-foreground">
            Note for the client (optional, one line)
          </Label>
          <Input
            id={`sync-client-note-${id}`}
            value={form.clientNote}
            onChange={(e) => set('clientNote', e.target.value)}
            placeholder="We are fixing a field mapping; updates resume tomorrow."
            maxLength={240}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`sync-notes-${id}`} className="text-xs text-muted-foreground">
            Team notes (never shown to the client)
          </Label>
          <Textarea id={`sync-notes-${id}`} value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
        </div>
        <div className="flex items-center gap-2">
          <Switch id={`sync-show-${id}`} checked={form.showToClient} onCheckedChange={(v) => set('showToClient', v)} />
          <Label htmlFor={`sync-show-${id}`} className="text-sm">
            Show on the client&apos;s page
          </Label>
        </div>
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        <div>
          {sync &&
            (confirmDelete ? (
              <Button variant="destructive" size="sm" onClick={() => void remove()} disabled={!!busy}>
                {busy === 'delete' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Remove for good
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} disabled={!!busy}>
                Remove
              </Button>
            ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={!!busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={!!busy}>
            {busy === 'save' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}

/**
 * The Client tab's "Data syncs" card: every sync carrying this client's data
 * into their site, with what the client's chip says and what only the team
 * sees (Whalesync's issue messages, a refresh that failed, notes).
 */
export function ClientSyncsCard({ projectId }: { projectId: string }) {
  const [state, setState] = useState<ContentSyncsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ContentSync | 'new' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const now = new Date();

  const load = useCallback(async () => {
    try {
      setState(await clientPortalRepository.listSyncs(projectId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load syncs');
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const linked = (state?.syncs ?? []).filter((s) => s.whalesyncId).length;

  const refresh = async () => {
    setRefreshing(true);
    try {
      const result = await clientPortalRepository.refreshSyncs(projectId);
      setState((prev) => (prev ? { ...prev, syncs: result.syncs } : prev));
      if (result.failed) toast.warning(`${result.refreshed} refreshed, ${result.failed} failed: see the rows`);
      else toast.success(`${result.refreshed} sync${result.refreshed === 1 ? '' : 's'} refreshed from Whalesync`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not refresh');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!state && <span className="mr-auto text-xs text-muted-foreground">{error ?? 'Loading syncs…'}</span>}
        {state?.connected && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => void refresh()}
            disabled={refreshing || linked === 0}
            title={linked === 0 ? 'Link a sync to Whalesync first' : 'Read every linked sync from Whalesync now'}
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setEditing('new')} disabled={!state}>
          <Plus className="h-3.5 w-3.5" />
          Add sync
        </Button>
      </div>

      {state && !state.connected && state.syncs.some((s) => s.whalesyncId) && (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Whalesync isn&apos;t connected on this deployment: add <code>WHALESYNC_API_KEY</code> (Whalesync → Settings → API
          keys, read scope) and linked syncs update themselves every hour. Until then their status is what you set here.
        </p>
      )}

      {state && state.syncs.length === 0 && (
        <p className="text-sm text-muted-foreground">
          None. Add one when the client&apos;s content reaches the site through a sync (Airtable → Webflow through Whalesync, say),
          and their page shows whether it is running.
        </p>
      )}

      {state && state.syncs.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border">
          {state.syncs.map((sync) => {
            const tone = contentSyncTone(sync, now);
            const ran = formatRelativeTime(sync.lastRunAt, now);
            return (
              <li key={sync.id}>
                <button
                  type="button"
                  onClick={() => setEditing(sync)}
                  className="flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-muted/50"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{sync.name}</span>
                    {!sync.showToClient && (
                      <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
                        <EyeOff className="h-3 w-3" aria-hidden="true" />
                        Hidden from client
                      </Badge>
                    )}
                    {sync.whalesyncId && (
                      <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground" title={sync.whalesyncId}>
                        <Link2 className="h-3 w-3" aria-hidden="true" />
                        Whalesync
                      </Badge>
                    )}
                    <Badge variant="outline" className={cn('shrink-0 text-[10px]', TONE[tone])}>
                      {CONTENT_SYNC_STATE_LABELS[sync.state] ?? sync.state}
                      {sync.openIssues > 0 && ` · ${sync.openIssues} issue${sync.openIssues === 1 ? '' : 's'}`}
                    </Badge>
                  </span>
                  <span className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                    {sync.source && <span>{sync.source}</span>}
                    {sync.source && sync.destination && <ArrowRight className="h-3 w-3" aria-hidden="true" />}
                    {sync.destination && <span>{sync.destination}</span>}
                    {(sync.source || sync.destination) && <span>·</span>}
                    <span>{ran ? `Last ran ${ran}` : 'Never run'}</span>
                    {sync.refreshedAt && <span>· read from Whalesync {formatRelativeTime(sync.refreshedAt, now)}</span>}
                  </span>
                  {sync.refreshError && (
                    <span className="text-[11px] text-rose-700 dark:text-rose-300">Last refresh failed: {sync.refreshError}</span>
                  )}
                  {sync.authErrors?.map((line) => (
                    <span key={line} className="text-[11px] text-rose-700 dark:text-rose-300">
                      {line}
                    </span>
                  ))}
                  {sync.issues && sync.issues.length > 0 && (
                    <span className="space-y-0.5 text-[11px] text-muted-foreground">
                      {sync.issues.slice(0, 5).map((issue, i) => (
                        <span key={i} className="block truncate">
                          {[issue.table, issue.message ?? issue.code].filter(Boolean).join(': ')}
                          {issue.count && issue.count > 1 ? ` (×${issue.count})` : ''}
                        </span>
                      ))}
                    </span>
                  )}
                  {sync.notes && <span className="line-clamp-2 text-[11px] text-muted-foreground">{sync.notes}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        {editing && (
          <SyncEditor
            key={editing === 'new' ? 'new' : editing.id}
            projectId={projectId}
            sync={editing === 'new' ? null : editing}
            connected={!!state?.connected}
            onClose={() => setEditing(null)}
            onSaved={() => void load()}
          />
        )}
      </Dialog>
    </div>
  );
}
