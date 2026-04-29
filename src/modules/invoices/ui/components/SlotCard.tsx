'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ui/alert-dialog-confirm';
import {
  ExternalLink,
  FileText,
  RefreshCw,
  Loader2,
  BellRing,
  Bell,
  MoreHorizontal,
  Pencil,
  Trash2,
  Link2,
  Unlink,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchAuthed } from '@/lib/api-client';
import type { InvoiceStatus, ProjectInvoice } from '@/modules/invoices/domain/types';

interface SlotCardProps {
  invoice: ProjectInvoice;
  onUpdated: (invoice: ProjectInvoice) => void;
  onDeleted: (invoiceId: string) => void;
  onMapClick: (invoice: ProjectInvoice) => void;
  onEditClick: (invoice: ProjectInvoice) => void;
}

const STATUS_VARIANT: Record<
  InvoiceStatus,
  { variant: 'secondary' | 'destructive' | 'outline' | 'default'; label: string; dotClass: string }
> = {
  PENDING: { variant: 'outline', label: 'Empty slot', dotClass: 'bg-muted-foreground/40' },
  PAID: { variant: 'secondary', label: 'Paid', dotClass: 'bg-emerald-500' },
  UNPAID: { variant: 'outline', label: 'Unpaid', dotClass: 'bg-amber-500' },
  OVERDUE: { variant: 'destructive', label: 'Overdue', dotClass: 'bg-red-500' },
  CANCELED: { variant: 'outline', label: 'Canceled', dotClass: 'bg-muted-foreground' },
  UNKNOWN: { variant: 'outline', label: 'Unknown', dotClass: 'bg-muted-foreground' },
};

