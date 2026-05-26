'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, ExternalLink, Loader2, Link2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';

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
import { Button } from '@/components/ui/button';
import { fetchForProject } from '@/lib/api-client';
import type { Task } from '@/types';
import { isClickUpCreateSyncPending } from './clickupSyncState';

interface ClickUpLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task;
  clickupListId?: string;
  clickupListName?: string;
}

interface SyncCreateResult {
  taskId: string;
  status: 'synced' | 'skipped' | 'failed';
  reason?: string;
  clickupTaskId?: string;
  clickupUrl?: string;
}

export function ClickUpLinkDialog({
  open,
  onOpenChange,
  task,
  clickupListId,
  clickupListName,
}: ClickUpLinkDialogProps) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState<'link' | 'sync' | 'unlink' | null>(null);

  useEffect(() => {
    if (!open) setValue('');
  }, [open]);

  const handleLink = async () => {
    const ref = value.trim();
    if (!ref) {
      toast.error('Paste a ClickUp URL or task id');
      return;
    }
    setBusy('link');
    try {
      const res = await fetchForProject(task.projectId, '/api/clickup/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          projectId: task.projectId,
          clickupRef: ref,
        }),
      });
      const json = (await res.json()) as { error?: string; details?: string };
      if (!res.ok) {
        toast.error(json.error || 'Failed to link', {
          description: json.details,
        });
        return;
      }
      toast.success('Linked to ClickUp — synced fields will update on the next change');
      setValue('');
      onOpenChange(false);
    } finally {
      setBusy(null);
    }
  };

  const handleSyncCreate = async () => {
    if (!clickupListId) {
      toast.error('Link a ClickUp list to this project first');
      return;
    }
    setBusy('sync');
    try {
      const res = await fetchForProject(task.projectId, '/api/clickup/sync-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: task.projectId, taskIds: [task.id] }),
      });
      const json = (await res.json()) as {
        error?: string;
        details?: string;
        results?: SyncCreateResult[];
      };
      if (!res.ok) {
        toast.error(json.error || 'Failed to sync to ClickUp', {
          description: json.details,
          duration: 10_000,
        });
        return;
      }

      const result = json.results?.[0];
      if (result?.status === 'synced') {
        toast.success('Created and linked ClickUp task');
        onOpenChange(false);
      } else if (result?.reason === 'sync-in-progress') {
        toast.info('This task is already syncing to ClickUp');
        onOpenChange(false);
      } else if (result?.reason === 'already-linked') {
        toast.info('This task is already linked to ClickUp');
        onOpenChange(false);
      } else {
        toast.error('Could not create ClickUp task', {
          description: result?.reason ?? 'Unknown sync result',
          duration: 10_000,
        });
      }
    } finally {
      setBusy(null);
    }
  };

  const handleUnlink = async () => {
    if (!confirm('Unlink this task from ClickUp? The local task is kept; future ClickUp changes will not sync.')) {
      return;
    }
    setBusy('unlink');
    try {
      const url = `/api/clickup/link?taskId=${encodeURIComponent(task.id)}&projectId=${encodeURIComponent(task.projectId)}`;
      const res = await fetchForProject(task.projectId, url, { method: 'DELETE' });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || 'Failed to unlink');
        return;
      }
      toast.success('Unlinked');
      onOpenChange(false);
    } finally {
      setBusy(null);
    }
  };

  const isLinked = Boolean(task.clickupTaskId);
  const isSyncing = isClickUpCreateSyncPending(task);
  const hasListBinding = Boolean(clickupListId);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busy) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isLinked ? 'ClickUp link' : 'Sync or link ClickUp'}</DialogTitle>
          <DialogDescription>
            {isLinked
              ? 'This task is linked. Dashboard edits push to ClickUp, and ClickUp webhooks keep the local task fresh.'
              : 'Create a new ClickUp task in the linked list, or paste an existing ClickUp task URL to connect it.'}
          </DialogDescription>
        </DialogHeader>

        {task.clickupSyncError && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Last ClickUp sync failed</p>
                <p className="text-xs mt-0.5 break-words">{task.clickupSyncError}</p>
              </div>
            </div>
          </div>
        )}

        {isLinked ? (
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Task id: </span>
              <code className="text-xs">{task.clickupTaskId}</code>
            </div>
            {task.clickupUrl && (
              <a
                href={task.clickupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline text-sm"
              >
                Open in ClickUp
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Create in ClickUp</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {hasListBinding
                      ? `Creates a task in ${clickupListName ?? 'the linked ClickUp list'} and links it back here.`
                      : 'Link a ClickUp list to this project before creating tasks in ClickUp.'}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={handleSyncCreate}
                  disabled={!hasListBinding || busy !== null || isSyncing}
                >
                  {busy === 'sync' || isSyncing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <UploadCloud className="h-4 w-4 mr-2" />
                  )}
                  {isSyncing ? 'Syncing' : 'Create'}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="clickup-ref">Existing ClickUp URL or task id</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="clickup-ref"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="https://app.clickup.com/t/abc123"
                  disabled={busy !== null}
                  autoFocus
                />
                <Button
                  variant="outline"
                  onClick={handleLink}
                  disabled={busy !== null || !value.trim()}
                >
                  {busy === 'link' ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4 mr-2" />
                  )}
                  Link
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {isLinked ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy !== null}>
                Close
              </Button>
              <Button variant="destructive" onClick={handleUnlink} disabled={busy !== null}>
                {busy === 'unlink' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Unlink
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy !== null}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
