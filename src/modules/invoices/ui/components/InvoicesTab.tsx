'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, RefreshCw, Settings, Receipt, AlertCircle, Layers, FileText, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchAuthed } from '@/lib/api-client';
import { SlotCard } from './SlotCard';
import { SlotDialog } from './SlotDialog';
import { MapInvoiceDialog } from './MapInvoiceDialog';
import { ApplyTemplateDialog } from './ApplyTemplateDialog';
import { LinkProposalDialog } from './LinkProposalDialog';
import { proposalService } from '@/app/modules/proposal/services/ProposalService';
import { describeTemplate } from '@/lib/payment-templates';
import type { Proposal } from '@/app/modules/proposal/types/Proposal';
import type { ProjectInvoice } from '@/modules/invoices/domain/types';

interface InvoicesTabProps {
  projectId: string;
  proposalId?: string;
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

export function InvoicesTab({ projectId, proposalId }: InvoicesTabProps) {
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [invoices, setInvoices] = useState<ProjectInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);

  const [slotDialogOpen, setSlotDialogOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<ProjectInvoice | null>(null);

  const [mapDialogOpen, setMapDialogOpen] = useState(false);
  const [mapTargetSlot, setMapTargetSlot] = useState<ProjectInvoice | null>(null);

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [importing, setImporting] = useState(false);

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

  useEffect(() => {
    if (!proposalId) {
      setProposal(null);
      return;
    }
    setProposalLoading(true);
    proposalService
      .getProposalById(proposalId)
      .then((p) => setProposal(p))
      .catch(() => setProposal(null))
      .finally(() => setProposalLoading(false));
  }, [proposalId]);

  const handleImportFromProposal = async () => {
    const terms = proposal?.data?.paymentTerms;
    if (!terms) {
      toast.error('Linked proposal has no payment terms set');
      return;
    }
    setImporting(true);
    try {
      const res = await fetchAuthed('/api/refrens/invoices/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          template: terms.template,
          totalAmount: terms.totalAmount,
          currency: terms.currency,
          startDate: terms.startDate,
        }),
      });
      const data = (await res.json()) as { invoices?: ProjectInvoice[]; error?: string };
      if (!res.ok || !Array.isArray(data.invoices)) {
        throw new Error(data.error || `Failed (${res.status})`);
      }
      handleTemplateApplied(data.invoices);
      toast.success(
        `Imported ${data.invoices.length} slot${data.invoices.length === 1 ? '' : 's'} from proposal`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import');
    } finally {
      setImporting(false);
    }
  };

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

  const proposalTerms = proposal?.data?.paymentTerms;

  return (
    <div className="space-y-4">
      {/* Proposal link banner — drives "Import from proposal" */}
      {proposalId ? (
        <Card className="bg-muted/30">
          <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1 flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground" />
              {proposalLoading ? (
                <Skeleton className="h-4 w-32" />
              ) : proposal ? (
                <>
                  <span className="font-medium truncate">{proposal.title}</span>
                  {proposalTerms ? (
                    <span className="text-xs text-muted-foreground">
                      · {describeTemplate(proposalTerms.template)} ·{' '}
                      {proposalTerms.currency} {proposalTerms.totalAmount.toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">· no payment terms set</span>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">Linked proposal not found</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleImportFromProposal}
                disabled={!proposalTerms || importing}
                title={
                  proposalTerms
                    ? 'Generate slots from the proposal payment terms'
                    : 'Set payment terms on the proposal first'
                }
              >
                <Layers className="mr-1.5 h-3.5 w-3.5" />
                Import to slots
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setLinkDialogOpen(true)}>
                Manage
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-muted/30">
          <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              No proposal linked yet — link one to import its payment template into slots.
            </div>
            <Button variant="outline" size="sm" onClick={() => setLinkDialogOpen(true)}>
              <Link2 className="mr-1.5 h-3.5 w-3.5" />
              Link a proposal
            </Button>
          </CardContent>
        </Card>
      )}

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

      <LinkProposalDialog
        projectId={projectId}
        currentProposalId={proposalId}
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        onLinked={() => {
          // Project subscription in the parent will propagate the new
          // proposalId back here via props, which re-runs the proposal
          // fetch effect. Nothing to do locally.
        }}
      />
    </div>
  );
}