function formatAmount(amount: number | null, currency: string | null): string {
  if (amount == null) return '—';
  const code = currency || 'INR';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function deriveTitle(invoice: ProjectInvoice): string {
  if (invoice.label) return invoice.label;
  if (invoice.invoiceNumber) return `#${invoice.invoiceNumber}`;
  return 'Untitled invoice';
}

export function SlotCard({ invoice, onUpdated, onDeleted, onMapClick, onEditClick }: SlotCardProps) {
  const status = STATUS_VARIANT[invoice.status];
  const isFilled = Boolean(invoice.refrensInvoiceId);
  const [syncing, setSyncing] = useState(false);
  const [togglingNotify, setTogglingNotify] = useState(false);
  const [unmapping, setUnmapping] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmUnmap, setConfirmUnmap] = useState(false);

  const callPatch = async (body: Record<string, unknown>) => {
    const res = await fetchAuthed(`/api/refrens/invoices/${invoice.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { invoice?: ProjectInvoice; error?: string };
    if (!res.ok || !data.invoice) {
      throw new Error(data.error || `Failed (${res.status})`);
    }
    return data.invoice;
  };

  const callPostAction = async (action: string) => {
    const res = await fetchAuthed(`/api/refrens/invoices/${invoice.id}?action=${action}`, {
      method: 'POST',
    });
    const data = (await res.json()) as {
      invoice?: ProjectInvoice;
      statusChanged?: boolean;
      newStatus?: InvoiceStatus;
      error?: string;
    };
    if (!res.ok || !data.invoice) {
      throw new Error(data.error || `Failed (${res.status})`);
    }
    return data;
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const data = await callPostAction('sync');
      onUpdated(data.invoice!);
      if (data.statusChanged) toast.success(`Status: ${data.newStatus}`);
      else toast.success('Up to date');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleNotify = async (checked: boolean) => {
    setTogglingNotify(true);
    try {
      const updated = await callPatch({ emailNotifyEnabled: checked });
      onUpdated(updated);
      toast.success(checked ? 'Email alerts on' : 'Email alerts off');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setTogglingNotify(false);
    }
  };

  const handleUnmap = async () => {
    setUnmapping(true);
    try {
      const data = await callPostAction('unmap');
      onUpdated(data.invoice!);
      toast.success('Invoice unmapped — slot is empty');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unmap failed');
    } finally {
      setUnmapping(false);
      setConfirmUnmap(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetchAuthed(`/api/refrens/invoices/${invoice.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Delete failed (${res.status})`);
      }
      onDeleted(invoice.id);
      toast.success('Slot deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const notifyId = `notify-${invoice.id}`;
  const title = deriveTitle(invoice);
  const expectedLine = (() => {
    const parts: string[] = [];
    if (invoice.expectedAmount != null) {
      parts.push(`Expected ${formatAmount(invoice.expectedAmount, invoice.expectedCurrency)}`);
    }
    if (invoice.expectedDueDate) parts.push(`due ${formatDate(invoice.expectedDueDate)}`);
    return parts.join(' · ');
  })();

  return (
    <>
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold truncate">{title}</span>
                <Badge variant={status.variant} className="gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${status.dotClass}`} aria-hidden="true" />
                  {status.label}
                </Badge>
                {isFilled && (
                  <span className="text-sm font-medium">
                    {formatAmount(invoice.amount, invoice.currency)}
                  </span>
                )}
              </div>

              {/* Expected line — show on empty or when expectations differ from actuals */}
              {expectedLine && (
                <div className="mt-1 text-xs text-muted-foreground">{expectedLine}</div>
              )}

              {/* Filled metadata */}
              {isFilled && (
                <div className="mt-1 text-xs text-muted-foreground space-x-3">
                  {invoice.invoiceNumber && <span>#{invoice.invoiceNumber}</span>}
                  {invoice.billedToName && <span>{invoice.billedToName}</span>}
                  <span>Issued {formatDate(invoice.invoiceDate)}</span>
                  <span>Due {formatDate(invoice.dueDate)}</span>
                </div>
              )}

              {invoice.notes && (
                <div className="mt-1 text-xs text-muted-foreground">{invoice.notes}</div>
              )}
            </div>

            <div className="flex items-center gap-1">
              {/* Primary action depends on slot state */}
              {!isFilled ? (
                <Button size="sm" onClick={() => onMapClick(invoice)}>
                  <Link2 className="mr-1.5 h-3.5 w-3.5" />
                  Map from Refrens
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSync}
                    disabled={syncing}
                    title="Refresh from Refrens"
                  >
                    {syncing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  {invoice.shareLink && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={invoice.shareLink} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        View
                      </a>
                    </Button>
                  )}
                  {invoice.pdfLink && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={invoice.pdfLink} target="_blank" rel="noopener noreferrer">
                        <FileText className="mr-1.5 h-3.5 w-3.5" />
                        PDF
                      </a>
                    </Button>
                  )}
                </>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="More actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEditClick(invoice)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Edit slot
                  </DropdownMenuItem>
                  {isFilled && (
                    <DropdownMenuItem onClick={() => setConfirmUnmap(true)} disabled={unmapping}>
                      <Unlink className="mr-2 h-3.5 w-3.5" />
                      Unmap invoice
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                    disabled={deleting}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete slot
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {isFilled && (
            <div className="flex items-center justify-between border-t pt-3">
              <Label
                htmlFor={notifyId}
                className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer"
              >
                {invoice.emailNotifyEnabled ? (
                  <BellRing className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Bell className="h-3.5 w-3.5" />
                )}
                Email me on status change
              </Label>
              <Switch
                id={notifyId}
                checked={invoice.emailNotifyEnabled}
                onCheckedChange={handleToggleNotify}
                disabled={togglingNotify}
                aria-label="Email me on status change"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={isFilled ? 'Delete this slot?' : 'Delete this empty slot?'}
        description={
          isFilled
            ? `This removes the local record for "${title}". The invoice itself stays on Refrens — you can re-map it later if needed.`
            : `This removes the empty slot "${title}". You can always create another one.`
        }
        onConfirm={handleDelete}
        confirmText="Delete"
        variant="destructive"
      />

      <ConfirmDialog
        open={confirmUnmap}
        onOpenChange={setConfirmUnmap}
        title="Unmap invoice from this slot?"
        description={`The slot "${title}" will go back to empty. The Refrens invoice stays on Refrens — you can re-map it (or a different one) anytime.`}
        onConfirm={handleUnmap}
        confirmText="Unmap"
      />
    </>
  );
}
