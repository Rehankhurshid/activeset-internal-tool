'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  Radar,
  ShieldCheck,
  Unlink,
  UploadCloud,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchForProject } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { TONE_CLASSES, type Tone } from '@/lib/ui-tones';

interface ClickUpListLinkCardProps {
  projectId: string;
  clickupListId?: string;
  clickupListName?: string;
  syncableTaskIds?: string[];
  clickupTaskCount?: number;
  localTaskCount?: number;
  pendingSyncCount?: number;
  failedSyncCount?: number;
}

export function ClickUpListLinkCard({
  projectId,
  clickupListId,
  clickupListName,
  syncableTaskIds = [],
  clickupTaskCount = 0,
  localTaskCount = 0,
  pendingSyncCount = 0,
  failedSyncCount = 0,
}: ClickUpListLinkCardProps) {
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState<'link' | 'unlink' | 'sync' | null>(null);

  const isLinked = Boolean(clickupListId);
  const syncableCount = syncableTaskIds.length;
  const clickupListUrl = clickupListId
    ? `https://app.clickup.com/${process.env.NEXT_PUBLIC_CLICKUP_TEAM_ID ?? ''}/v/li/${clickupListId}`
    : undefined;

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
        deduped?: number;
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
      }${
        data.deduped ? `, ${data.deduped} duplicate${data.deduped === 1 ? '' : 's'} cleaned` : ''
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

  if (!isLinked) {
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-3 text-foreground shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-muted/40 text-muted-foreground">
              <Link2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                ClickUp mirror
              </p>
              <p className="truncate text-sm font-semibold text-foreground">
                Link a list
              </p>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
            <Input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="ClickUp list URL or ID"
              disabled={busy !== null}
              className="h-9 min-w-0 border-border bg-muted/40 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-emerald-500/30"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleLink();
                }
              }}
            />
            <Button
              size="sm"
              onClick={handleLink}
              disabled={busy !== null || !ref.trim()}
              className="h-9 border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-200"
            >
              {busy === 'link' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Link2 className="h-3.5 w-3.5" />
              )}
              Link
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card text-foreground shadow-sm">
      <div className="border-b border-border px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
              <Radar className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  ClickUp mirror
                </p>
                <Badge className="h-5 border-emerald-500/20 bg-emerald-500/10 px-1.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Live
                </Badge>
                {failedSyncCount > 0 && (
                  <Badge className="h-5 border-amber-500/25 bg-amber-500/10 px-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-200">
                    <AlertTriangle className="h-3 w-3" />
                    Issue
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-semibold text-foreground">
                  {clickupListName ?? 'ClickUp list'}
                </p>
                {clickupListUrl && (
                  <a
                    href={clickupListUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title="Open ClickUp list"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2 sm:shrink-0">
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
              className="h-8 flex-1 border-border bg-muted/40 text-foreground hover:bg-muted sm:flex-none"
            >
              {busy === 'sync' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : syncableCount === 0 ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />
              ) : (
                <UploadCloud className="h-3.5 w-3.5" />
              )}
              {syncableCount > 0 ? `Sync ${syncableCount}` : 'Synced'}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleUnlink}
              disabled={busy !== null}
              title="Unlink ClickUp list"
              className="h-8 w-8 border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {busy === 'unlink' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Unlink className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        <SyncMetric
          icon={ShieldCheck}
          label="ClickUp rows"
          value={clickupTaskCount}
          tone="emerald"
        />
        <SyncMetric
          icon={UploadCloud}
          label="Local rows"
          value={localTaskCount}
          tone={syncableCount > 0 ? 'violet' : 'muted'}
        />
        <SyncMetric
          icon={Radar}
          label="Pending"
          value={pendingSyncCount}
          tone={pendingSyncCount > 0 ? 'cyan' : 'muted'}
        />
        <SyncMetric
          icon={AlertTriangle}
          label="Issues"
          value={failedSyncCount}
          tone={failedSyncCount > 0 ? 'amber' : 'muted'}
        />
      </div>
    </div>
  );
}

function SyncMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: Tone;
}) {
  return (
    <div className="min-w-0 bg-card px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
        <span
          className={cn(
            'grid h-6 w-6 shrink-0 place-items-center rounded-md border',
            TONE_CLASSES[tone],
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
