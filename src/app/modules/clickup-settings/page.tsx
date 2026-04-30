'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/modules/auth-access';
import { fetchAuthed } from '@/lib/api-client';
import { AppNavigation } from '@/shared/ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Plug,
  RefreshCw,
  Link2,
  Eye,
  TestTube2,
} from 'lucide-react';
import { toast } from 'sonner';

interface RegistrationStatus {
  registered: boolean;
  webhookId: string | null;
  teamId: string | null;
  endpoint: string | null;
  registeredAt: string | { _seconds: number } | null;
  hasSecret: boolean;
}

interface TestNagResult {
  ok: boolean;
  testMode?: boolean;
  examined?: number;
  assignees?: number;
  posted?: number;
  note?: string;
  recipient?: string;
  results?: { assignee: string; posted: boolean; reason?: string }[];
}

export default function ClickUpSettingsPage() {
  const { user, loading: authLoading, isAdmin, signInWithGoogle } = useAuth();
  const [status, setStatus] = useState<RegistrationStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [busy, setBusy] = useState<'register' | 'unregister' | 'testnag' | null>(null);
  const [origin, setOrigin] = useState<string>('');
  const [lastTest, setLastTest] = useState<TestNagResult | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  const loadStatus = async () => {
    setStatusLoading(true);
    try {
      const res = await fetchAuthed('/api/clickup/register-webhook');
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error || `Failed to load status (${res.status})`);
      }
      setStatus((await res.json()) as RegistrationStatus);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load status');
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !isAdmin) return;
    loadStatus();
  }, [user, isAdmin]);

  const handleRegister = async () => {
    setBusy('register');
    try {
      const res = await fetchAuthed('/api/clickup/register-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { error?: string; details?: string };
      if (!res.ok) {
        throw new Error(data.error || data.details || `Register failed (${res.status})`);
      }
      toast.success('Webhook registered. ClickUp will start streaming task events.');
      await loadStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Register failed');
    } finally {
      setBusy(null);
    }
  };

  const handleRunTestNag = async () => {
    setBusy('testnag');
    setLastTest(null);
    try {
      const res = await fetchAuthed('/api/clickup/test-nag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as TestNagResult & { error?: string; details?: string };
      if (!res.ok) {
        const summary = data.error || `Test failed (${res.status})`;
        toast.error(summary, {
          description: data.details,
          duration: 12_000,
        });
        return;
      }
      setLastTest(data);
      if ((data.posted ?? 0) === 0) {
        toast(data.note || 'Nothing to test against right now.');
      } else {
        toast.success(
          `Sent ${data.posted} test DM${data.posted === 1 ? '' : 's'} to your Slack — check your DMs from the bot.`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setBusy(null);
    }
  };

  const handleUnregister = async () => {
    if (!confirm('Unregister the ClickUp webhook? Linked tasks stay linked but stop receiving live updates until re-registered.')) {
      return;
    }
    setBusy('unregister');
    try {
      const res = await fetchAuthed('/api/clickup/register-webhook', { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || `Unregister failed (${res.status})`);
      }
      toast.success('Webhook removed');
      await loadStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unregister failed');
    } finally {
      setBusy(null);
    }
  };

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

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <AppNavigation title="ClickUp Settings" showBackButton backHref="/modules/project-links" />
        <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Restricted</CardTitle>
              <CardDescription>This area is admin-only.</CardDescription>
            </CardHeader>
          </Card>
        </main>
      </div>
    );
  }

  const expectedEndpoint = origin ? `${origin}/api/clickup/webhook` : '';
  const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppNavigation title="ClickUp Settings" showBackButton backHref="/modules/project-links" />
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Link2 className="h-6 w-6" />
            ClickUp Sync
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            One-way sync from ClickUp into the in-app task list. Tasks must be linked individually
            from the Tasks tab. Once linked, ClickUp owns the title, status, priority, due date,
            and assignee — they re-sync on every ClickUp change via webhook.
          </p>
        </div>

        {isLocalhost && (
          <Card className="border-amber-300 bg-amber-50/50">
            <CardContent className="pt-4 pb-4 text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <span>
                You&apos;re on <span className="font-mono">{origin}</span>. ClickUp can&apos;t reach
                localhost — register the webhook from the deployed URL, or expose your dev server
                via a tunnel (ngrok / cloudflared) before clicking Register.
              </span>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Webhook
              {statusLoading ? (
                <Skeleton className="h-5 w-20" />
              ) : status?.registered ? (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Registered
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                  Not registered
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={loadStatus}
                disabled={statusLoading}
                className="ml-auto h-7"
                title="Refresh"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${statusLoading ? 'animate-spin' : ''}`} />
              </Button>
            </CardTitle>
            <CardDescription>
              Endpoint ClickUp calls when a linked task changes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Field
              label="Endpoint"
              value={status?.endpoint || expectedEndpoint || '—'}
              mono
            />
            <Field label="Team id" value={status?.teamId || 'Auto-detect'} mono />
            <Field
              label="Webhook id"
              value={status?.webhookId || '—'}
              mono
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {!status?.registered && (
              <Button onClick={handleRegister} disabled={busy !== null}>
                {busy === 'register' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plug className="h-4 w-4 mr-2" />
                )}
                Register webhook
              </Button>
            )}
            {status?.registered && (
              <>
                <Button onClick={handleRegister} disabled={busy !== null} variant="outline">
                  {busy === 'register' ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Re-register (rotate secret)
                </Button>
                <Button
                  onClick={handleUnregister}
                  disabled={busy !== null}
                  variant="destructive"
                >
                  {busy === 'unregister' ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Unregister
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube2 className="h-4 w-4" />
              Test the Nag-Bot
            </CardTitle>
            <CardDescription>
              Runs the bot against today&apos;s overdue / stale tasks but DMs every message to{' '}
              <span className="font-mono">{user?.email}</span> instead of pinging the team. Real
              assignees are NOT @-mentioned — you&apos;ll see exactly what each person would have
              received in a personal DM thread with the bot.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleRunTestNag} disabled={busy !== null}>
              {busy === 'testnag' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <TestTube2 className="h-4 w-4 mr-2" />
              )}
              Run test (DM to me)
            </Button>
            {lastTest && (
              <div className="text-sm border rounded-md p-3 bg-muted/30 space-y-1">
                {(lastTest.posted ?? 0) === 0 ? (
                  <p className="text-muted-foreground">{lastTest.note || 'No tasks matched.'}</p>
                ) : (
                  <>
                    <p>
                      Sent <span className="font-semibold">{lastTest.posted}</span> message
                      {lastTest.posted === 1 ? '' : 's'} covering{' '}
                      <span className="font-semibold">{lastTest.assignees}</span> teammate
                      {lastTest.assignees === 1 ? '' : 's'} (
                      <span className="font-semibold">{lastTest.examined}</span> tasks examined).
                    </p>
                    {lastTest.results && lastTest.results.length > 0 && (
                      <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5 pt-1">
                        {lastTest.results.map((r) => (
                          <li key={r.assignee}>
                            <span className="font-mono">{r.assignee.split('@')[0]}</span>{' '}
                            {r.posted ? '✓ DM sent' : `✗ ${r.reason || 'failed'}`}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Slack Nag-Bot
            </CardTitle>
            <CardDescription>
              The cron <span className="font-mono">/api/cron/nag-tasks</span> runs at 10:00 and 15:00
              ET on weekdays, posts to <span className="font-mono">SLACK_CHANNEL_ID</span>, and
              mentions the assignee using their email-matched Slack id.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>Required Slack bot scopes (api.slack.com/apps → OAuth &amp; Permissions):</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>
                <span className="font-mono">chat:write</span> — post messages
              </li>
              <li>
                <span className="font-mono">users:read.email</span> — resolve <span className="italic">@mention</span> by team-member email
              </li>
            </ul>
            <p className="text-xs text-muted-foreground pt-2">
              After adding scopes, reinstall the app to your workspace so the bot token picks them
              up. The current channel is <span className="font-mono">SLACK_CHANNEL_ID</span> —
              invite the bot user to that channel if it can&apos;t post.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[120px,1fr] gap-2 items-start">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono text-xs break-all' : ''}>{value}</span>
    </div>
  );
}
