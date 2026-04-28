'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ExternalLink, FileText, RefreshCw, Loader2, BellRing, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { fetchAuthed } from '@/lib/api-client';
import type { InvoiceStatus, ProjectInvoice } from '@/modules/invoices/domain/types';

interface InvoiceCardProps {
  invoice: ProjectInvoice;
  onUpdated: (invoice: ProjectInvoice) => void;
}

const STATUS_VARIANT: Record<InvoiceStatus, { variant: 'secondary' | 'destructive' | 'outline' | 'default'; label: string; dotClass: string }> = {
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

export function InvoiceCard({ invoice, onUpdated }: InvoiceCardProps) {
  const status = STATUS_VARIANT[invoice.status];
  const [syncing, setSyncing] = useState(false);
  const [togglingNotify, setTogglingNotify] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetchAuthed(`/api/refrens/invoices/${invoice.id}`, {
        method: 'POST',
      });
      const data = (await res.json()) as {
        invoice?: ProjectInvoice;
        statusChanged?: boolean;
        newStatus?: InvoiceStatus;
        error?: string;
      };
      if (!res.ok || !data.invoice) {
        throw new Error(data.error || `Sync failed (${res.status})`);
      }
      onUpdated(data.invoice);
      if (data.statusChanged) {
        toast.success(`Status: ${data.newStatus}`);
      } else {
        toast.success('Up to date');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleNotify = async (checked: boolean) => {
    setTogglingNotify(true);
    try {
      const res = await fetchAuthed(`/api/refrens/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailNotifyEnabled: checked }),
      });
      const data = (await res.json()) as { invoice?: ProjectInvoice; error?: string };
      if (!res.ok || !data.invoice) {
        throw new Error(data.error || `Failed (${res.status})`);
      }
      onUpdated(data.invoice);
      toast.success(checked ? 'Email alerts on' : 'Email alerts off');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setTogglingNotify(false);
    }
  };

  const notifyId = `notify-${invoice.id}`;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold">
                #{invoice.invoiceNumber ?? '—'}
              </span>
              <Badge variant={status.variant} className="gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${status.dotClass}`} aria-hidden="true" />
                {status.label}
              </Badge>
              <span className="text-sm font-medium">
                {formatAmount(invoice.amount, invoice.currency)}
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground space-x-3">
              {invoice.billedToName && <span>{invoice.billedToName}</span>}
              <span>Issued {formatDate(invoice.invoiceDate)}</span>
              <span>Due {formatDate(invoice.dueDate)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
              title="Refresh status from Refrens"
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
          </div>
        </div>

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
      </CardContent>
    </Card>
  );
}
