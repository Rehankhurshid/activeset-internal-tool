'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Search, Check, ExternalLink, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { fetchAuthed } from '@/lib/api-client';
import type { ProjectInvoice } from '@/modules/invoices/domain/types';

interface AvailableInvoiceItem {
  refrensInvoiceId: string;
  invoiceNumber: string | null;
  status: string | null;
  amount: number | null;
  currency: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  billedToName: string | null;
  shareLink: string | null;
  pdfLink: string | null;
  mapping:
    | { state: 'unmapped' }
    | { state: 'mapped-current' }
    | { state: 'mapped-other'; projectId: string; projectName: string };
}

interface MapInvoiceDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMapped: (invoice: ProjectInvoice) => void;
}

const PAGE_SIZE = 50;

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

export function MapInvoiceDialog({ projectId, open, onOpenChange, onMapped }: MapInvoiceDialogProps) {
  const [items, setItems] = useState<AvailableInvoiceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [mappingId, setMappingId] = useState<string | null>(null);

  const load = useCallback(
    async (currentSkip: number, append: boolean) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          projectId,
          limit: String(PAGE_SIZE),
          skip: String(currentSkip),
        });
        const res = await fetchAuthed(`/api/refrens/invoices/available?${params.toString()}`);
        const data = (await res.json()) as {
          items?: AvailableInvoiceItem[];
          total?: number | null;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || `Failed (${res.status})`);
        }
        const next = data.items ?? [];
        setItems((prev) => (append ? [...prev, ...next] : next));
        setHasMore(next.length === PAGE_SIZE);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load invoices');
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setSkip(0);
    void load(0, false);
  }, [open, load]);

  const handleLoadMore = () => {
    const nextSkip = skip + PAGE_SIZE;
    setSkip(nextSkip);
    void load(nextSkip, true);
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => {
      const invoiceNumber = (item.invoiceNumber ?? '').toLowerCase();
      const billedTo = (item.billedToName ?? '').toLowerCase();
      const status = (item.status ?? '').toLowerCase();
      return (
        invoiceNumber.includes(query) ||
        billedTo.includes(query) ||
        status.includes(query)
      );
    });
  }, [items, search]);

  const handleMap = async (item: AvailableInvoiceItem) => {
    setMappingId(item.refrensInvoiceId);
    try {
      const res = await fetchAuthed('/api/refrens/invoices/map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, refrensInvoiceId: item.refrensInvoiceId }),
      });
      const data = (await res.json()) as { invoice?: ProjectInvoice; error?: string };
      if (!res.ok || !data.invoice) {
        throw new Error(data.error || `Failed (${res.status})`);
      }
      toast.success(`Mapped invoice #${data.invoice.invoiceNumber ?? '—'}`);
      onMapped(data.invoice);
      // Locally mark it as mapped-current so the user sees the state flip
      setItems((prev) =>
        prev.map((i) =>
          i.refrensInvoiceId === item.refrensInvoiceId
            ? { ...i, mapping: { state: 'mapped-current' as const } }
            : i
        )
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to map invoice');
    } finally {
      setMappingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Map existing invoice</DialogTitle>
          <DialogDescription>
            Pick a Refrens invoice to attach to this project. Useful for invoices created
            directly in Refrens or before this integration existed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by invoice #, client, or status…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="max-h-[420px] overflow-y-auto space-y-2 -mx-1 px-1">
            {loading && items.length === 0 ? (
              <>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            ) : filtered.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                {search.trim()
                  ? 'No invoices match your search.'
                  : 'No invoices found in your Refrens account.'}
              </div>
            ) : (
              filtered.map((item) => {
                const mappingState = item.mapping.state;
                const isCurrent = mappingState === 'mapped-current';
                const isOther = mappingState === 'mapped-other';
                const isMapping = mappingId === item.refrensInvoiceId;
                return (
                  <div
                    key={item.refrensInvoiceId}
                    className={`flex items-center justify-between gap-3 p-3 rounded-md border ${
                      isCurrent || isOther ? 'opacity-70 bg-muted/30' : 'bg-background'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold">
                          #{item.invoiceNumber ?? '—'}
                        </span>
                        {item.status && (
                          <Badge variant="outline" className="text-xs">
                            {item.status}
                          </Badge>
                        )}
                        <span className="text-sm">
                          {formatAmount(item.amount, item.currency)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground space-x-3">
                        {item.billedToName && <span>{item.billedToName}</span>}
                        <span>Issued {formatDate(item.invoiceDate)}</span>
                        {item.dueDate && <span>Due {formatDate(item.dueDate)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.shareLink && (
                        <Button variant="ghost" size="icon" asChild title="Open in Refrens">
                          <a href={item.shareLink} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      {isCurrent ? (
                        <Badge variant="secondary" className="gap-1">
                          <Check className="h-3 w-3" />
                          In this project
                        </Badge>
                      ) : isOther ? (
                        <Badge variant="outline" className="text-xs">
                          In{' '}
                          <span className="font-medium ml-1">
                            {item.mapping.state === 'mapped-other'
                              ? item.mapping.projectName
                              : ''}
                          </span>
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleMap(item)}
                          disabled={isMapping}
                        >
                          {isMapping ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          Map
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {hasMore && !search.trim() && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Load more
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
