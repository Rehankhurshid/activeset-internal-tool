'use client';

import { useState } from 'react';
import { Loader2, Link2, Unlink, ExternalLink, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchForProject } from '@/lib/api-client';

interface ClickUpListLinkCardProps {
  projectId: string;
  clickupListId?: string;
  clickupListName?: string;
  syncableTaskIds?: string[];
}

export function ClickUpListLinkCard({
  projectId,
  clickupListId,
  clickupListName,
  syncableTaskIds = [],
}: ClickUpListLinkCardProps) {
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState<'link' | 'unlink' | 'sync' | null>(null);

  const isLinked = Boolean(clickupListId);
  const syncableCount = syncableTaskIds.length;

  const handleLink = async () => {
    const value = ref.trim();
    if (!value) {
      toast.error('Paste a ClickUp list URL or numeric id');
      return;
    }
    setBusy('link');
    try {
      const res = await fetchForProject(projectId, '/api/clickup/link-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, clickupListRef: value }),
      });
      const data = (await res.json()) as {
        error?: string;
        details?: string;
        listName?: string;
        totalTasks?: number;
        created?: number;
        updated?: number;
        skipped?: number;
      };
      if (!res.ok) {
        toast.error(data.error || 'Failed to link list', {
          description: data.details,
          duration: 10_000,
        });
        return;
      }
      const summary = `Linked "${data.listName}" — ${data.created ?? 0} new, ${data.updated ?? 0} updated${
        data.skipped ? `, ${data.skipped} skipped` : ''
      }.`;
      toast.success(summary, { duration: 8_000 });
      setRef('');
    } finally {
      setBusy(null);
    }
  };

  const handleUnlink = async () => {
    if (!confirm(
      `Unlink "${clickupListName ?? 'this ClickUp list'}"? Existing imported tasks stay linked individually until ClickUp tells us otherwise — only the project's auto-import binding is removed.`,
    )) return;
    setBusy('unlink');
    try {
      const url = `/api/clickup/link-list?projectId=${encodeURIComponent(projectId)}`;
      const res = await fetchForProject(projectId, url, { method: 'DELETE' });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error || 'Failed to unlink');
        return;
      }
      toast.success('List unlinked');
    } finally {
      setBusy(null);
    }
  };

  const handleSyncLocal = async () => {
    if (!clickupListId || syncableTaskIds.length === 0) return;
    setBusy('sync');
    try {
      const res = await fetchForProject(projectId, '/api/clickup/sync-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, taskIds: syncableTaskIds }),
      });
      const data = (await res.json()) as {
        error?: string;
        details?: string;
        results?: Array<{ status: 'synced' | 'skipped' | 'failed'; reason?: string }>;
      };
      if (!res.ok) {
        toast.error(data.error || 'Failed to sync local tasks', {
          description: data.details,
          duration: 10_000,
        });
        return;
      }

      const results = data.results ?? [];
      const synced = results.filter((r) => r.status === 'synced').length;
      const failed = results.filter((r) => r.status === 'failed').length;
      const skipped = results.filter((r) => r.status === 'skipped').length;
      if (failed > 0) {
        toast.error(`Synced ${synced}; ${failed} failed`, {
          description: skipped > 0 ? `${skipped} skipped` : undefined,
          duration: 10_000,
        });
      } else if (synced > 0) {
        toast.success(`Synced ${synced} local task${synced === 1 ? '' : 's'} to ClickUp`, {
          description: skipped > 0 ? `${skipped} skipped` : undefined,
        });
      } else {
        toast.info('No local tasks needed syncing', {
          description: skipped > 0 ? `${skipped} skipped` : undefined,
        });
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border-dashed">
      <CardContent className="py-3 px-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <Link2 className="h-4 w-4 text-violet-500 flex-shrink-0" />
        {isLinked ? (
          <>
            <div className="flex-1 min-w-0 text-sm">
              <span className="text-muted-foreground">Auto-syncing from ClickUp list </span>
              <span className="font-medium">{clickupListName ?? 'list'}</span>
              <a
                href={`https://app.clickup.com/${process.env.NEXT_PUBLIC_CLICKUP_TEAM_ID ?? ''}/v/li/${clickupListId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 inline-flex items-center text-xs text-blue-600 hover:underline"
              >
                Open <ExternalLink className="h-3 w-3 ml-0.5" />
              </a>
              <p className="text-xs text-muted-foreground mt-0.5">
                New tasks added to that list will appear here automatically. Local tasks can be pushed to this list and linked back.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncLocal}
              disabled={busy !== null || syncableCount === 0}
              title={
                syncableCount === 0
                  ? 'All local tasks are already linked or syncing'
                  : `Create and link ${syncableCount} local task${syncableCount === 1 ? '' : 's'} in ClickUp`
              }
            >
              {busy === 'sync' ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <UploadCloud className="h-3.5 w-3.5 mr-1.5" />
              )}
              Sync local{syncableCount > 0 ? ` (${syncableCount})` : ''}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnlink}
              disabled={busy !== null}
            >
              {busy === 'unlink' ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Unlink className="h-3.5 w-3.5 mr-1.5" />
              )}
              Unlink
            </Button>
          </>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <Input
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="Paste a ClickUp list URL (https://app.clickup.com/.../v/li/678) to bulk-import all tasks"
                disabled={busy !== null}
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleLink();
                  }
                }}
              />
            </div>
            <Button
              size="sm"
              onClick={handleLink}
              disabled={busy !== null || !ref.trim()}
            >
              {busy === 'link' ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Link2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              Link list
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
