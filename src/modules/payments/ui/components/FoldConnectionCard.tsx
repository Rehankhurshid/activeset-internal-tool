'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Landmark, Loader2, Plug, RefreshCw, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/alert-dialog-confirm';
import { fetchAuthed } from '@/lib/api-client';
import type { FoldConnectionStatus } from '../../domain/payments.types';
import { formatWhen } from '../lib/format';

interface FoldConnectionCardProps {
  status: FoldConnectionStatus;
  onStatus: (status: FoldConnectionStatus) => void;
  onSynced: () => void;
}

export function FoldConnectionCard({ status, onStatus, onSynced }: FoldConnectionCardProps) {
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [selected, setSelected] = useState<string[]>(status.selectedAccountIds);
  const [minAmount, setMinAmount] = useState(String(status.minAmount));
  const [emails, setEmails] = useState(status.notifyEmails.join(', '));

  useEffect(() => {
    setSelected(status.selectedAccountIds);
    setMinAmount(String(status.minAmount));
    setEmails(status.notifyEmails.join(', '));
  }, [status.selectedAccountIds, status.minAmount, status.notifyEmails]);

  const dirty =
    selected.slice().sort().join() !== status.selectedAccountIds.slice().sort().join() ||
    minAmount !== String(status.minAmount) ||
    emails.split(',').map((e) => e.trim()).filter(Boolean).join() !== status.notifyEmails.join();

  const connect = async () => {
    setConnecting(true);
    try {
      const res = await fetchAuthed('/api/payments/fold/connect', { method: 'POST' });
      const data = (await res.json()) as { authorizeUrl?: string; error?: string };
      if (!res.ok || !data.authorizeUrl) throw new Error(data.error ?? `Failed (${res.status})`);
      window.location.href = data.authorizeUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the Fold sign-in');
      setConnecting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetchAuthed('/api/payments/fold', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedAccountIds: selected,
          minAmount: Number(minAmount),
          notifyEmails: emails.split(',').map((e) => e.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      onStatus(data as FoldConnectionStatus);
      toast.success('Saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetchAuthed('/api/payments/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error ?? `Sync failed (${res.status})`);
      toast.success(
        data.created
          ? `${data.created} new ${data.created === 1 ? 'payment' : 'payments'}`
          : `Up to date (${data.fetched ?? 0} credits checked)`
      );
      onSynced();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed');
      onSynced();
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    try {
      const res = await fetchAuthed('/api/payments/fold', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      onStatus(data as FoldConnectionStatus);
      toast.success('Fold disconnected');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not disconnect');
    }
  };

  if (!status.connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4" /> Connect Fold
          </CardTitle>
          <CardDescription>
            Sign in to Fold once. The app then reads new credits on the accounts you pick at 10:00 and 18:00 IST.
            It only ever lists accounts and transactions; it never changes anything in Fold.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={connect} disabled={connecting}>
            {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plug className="mr-2 h-4 w-4" />}
            Connect Fold
          </Button>
        </CardContent>
      </Card>
    );
  }

  const last = status.lastSync;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4" /> Fold
          </CardTitle>
          <CardDescription>
            Connected{status.connectedBy ? ` by ${status.connectedBy}` : ''}. Last sync {formatWhen(last?.at)}
            {last && !last.ok ? ' (failed)' : ''}
            {last?.ok && last.error ? ` · ${last.error}` : ''}.
          </CardDescription>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={syncNow} disabled={syncing || status.needsReconnect}>
            {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Sync now
          </Button>
          <Button size="sm" variant="ghost" onClick={connect} disabled={connecting}>
            <Plug className="mr-2 h-4 w-4" /> Reconnect
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmDisconnect(true)}>
            <Unplug className="mr-2 h-4 w-4" /> Disconnect
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {status.needsReconnect && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Fold sign-in expired</AlertTitle>
            <AlertDescription>Syncing is paused until someone reconnects Fold.</AlertDescription>
          </Alert>
        )}
        {last && !last.ok && last.error && !status.needsReconnect && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Last sync failed</AlertTitle>
            <AlertDescription>{last.error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label>Accounts to read</Label>
          <p className="text-xs text-muted-foreground">
            Only ticked accounts are read. Credits on any other account are never stored.
          </p>
          {status.accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No accounts yet. Press Sync now to load them.</p>
          ) : (
            <div className="space-y-2">
              {status.accounts.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm">
                  <Checkbox
                    checked={selected.includes(a.id)}
                    onCheckedChange={(on) =>
                      setSelected((cur) => (on ? [...cur, a.id] : cur.filter((id) => id !== a.id)))
                    }
                  />
                  <span className="font-medium">{a.bankName}</span>
                  <span className="text-muted-foreground">··{a.maskedNumber.slice(-4)}</span>
                  <span className="text-muted-foreground">{a.accountType?.toLowerCase()}</span>
                  <span className="ml-auto truncate text-muted-foreground">{a.holderName ?? 'No holder name'}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <div className="space-y-2">
            <Label htmlFor="fold-min">Ignore credits under (₹)</Label>
            <Input id="fold-min" inputMode="numeric" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fold-emails">Email new payments to</Label>
            <Input id="fold-emails" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="name@activeset.co, …" />
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Disconnect Fold?"
        description="The app stops reading new credits. Payments already stored stay, and so do your account picks."
        confirmText="Disconnect"
        variant="destructive"
        onConfirm={disconnect}
      />
    </Card>
  );
}
