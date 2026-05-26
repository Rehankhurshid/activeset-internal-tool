'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Loader2,
  MessageSquareText,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings2,
} from 'lucide-react';
import { toast } from 'sonner';

import { projectLinksRepository } from '@/modules/project-links/infrastructure/project-links.repository';
import { requestsService, tasksService } from '@/services/database';
import { fetchForProject } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type {
  DailyControlSignal,
  DailyControlQaUrlSource,
  DailyControlSnapshot,
  DailyControlTaskRef,
  Project,
} from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

interface ProjectControlCenterProps {
  project: Project;
  userEmail: string;
}

type BusyAction = 'load' | 'save' | 'import' | 'run' | 'draft' | 'task' | null;

const STATUS_STYLES: Record<DailyControlSnapshot['status'], string> = {
  empty: 'border-muted-foreground/30 text-muted-foreground',
  active: 'border-blue-500/40 text-blue-600 dark:text-blue-400',
  blocked: 'border-amber-500/50 text-amber-600 dark:text-amber-400',
  qa_failed: 'border-rose-500/50 text-rose-600 dark:text-rose-400',
  all_clear: 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400',
};

const STATUS_LABELS: Record<DailyControlSnapshot['status'], string> = {
  empty: 'No signal',
  active: 'Active',
  blocked: 'Blocked',
  qa_failed: 'QA failed',
  all_clear: 'All clear',
};

