'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { AppNavigation } from '@/shared/ui';
import { useAuth } from '@/modules/auth-access';
import { fetchAuthed, fetchForProject } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertCircle,
  Clock,
  Copy,
  ExternalLink,
  Inbox,
  Loader2,
  RefreshCw,
  RotateCw,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import type { IntakeDashboardResponse, ProjectIntakeSummary } from '@/types';

interface IntakeSettingsResponse {
  ok: boolean;
  intakeEnabled: boolean;
  intakeAutoCreate: boolean;
  intakeToken: string | null;
  intakeWelcomeMessage: string | null;
  intakeUpdatedAt: string | null;
  hasClickUpList: boolean;
  clickupListName?: string | null;
}

function formatRelative(iso?: string): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StatTile({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: 'neutral' | 'warning' | 'danger' | 'success';
  icon: React.ComponentType<{ className?: string }>;
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-destructive'
      : tone === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : tone === 'success'
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-foreground';
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </p>
          <Icon className={`h-4 w-4 ${toneClass}`} />
        </div>
        <p className={`text-3xl font-bold ${toneClass}`}>{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function ProjectRow({
  project,
  onCopyLink,
  onConfigure,
}: {
  project: ProjectIntakeSummary;
  onCopyLink: (token: string | undefined) => void;
  onConfigure: (project: ProjectIntakeSummary) => void;
}) {
  const issues = project.blockedAgingCount + project.staleCount + project.reviewAgingCount;
  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex flex-col">
          <span>{project.projectName}</span>
          {project.client && (
            <span className="text-xs text-muted-foreground">{project.client}</span>
          )}
        </div>
      </TableCell>
      <TableCell>
        {project.clickupListId ? (
          <Badge variant="secondary" className="font-mono text-[10px]">
            {project.clickupListName || project.clickupListId}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">unlinked</span>
        )}
      </TableCell>
      <TableCell className="text-center">{project.open + project.inProgress}</TableCell>
      <TableCell className="text-center">
        {project.blocked > 0 ? (
          <span className="text-destructive font-semibold">{project.blocked}</span>
        ) : (
          project.blocked
        )}
      </TableCell>
      <TableCell className="text-center">
        {issues > 0 ? (
          <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">
            {issues}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-center">
        {project.untriagedRequests > 0 ? (
          <Badge className="bg-purple-500 hover:bg-purple-600">
            {project.untriagedRequests}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {project.intakeEnabled && project.intakeToken && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCopyLink(project.intakeToken)}
              title="Copy public intake URL"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onConfigure(project)}>
            Configure
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function IntakeConfigPanel({
  project,
  onClose,
  onSaved,
}: {
  project: ProjectIntakeSummary;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [settings, setSettings] = useState<IntakeSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [welcomeDraft, setWelcomeDraft] = useState('');
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchForProject(
        project.projectId,
        `/api/clickup/intake-settings?projectId=${encodeURIComponent(project.projectId)}`,
      );
      const data = (await res.json()) as IntakeSettingsResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || `Load failed (${res.status})`);
      setSettings(data);
      setWelcomeDraft(data.intakeWelcomeMessage || '');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [project.projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (patch: {
    enabled?: boolean;
    autoCreate?: boolean;
    rotate?: boolean;
    welcomeMessage?: string | null;
  }) => {
    setSaving(true);
    try {
      const res = await fetchForProject(project.projectId, '/api/clickup/intake-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.projectId, ...patch }),
      });
      const data = (await res.json()) as IntakeSettingsResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
      setSettings(data);
      setWelcomeDraft(data.intakeWelcomeMessage || '');
      onSaved();
      toast.success('Intake settings updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const intakeUrl = settings?.intakeToken ? `${origin}/intake/${settings.intakeToken}` : '';

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Inbox className="h-5 w-5" />
              Intake — {project.projectName}
            </CardTitle>
            <CardDescription>
              {project.client && (
                <span className="text-xs">{project.client} · </span>
              )}
              {settings?.clickupListName ? (
                <>Linked to ClickUp list <span className="font-mono">{settings.clickupListName}</span></>
              ) : (
                'No ClickUp list linked yet — link one from the project page first.'
              )}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading || !settings ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label className="font-medium">Public intake</Label>
                <p className="text-xs text-muted-foreground">
                  Generates a shareable URL the client can use without a workspace seat.
                </p>
              </div>
              <Switch
                checked={settings.intakeEnabled}
                onCheckedChange={(v) => save({ enabled: v })}
                disabled={saving}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label className="font-medium flex items-center gap-1.5">
                  Auto-route to ClickUp
                  <Sparkles className="h-3 w-3 text-purple-500" />
                </Label>
                <p className="text-xs text-muted-foreground">
                  When on, submissions immediately become ClickUp tasks (AI splits bundled
                  lists). When off, requests stage for manual triage.
                </p>
              </div>
              <Switch
                checked={settings.intakeAutoCreate}
                onCheckedChange={(v) => save({ autoCreate: v })}
                disabled={saving || !settings.hasClickUpList}
              />
            </div>

            {!settings.hasClickUpList && settings.intakeAutoCreate === false && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50/40 dark:bg-amber-900/10 p-2 text-xs">
                <AlertCircle className="h-3.5 w-3.5 text-amber-600 mt-0.5" />
                <p className="text-muted-foreground">
                  Auto-routing requires a linked ClickUp list. Link one from the project&apos;s Tasks
                  tab first.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="welcome">Welcome message (optional)</Label>
              <Textarea
                id="welcome"
                value={welcomeDraft}
                onChange={(e) => setWelcomeDraft(e.target.value)}
                placeholder="Drop your change request below. Bullet lists are fine — we will split them into tasks."
                rows={3}
                maxLength={600}
                disabled={saving}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => save({ welcomeMessage: welcomeDraft.trim() || null })}
                  disabled={saving}
                >
                  Save welcome message
                </Button>
              </div>
            </div>

            {settings.intakeEnabled && settings.intakeToken && (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Public intake URL
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={intakeUrl}
                    readOnly
                    className="font-mono text-xs"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard.writeText(intakeUrl);
                      toast.success('URL copied');
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={intakeUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-xs text-muted-foreground">
                    Updated {formatRelative(settings.intakeUpdatedAt ?? undefined)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (
                        !confirm(
                          'Rotate the URL? The old link will stop working immediately for anyone who has it.',
                        )
                      )
                        return;
                      save({ rotate: true });
                    }}
                    disabled={saving}
                  >
                    <RotateCw className="h-3.5 w-3.5 mr-1" />
                    Rotate
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function IntakeCommandCenterScreen() {
  const { user, loading: authLoading, isAdmin, signInWithGoogle } = useAuth();
  const [data, setData] = useState<IntakeDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<ProjectIntakeSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAuthed('/api/clickup/dashboard');
      const json = (await res.json()) as IntakeDashboardResponse & { error?: string };
      if (!res.ok) throw new Error(json.error || `Load failed (${res.status})`);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const linkedProjects = useMemo(
    () => (data?.projects ?? []).filter((p) => p.clickupListId),
    [data],
  );

  const onCopyLink = useCallback((token: string | undefined) => {
    if (!token) {
      toast.error('No intake link available');
      return;
    }
    const url = `${window.location.origin}/intake/${token}`;
    void navigator.clipboard.writeText(url);
    toast.success('Intake URL copied');
  }, []);

  if (authLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <p>Please sign in to continue.</p>
        <Button onClick={signInWithGoogle}>Sign In</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppNavigation title="Client Intake" showBackButton backHref="/" />
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Inbox className="h-6 w-6" />
              Client Intake — Command Center
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              One pane across every linked project. Spot what&apos;s blocked, untriaged, or aging — and
              hand each client a public intake URL that replaces the guest-seat / Word-doc
              workflow.
            </p>
          </div>
          <Button onClick={load} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="pt-4 pb-4 text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
              <span className="text-destructive">{error}</span>
            </CardContent>
          </Card>
        )}

        {!isAdmin && (
          <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/10">
            <CardContent className="pt-4 pb-4 text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
              <span className="text-muted-foreground">
                Read-only view — admins can configure per-project intake settings.
              </span>
            </CardContent>
          </Card>
        )}

        {loading && !data ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : data ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                label="Linked projects"
                value={data.totals.projects}
                hint={`${data.totals.open} open tasks total`}
                tone="neutral"
                icon={Inbox}
              />
              <StatTile
                label="Untriaged requests"
                value={data.totals.untriagedRequests}
                hint="From public intake"
                tone={data.totals.untriagedRequests > 0 ? 'warning' : 'neutral'}
                icon={Sparkles}
              />
              <StatTile
                label="Blocked aging"
                value={data.totals.blockedAgingCount}
                hint=">5d in blocked"
                tone={data.totals.blockedAgingCount > 0 ? 'danger' : 'success'}
                icon={TriangleAlert}
              />
              <StatTile
                label="Stale open"
                value={data.totals.staleCount}
                hint=">14d untouched, missing owner/due"
                tone={data.totals.staleCount > 0 ? 'warning' : 'success'}
                icon={Clock}
              />
            </section>

            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="links">Intake links</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">All linked projects</CardTitle>
                    <CardDescription>
                      Sorted by pain — projects with the most blocked, stale, or untriaged work
                      bubble to the top.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Project</TableHead>
                            <TableHead>List</TableHead>
                            <TableHead className="text-center">Open</TableHead>
                            <TableHead className="text-center">Blocked</TableHead>
                            <TableHead className="text-center">Aging</TableHead>
                            <TableHead className="text-center">Untriaged</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {linkedProjects.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                                No projects with ClickUp lists linked yet. Link a list from any
                                project&apos;s Tasks tab to populate this view.
                              </TableCell>
                            </TableRow>
                          ) : (
                            linkedProjects.map((project) => (
                              <ProjectRow
                                key={project.projectId}
                                project={project}
                                onCopyLink={onCopyLink}
                                onConfigure={(p) => setActiveProject(p)}
                              />
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="links" className="space-y-4">
                {activeProject && (
                  <IntakeConfigPanel
                    project={activeProject}
                    onClose={() => setActiveProject(null)}
                    onSaved={load}
                  />
                )}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Per-project intake links</CardTitle>
                    <CardDescription>
                      Pick a project to enable its public intake URL or change its routing
                      behavior. Replaces the &ldquo;client as paid guest seat&rdquo; model.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Project</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Routing</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(data.projects || []).map((project) => (
                            <TableRow key={project.projectId}>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="font-medium">{project.projectName}</span>
                                  {project.client && (
                                    <span className="text-xs text-muted-foreground">
                                      {project.client}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {project.intakeEnabled ? (
                                  <Badge className="bg-emerald-500 hover:bg-emerald-600">
                                    Live
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground">
                                    Off
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {project.intakeAutoCreate ? (
                                  <Badge variant="secondary" className="gap-1">
                                    <Sparkles className="h-3 w-3 text-purple-500" />
                                    Auto-route
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    Triage queue
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  {project.intakeEnabled && project.intakeToken && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => onCopyLink(project.intakeToken)}
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setActiveProject(project)}
                                  >
                                    Configure
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <p className="text-xs text-muted-foreground">
              {loading ? (
                <Loader2 className="inline h-3 w-3 animate-spin mr-1" />
              ) : null}
              Generated {data?.generatedAt ? formatRelative(data.generatedAt) : '—'} · Stats reflect
              tasks mirrored locally (synced via webhook + drift cron).
            </p>
          </>
        ) : null}
      </main>
    </div>
  );
}
