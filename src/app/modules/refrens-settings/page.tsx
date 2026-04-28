'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/modules/auth-access';
import { fetchAuthed } from '@/lib/api-client';
import { AppNavigation } from '@/shared/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, CheckCircle2, AlertCircle, Trash2, Plug, Receipt } from 'lucide-react';
import { toast } from 'sonner';

interface ConfigStatus {
  configured: boolean;
  urlKey: string | null;
  appId: string | null;
  updatedAt: string | null;
}

interface TestResult {
  ok: boolean;
  total?: number | null;
  sample?: { invoiceNumber: string | number | null; status: string | null; createdAt: string | null } | null;
  error?: string;
  status?: number;
}

export default function RefrensSettingsPage() {
  const { user, loading: authLoading, isAdmin, signInWithGoogle } = useAuth();
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [urlKey, setUrlKey] = useState('');
  const [appId, setAppId] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [lastTest, setLastTest] = useState<TestResult | null>(null);

  const loadStatus = async () => {
    setStatusLoading(true);
    try {
      const res = await fetchAuthed('/api/refrens/config');
      if (!res.ok) throw new Error(`Failed to load config (${res.status})`);
      const data = (await res.json()) as ConfigStatus;
      setStatus(data);
      if (data.urlKey) setUrlKey(data.urlKey);
      if (data.appId) setAppId(data.appId);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load Refrens config');
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !isAdmin) return;
    loadStatus();
  }, [user, isAdmin]);

  const handleSave = async () => {
    if (!urlKey.trim() || !appId.trim() || !privateKey.trim()) {
      toast.error('URL key, App ID and Private key are all required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetchAuthed('/api/refrens/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urlKey: urlKey.trim(),
          appId: appId.trim(),
          privateKey: privateKey.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
      toast.success('Refrens credentials saved');
      setPrivateKey('');
      await loadStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setLastTest(null);
    try {
      const res = await fetchAuthed('/api/refrens/test');
      const data = (await res.json()) as TestResult;
      setLastTest(data);
      if (data.ok) {
        toast.success(
          data.sample
            ? `Connected — most recent invoice #${data.sample.invoiceNumber ?? '—'}`
            : 'Connected — no invoices found yet'
        );
      } else {
        toast.error(data.error || 'Connection failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      setLastTest({ ok: false, error: message });
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetchAuthed('/api/refrens/config', { method: 'DELETE' });
      if (!res.ok) throw new Error(`Disconnect failed (${res.status})`);
      toast.success('Refrens disconnected');
      setLastTest(null);
      setUrlKey('');
      setAppId('');
      setPrivateKey('');
      await loadStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setDisconnecting(false);
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
        <AppNavigation title="Refrens Settings" showBackButton backHref="/modules/project-links" />
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppNavigation title="Refrens Settings" showBackButton backHref="/modules/project-links" />
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6" />
            Refrens Invoice Integration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your Refrens account so projects can track invoices. The private key is stored
            server-side and used to mint short-lived JWTs on demand — never exposed to the client.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Connection
              {statusLoading ? (
                <Skeleton className="h-5 w-20" />
              ) : status?.configured ? (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Configured
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                  Not configured
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Find these in your Refrens account under <span className="font-mono">Settings → API</span>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="urlKey">Business URL key</Label>
              <Input
                id="urlKey"
                value={urlKey}
                onChange={(e) => setUrlKey(e.target.value)}
                placeholder="my-business"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                The slug from your Refrens URL — e.g. for refrens.com/<span className="font-mono">my-business</span>{' '}
                enter <span className="font-mono">my-business</span>.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="appId">App ID</Label>
              <Input
                id="appId"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="my-business-XXXXX"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="privateKey">EC Private key (PEM)</Label>
              <Textarea
                id="privateKey"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                placeholder={
                  status?.configured
                    ? '•••••••• (paste again to replace)'
                    : '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'
                }
                autoComplete="off"
                spellCheck={false}
                rows={6}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Paste the entire PEM block. Stored server-side only — never displayed back. Used to sign
                ES256 JWTs on demand.
              </p>
            </div>

            {status?.updatedAt && (
              <p className="text-xs text-muted-foreground">
                Last updated {new Date(status.updatedAt).toLocaleString()}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button
                onClick={handleSave}
                disabled={saving || !urlKey.trim() || !appId.trim() || !privateKey.trim()}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {status?.configured ? 'Replace' : 'Save'}
              </Button>
              <Button
                variant="outline"
                onClick={handleTest}
                disabled={testing || !status?.configured}
              >
                {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plug className="mr-2 h-4 w-4" />}
                Test connection
              </Button>
              {status?.configured && (
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive ml-auto"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                >
                  {disconnecting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Disconnect
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {lastTest && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {lastTest.ok ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Connection OK
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    Connection failed
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              {lastTest.ok ? (
                <>
                  <p>
                    Total invoices: <span className="font-mono">{lastTest.total ?? '—'}</span>
                  </p>
                  {lastTest.sample ? (
                    <p>
                      Latest: <span className="font-mono">#{lastTest.sample.invoiceNumber ?? '—'}</span>{' '}
                      <span className="text-muted-foreground">({lastTest.sample.status ?? 'unknown'})</span>
                    </p>
                  ) : (
                    <p className="text-muted-foreground">No invoices found in this account yet.</p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-destructive">{lastTest.error}</p>
                  {typeof lastTest.status === 'number' && (
                    <p className="text-xs text-muted-foreground">HTTP {lastTest.status}</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