export function ProjectControlCenter({ project, userEmail }: ProjectControlCenterProps) {
  const [snapshot, setSnapshot] = useState<DailyControlSnapshot | null>(null);
  const [busy, setBusy] = useState<BusyAction>('load');
  const [slackChannelsText, setSlackChannelsText] = useState(project.slackChannelIds?.join('\n') ?? '');
  const [qaUrlSource, setQaUrlSource] = useState<DailyControlQaUrlSource>(project.qaUrlSource ?? 'auto_links');
  const [qaUrlsText, setQaUrlsText] = useState(project.qaUrls?.join('\n') ?? '');
  const [reviewOwnerEmail, setReviewOwnerEmail] = useState(project.reviewOwnerEmail ?? '');
  const [clientNotes, setClientNotes] = useState(project.clientUpdatePreferences?.notes ?? '');

  useEffect(() => {
    setSlackChannelsText(project.slackChannelIds?.join('\n') ?? '');
    setQaUrlSource(project.qaUrlSource ?? 'auto_links');
    setQaUrlsText(project.qaUrls?.join('\n') ?? '');
    setReviewOwnerEmail(project.reviewOwnerEmail ?? '');
    setClientNotes(project.clientUpdatePreferences?.notes ?? '');
  }, [
    project.clientUpdatePreferences?.notes,
    project.qaUrlSource,
    project.qaUrls,
    project.reviewOwnerEmail,
    project.slackChannelIds,
  ]);

  const loadSnapshot = async () => {
    setBusy((current) => current ?? 'load');
    try {
      const res = await fetchForProject(project.id, `/api/projects/${project.id}/control/today`);
      const data = (await res.json()) as { ok?: boolean; snapshot?: DailyControlSnapshot | null; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load control snapshot');
      setSnapshot(data.snapshot ?? null);
    } catch (error) {
      console.error('[ProjectControlCenter] load failed', error);
      toast.error(error instanceof Error ? error.message : 'Failed to load control snapshot');
    } finally {
      setBusy((current) => (current === 'load' ? null : current));
    }
  };

  useEffect(() => {
    void loadSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const slackChannelIds = useMemo(
    () => slackChannelsText.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean),
    [slackChannelsText],
  );
  const qaUrls = useMemo(
    () => qaUrlsText.split(/[\n,]+/).map((url) => url.trim()).filter(Boolean),
    [qaUrlsText],
  );

  const saveConfig = async () => {
    setBusy('save');
    try {
      await projectLinksRepository.updateProjectControlSettings(project.id, {
        slackChannelIds,
        qaUrlSource,
        qaUrls,
        reviewOwnerEmail: reviewOwnerEmail.trim() || undefined,
        clientUpdatePreferences: {
          cadence: 'daily',
          channel: 'slack',
          notes: clientNotes.trim() || undefined,
        },
      });
      toast.success('Control settings saved');
    } catch (error) {
      console.error('[ProjectControlCenter] save failed', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save control settings');
    } finally {
      setBusy(null);
    }
  };

  const importSlack = async () => {
    setBusy('import');
    try {
      const res = await fetchForProject(project.id, `/api/projects/${project.id}/slack/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lookbackHours: 168, maxMessagesPerChannel: 100 }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        imported?: number;
        skipped?: number;
        reason?: string;
        errors?: string[];
      };
      if (!res.ok) throw new Error(data.reason || 'Slack import failed');
      if (data.ok === false) {
        toast.warning(data.reason || 'Slack import skipped');
      } else {
        toast.success(`Imported ${data.imported ?? 0} Slack request${data.imported === 1 ? '' : 's'}`);
      }
      await runControl(false);
    } catch (error) {
      console.error('[ProjectControlCenter] Slack import failed', error);
      toast.error(error instanceof Error ? error.message : 'Slack import failed');
    } finally {
      setBusy(null);
    }
  };

  const runControl = async (showBusy = true) => {
    if (showBusy) setBusy('run');
    try {
      const res = await fetchForProject(project.id, `/api/projects/${project.id}/control/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeSlackImport: showBusy, lookbackHours: 36 }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        snapshot?: DailyControlSnapshot;
        reason?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.snapshot) throw new Error(data.reason || data.error || 'Control run failed');
      setSnapshot(data.snapshot);
      if (showBusy) toast.success('Control snapshot updated');
    } catch (error) {
      console.error('[ProjectControlCenter] run failed', error);
      toast.error(error instanceof Error ? error.message : 'Control run failed');
    } finally {
      if (showBusy) setBusy(null);
    }
  };

  const draftUpdate = async () => {
    setBusy('draft');
    try {
      const res = await fetchForProject(project.id, `/api/projects/${project.id}/client-update/draft`, {
        method: 'POST',
      });
      const data = (await res.json()) as {
        ok?: boolean;
        snapshot?: DailyControlSnapshot;
        reason?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.snapshot) throw new Error(data.reason || data.error || 'Draft failed');
      setSnapshot(data.snapshot);
      toast.success('Client update draft refreshed');
    } catch (error) {
      console.error('[ProjectControlCenter] draft failed', error);
      toast.error(error instanceof Error ? error.message : 'Draft failed');
    } finally {
      setBusy(null);
    }
  };

  const copyDraft = async () => {
    const text = snapshot?.clientUpdateDraft?.text;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Draft copied');
    } catch {
      toast.error('Could not copy draft');
    }
  };

  const createTaskFromSignal = async (signal: DailyControlSignal) => {
    if (!signal.requestId) return;
    setBusy('task');
    try {
      const taskId = await tasksService.createTask({
        projectId: project.id,
        requestId: signal.requestId,
        title: signal.summary,
        description: signal.rawText && signal.rawText !== signal.summary ? signal.rawText : undefined,
        category: 'other',
        status: signal.isBlocker ? 'blocked' : 'todo',
        priority: signal.isBlocker ? 'urgent' : 'medium',
        tags: ['daily-control'],
        source: 'slack',
        sourceLink: signal.sourceLink,
        slack: signal.slack,
        dedupeKey: signal.dedupeKey,
        pageUrl: signal.pageUrl,
        qaStatus: signal.pageUrl ? 'not_run' : undefined,
        isBlocker: signal.isBlocker,
        needsClientInput: signal.needsClientInput,
        confidence: signal.confidence,
        createdBy: userEmail || 'daily-control',
      });
      await requestsService.markRequestParsed(signal.requestId, [taskId]);
      toast.success('Task created from Slack signal');
      await runControl(false);
    } catch (error) {
      console.error('[ProjectControlCenter] task creation failed', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create task');
    } finally {
      setBusy(null);
    }
  };

  if (busy === 'load') {
    return <Skeleton className="h-[420px] w-full" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Daily Control</h2>
            {snapshot && (
              <Badge variant="outline" className={cn('h-6', STATUS_STYLES[snapshot.status])}>
                {STATUS_LABELS[snapshot.status]}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {snapshot ? `Last run ${new Date(snapshot.updatedAt).toLocaleString()}` : 'No control snapshot for today.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={loadSnapshot} disabled={busy !== null}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={importSlack} disabled={busy !== null || slackChannelIds.length === 0}>
            {busy === 'import' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquareText className="mr-2 h-4 w-4" />}
            Import Slack
          </Button>
          <Button size="sm" onClick={() => runControl(true)} disabled={busy !== null}>
            {busy === 'run' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Run Control
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Signals" value={snapshot?.summary.signalCount ?? 0} />
        <MetricCard label="Open Tasks" value={snapshot?.summary.openTaskCount ?? 0} />
        <MetricCard label="Blockers" value={snapshot?.summary.blockerCount ?? 0} tone="warning" />
        <MetricCard label="QA Issues" value={snapshot?.summary.qaFailedCount ?? 0} tone="danger" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Panel title="Today's Signals" empty={!snapshot || snapshot.signals.length === 0}>
            {snapshot?.signals.map((signal) => (
              <div key={signal.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{signal.sender ?? 'Slack'}</Badge>
                  {signal.isBlocker && <Badge variant="destructive">Blocker</Badge>}
                  {signal.needsClientInput && <Badge variant="outline">Client input</Badge>}
                  <span className="text-xs text-muted-foreground">{new Date(signal.receivedAt).toLocaleString()}</span>
                </div>
                <p className="mt-2 text-sm">{signal.summary}</p>
                {signal.sourceLink && (
                  <a className="mt-2 inline-block text-xs text-primary hover:underline" href={signal.sourceLink} target="_blank" rel="noreferrer">
                    Open source
                  </a>
                )}
                {signal.requestId && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => createTaskFromSignal(signal)}
                    disabled={busy !== null}
                  >
                    {busy === 'task' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    Create Task
                  </Button>
                )}
              </div>
            ))}
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <TaskPanel title="Blockers" tasks={snapshot?.openBlockers ?? []} emptyLabel="No blockers in the current snapshot." />
            <TaskPanel title="Overdue / No Date" tasks={[...(snapshot?.overdueTasks ?? []), ...(snapshot?.noDateTasks ?? [])]} emptyLabel="No overdue or unscheduled task surfaced." />
          </div>

          <Panel title="QA Gates" empty={!snapshot || snapshot.qaResults.length === 0}>
            {snapshot?.qaResults.map((result) => (
              <div key={result.id} className="flex items-start gap-3 rounded-md border p-3">
                {result.status === 'failed' ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-rose-500" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{result.label}</p>
                    <Badge variant={result.severity === 'critical' ? 'destructive' : 'outline'}>{result.severity}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{result.details}</p>
                  {result.url && <p className="mt-1 truncate text-xs text-muted-foreground">{result.url}</p>}
                </div>
              </div>
            ))}
          </Panel>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="h-4 w-4" />
                Control Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="control-slack">Slack channel IDs</Label>
                <Textarea
                  id="control-slack"
                  value={slackChannelsText}
                  onChange={(event) => setSlackChannelsText(event.target.value)}
                  rows={3}
                  placeholder="C0123456789"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="control-owner">Review owner</Label>
                <Input
                  id="control-owner"
                  value={reviewOwnerEmail}
                  onChange={(event) => setReviewOwnerEmail(event.target.value)}
                  placeholder={userEmail || 'owner@activeset.co'}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="control-qa-source">QA URL source</Label>
                <Select value={qaUrlSource} onValueChange={(value) => setQaUrlSource(value as DailyControlQaUrlSource)}>
                  <SelectTrigger id="control-qa-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto_links">Audit links</SelectItem>
                    <SelectItem value="manual_links">Manual links</SelectItem>
                    <SelectItem value="custom">Custom URLs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {qaUrlSource === 'custom' && (
                <div className="space-y-2">
                  <Label htmlFor="control-qa-urls">Custom QA URLs</Label>
                  <Textarea
                    id="control-qa-urls"
                    value={qaUrlsText}
                    onChange={(event) => setQaUrlsText(event.target.value)}
                    rows={4}
                    placeholder="https://example.com/page"
                    className="font-mono text-sm"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="control-notes">Client update notes</Label>
                <Textarea
                  id="control-notes"
                  value={clientNotes}
                  onChange={(event) => setClientNotes(event.target.value)}
                  rows={3}
                  placeholder="Tone, client preferences, recurring caveats..."
                />
              </div>
              <Button onClick={saveConfig} disabled={busy !== null} className="w-full">
                {busy === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Settings
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Client Draft</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={draftUpdate} disabled={busy !== null} className="flex-1">
                  {busy === 'draft' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Draft
                </Button>
                <Button variant="outline" size="sm" onClick={copyDraft} disabled={!snapshot?.clientUpdateDraft?.text}>
                  <Clipboard className="mr-2 h-4 w-4" />
                  Copy
                </Button>
              </div>
              <Textarea
                value={snapshot?.clientUpdateDraft?.text ?? ''}
                readOnly
                rows={14}
                placeholder="Run Control to generate a draft."
                className="text-sm"
              />
              {(snapshot?.clientUpdateDraft?.redactions?.length ?? 0) > 0 && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    {snapshot?.clientUpdateDraft?.redactions?.map((redaction) => (
                      <p key={redaction} className="text-xs text-muted-foreground">
                        {redaction}
                      </p>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'warning' | 'danger';
}) {
  return (
    <Card>
      <CardContent className="px-4 py-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            'mt-1 text-2xl font-semibold tabular-nums',
            tone === 'warning' && 'text-amber-600 dark:text-amber-400',
            tone === 'danger' && 'text-rose-600 dark:text-rose-400',
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function Panel({
  title,
  empty,
  emptyMessage = 'Nothing surfaced in this section.',
  children,
}: {
  title: string;
  empty: boolean;
  emptyMessage?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="space-y-3 p-4">
        {empty ? <p className="text-sm text-muted-foreground">{emptyMessage}</p> : children}
      </div>
    </section>
  );
}

function TaskPanel({
  title,
  tasks,
  emptyLabel,
}: {
  title: string;
  tasks: DailyControlTaskRef[];
  emptyLabel: string;
}) {
  return (
    <Panel title={title} empty={tasks.length === 0} emptyMessage={emptyLabel}>
      {tasks.map((task) => (
        <div key={task.id} className="rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-medium">{task.title}</p>
            <Badge variant={task.priority === 'urgent' ? 'destructive' : 'outline'}>{task.priority}</Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{task.status.replace(/_/g, ' ')}</span>
            {task.assignee && <span>{task.assignee}</span>}
            {task.dueDate && <span>Due {task.dueDate}</span>}
          </div>
        </div>
      ))}
    </Panel>
  );
}
