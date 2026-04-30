'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
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

interface ClickUpLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task;
}

export function ClickUpLinkDialog({ open, onOpenChange, task }: ClickUpLinkDialogProps) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const handleLink = async () => {
    const ref = value.trim();
    if (!ref) {
      toast.error('Paste a ClickUp URL or task id');
      return;
    }
    setBusy(true);
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
      setBusy(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm('Unlink this task from ClickUp? The local task is kept; future ClickUp changes will not sync.')) {
      return;
    }
    setBusy(true);
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
      setBusy(false);
    }
  };

  const isLinked = Boolean(task.clickupTaskId);

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isLinked ? 'ClickUp link' : 'Link to ClickUp task'}</DialogTitle>
          <DialogDescription>
            {isLinked
              ? 'This task is linked. ClickUp is the source of truth for title, status, priority, due date, and assignee.'
              : 'Paste a ClickUp task URL or task ID. We sync title, status, priority, due date, and assignee from ClickUp from then on.'}
          </DialogDescription>
        </DialogHeader>

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
                className="text-blue-600 hover:underline text-sm"
              >
                Open in ClickUp ↗
              </a>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="clickup-ref">ClickUp URL or task id</Label>
            <Input
              id="clickup-ref"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="https://app.clickup.com/t/abc123"
              disabled={busy}
              autoFocus
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {isLinked ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                Close
              </Button>
              <Button variant="destructive" onClick={handleUnlink} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Unlink
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={handleLink} disabled={busy || !value.trim()}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Link
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
