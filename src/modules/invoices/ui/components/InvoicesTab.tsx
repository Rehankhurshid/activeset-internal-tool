'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, RefreshCw, Settings, Receipt, AlertCircle, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchAuthed } from '@/lib/api-client';
import { CreateInvoiceDialog } from './CreateInvoiceDialog';
import { MapInvoiceDialog } from './MapInvoiceDialog';
import { InvoiceCard } from './InvoiceCard';
import type { ProjectInvoice } from '@/modules/invoices/domain/types';

interface InvoicesTabProps {
  projectId: string;
  defaultClientName?: string;
}

interface ConfigStatus {
  configured: boolean;
}

export function InvoicesTab({ projectId, defaultClientName }: InvoicesTabProps) {
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [invoices, setInvoices] = useState<ProjectInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetchAuthed('/api/refrens/config');
      if (!res.ok) throw new Error(`Config failed (${res.status})`);
      const data = (await res.json()) as ConfigStatus;
      setConfig(data);
    } catch (err) {
      console.error(err);
      setConfig({ configured: false });
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const loadInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    try {
      const res = await fetchAuthed(`/api/refrens/invoices?projectId=${encodeURIComponent(projectId)}`);
      if (!res.ok) throw new Error(`Failed to load invoices (${res.status})`);
      const data = (await res.json()) as { items: ProjectInvoice[] };
      setInvoices(data.items ?? []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load invoices');
    } finally {
      setInvoicesLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (config?.configured) loadInvoices();
    else setInvoicesLoading(false);
  }, [config?.configured, loadInvoices]);

  const handleCreated = (invoice: ProjectInvoice) => {
    setInvoices((prev) => [invoice, ...prev.filter((i) => i.id !== invoice.id)]);
  };

  const handleUpdated = (invoice: ProjectInvoice) => {
    setInvoices((prev) => prev.map((i) => (i.id === invoice.id ? invoice : i)));
  };

  if (configLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (!config?.configured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            Refrens isn&apos;t connected yet
          </CardTitle>
          <CardDescription>
            Connect your Refrens account once to start tracking invoices on every project.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/modules/refrens-settings">
              <Settings className="mr-2 h-4 w-4" />
              Open Refrens Settings
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Receipt className="h-4 w-4" />
          {invoices.length} invoice{invoices.length === 1 ? '' : 's'} for this project
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadInvoices} disabled={invoicesLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${invoicesLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMapOpen(true)}>
            <Link2 className="mr-2 h-4 w-4" />
            Map existing
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create invoice
          </Button>
        </div>
      </div>

      {invoicesLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : invoices.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No invoices yet. Create the first one to start tracking payments for this project.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {invoices.map((invoice) => (
            <InvoiceCard key={invoice.id} invoice={invoice} onUpdated={handleUpdated} />
          ))}
        </div>
      )}

      <CreateInvoiceDialog
        projectId={projectId}
        defaultClientName={defaultClientName}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />

      <MapInvoiceDialog
        projectId={projectId}
        open={mapOpen}
        onOpenChange={setMapOpen}
        onMapped={handleCreated}
      />
    </div>
  );
}
