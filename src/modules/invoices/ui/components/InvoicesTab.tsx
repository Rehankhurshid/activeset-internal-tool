'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, RefreshCw, Settings, Receipt, AlertCircle, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { fetchAuthed } from '@/lib/api-client';
import { SlotCard } from './SlotCard';
import { SlotDialog } from './SlotDialog';
import { MapInvoiceDialog } from './MapInvoiceDialog';
import { ApplyTemplateDialog } from './ApplyTemplateDialog';
import type { ProjectInvoice } from '@/modules/invoices/domain/types';

interface InvoicesTabProps {
  projectId: string;
}

interface ConfigStatus {
  configured: boolean;
}

function summarize(invoices: ProjectInvoice[]): string {
  if (invoices.length === 0) return 'No slots yet';
  const counts = { empty: 0, paid: 0, unpaid: 0, overdue: 0, other: 0 };
  for (const inv of invoices) {
    if (inv.status === 'PENDING') counts.empty++;
    else if (inv.status === 'PAID') counts.paid++;
    else if (inv.status === 'UNPAID') counts.unpaid++;
    else if (inv.status === 'OVERDUE') counts.overdue++;
    else counts.other++;
  }
  const parts: string[] = [`${invoices.length} slot${invoices.length === 1 ? '' : 's'}`];
  if (counts.paid) parts.push(`${counts.paid} paid`);
  if (counts.unpaid) parts.push(`${counts.unpaid} unpaid`);
  if (counts.overdue) parts.push(`${counts.overdue} overdue`);
  if (counts.empty) parts.push(`${counts.empty} empty`);
  return parts.join(' · ');
}

export function InvoicesTab({ projectId }: InvoicesTabProps) {
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [invoices, setInvoices] = useState<ProjectInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);

  const [slotDialogOpen, setSlotDialogOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<ProjectInvoice | null>(null);

  const [mapDialogOpen, setMapDialogOpen] = useState(false);
  const [mapTargetSlot, setMapTargetSlot] = useState<ProjectInvoice | null>(null);

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

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

  const handleSaved = (invoice: ProjectInvoice) => {
    setInvoices((prev) => {
      const next = prev.filter((i) => i.id !== invoice.id);
      return [...next, invoice].sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        const aKey = a.invoiceDate ?? a.createdAt;
        const bKey = b.invoiceDate ?? b.createdAt;
        return bKey.localeCompare(aKey);
      });
    });
  };

  const handleDeleted = (invoiceId: string) => {
    setInvoices((prev) => prev.filter((i) => i.id !== invoiceId));
  };

  const handleTemplateApplied = (newSlots: ProjectInvoice[]) => {
    setInvoices((prev) => {
      const byId = new Map(prev.map((i) => [i.id, i]));
      for (const slot of newSlots) byId.set(slot.id, slot);
      return Array.from(byId.values()).sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        const aKey = a.invoiceDate ?? a.createdAt;
        const bKey = b.invoiceDate ?? b.createdAt;
        return bKey.localeCompare(aKey);
      });
    });
  };

  const openMapForSlot = (invoice: ProjectInvoice) => {
    setMapTargetSlot(invoice);
    setMapDialogOpen(true);
  };

  const openEditForSlot = (invoice: ProjectInvoice) => {
    setEditingSlot(invoice);
    setSlotDialogOpen(true);
  };

  const openAddSlot = () => {
    setEditingSlot(null);
    setSlotDialogOpen(true);
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
          {summarize(invoices)}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadInvoices} disabled={invoicesLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${invoicesLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTemplateDialogOpen(true)}>
            <Layers className="mr-2 h-4 w-4" />
            Apply template
          </Button>
          <Button size="sm" onClick={openAddSlot}>
            <Plus className="mr-2 h-4 w-4" />
            Add slot
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
            No slots yet. Add a slot to plan an invoice — fill it later by mapping the matching
            invoice from Refrens.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {invoices.map((invoice) => (
            <SlotCard
              key={invoice.id}
              invoice={invoice}
              onUpdated={handleSaved}
              onDeleted={handleDeleted}
              onMapClick={openMapForSlot}
              onEditClick={openEditForSlot}
            />
          ))}
        </div>
      )}

      <SlotDialog
        projectId={projectId}
        open={slotDialogOpen}
        onOpenChange={(o) => {
          setSlotDialogOpen(o);
          if (!o) setEditingSlot(null);
        }}
        editing={editingSlot}
        onSaved={handleSaved}
      />

      <MapInvoiceDialog
        projectId={projectId}
        targetSlotId={mapTargetSlot?.id}
        targetSlotLabel={mapTargetSlot?.label ?? mapTargetSlot?.invoiceNumber ?? undefined}
        open={mapDialogOpen}
        onOpenChange={(o) => {
          setMapDialogOpen(o);
          if (!o) setMapTargetSlot(null);
        }}
        onMapped={handleSaved}
      />

      <ApplyTemplateDialog
        projectId={projectId}
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        onApplied={handleTemplateApplied}
      />
    </div>
  );
}
