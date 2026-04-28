'use client';

import { useEffect, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchAuthed } from '@/lib/api-client';
import type { ProjectInvoice } from '@/modules/invoices/domain/types';

interface CreateInvoiceDialogProps {
  projectId: string;
  defaultClientName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (invoice: ProjectInvoice) => void;
}

interface FormItem {
  name: string;
  rate: string;     // string in form, parsed on submit
  quantity: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function CreateInvoiceDialog({
  projectId,
  defaultClientName,
  open,
  onOpenChange,
  onCreated,
}: CreateInvoiceDialogProps) {
  const [billedToName, setBilledToName] = useState('');
  const [billedToEmail, setBilledToEmail] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(isoPlusDays(14));
  const [currency, setCurrency] = useState('INR');
  const [items, setItems] = useState<FormItem[]>([{ name: '', rate: '', quantity: '1' }]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setBilledToName(defaultClientName ?? '');
      setBilledToEmail('');
      setInvoiceDate(todayIso());
      setDueDate(isoPlusDays(14));
      setCurrency('INR');
      setItems([{ name: '', rate: '', quantity: '1' }]);
    }
  }, [open, defaultClientName]);

  const updateItem = (index: number, patch: Partial<FormItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const addItem = () => setItems((prev) => [...prev, { name: '', rate: '', quantity: '1' }]);
  const removeItem = (index: number) =>
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));

  const handleSubmit = async () => {
    if (!billedToName.trim()) {
      toast.error('Client name is required');
      return;
    }
    if (!invoiceDate) {
      toast.error('Invoice date is required');
      return;
    }

    const parsedItems: { name: string; rate: number; quantity: number }[] = [];
    for (const [index, item] of items.entries()) {
      const name = item.name.trim();
      const rate = Number(item.rate);
      const quantity = Number(item.quantity);
      if (!name) {
        toast.error(`Item ${index + 1}: description is required`);
        return;
      }
      if (!Number.isFinite(rate) || rate <= 0) {
        toast.error(`Item ${index + 1}: rate must be a positive number`);
        return;
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        toast.error(`Item ${index + 1}: quantity must be a positive number`);
        return;
      }
      parsedItems.push({ name, rate, quantity });
    }

    setSubmitting(true);
    try {
      const res = await fetchAuthed('/api/refrens/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          billedTo: {
            name: billedToName.trim(),
            ...(billedToEmail.trim() ? { email: billedToEmail.trim() } : {}),
          },
          items: parsedItems,
          invoiceDate,
          ...(dueDate ? { dueDate } : {}),
          ...(currency.trim() ? { currency: currency.trim().toUpperCase() } : {}),
        }),
      });
      const data = (await res.json()) as { invoice?: ProjectInvoice; error?: string };
      if (!res.ok || !data.invoice) {
        throw new Error(data.error || `Create failed (${res.status})`);
      }
      toast.success(`Invoice #${data.invoice.invoiceNumber ?? '—'} created`);
      onCreated(data.invoice);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Create invoice</DialogTitle>
          <DialogDescription>
            Creates a draft invoice on Refrens. Edit further details there via the View link
            once it&apos;s created.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="billedToName">Client name</Label>
              <Input
                id="billedToName"
                value={billedToName}
                onChange={(e) => setBilledToName(e.target.value)}
                placeholder="Acme Corp"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billedToEmail">Client email (optional)</Label>
              <Input
                id="billedToEmail"
                type="email"
                value={billedToEmail}
                onChange={(e) => setBilledToEmail(e.target.value)}
                placeholder="billing@acme.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoiceDate">Invoice date</Label>
              <Input
                id="invoiceDate"
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due date</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                placeholder="INR"
                className="uppercase"
                maxLength={3}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line items</Label>
              <Button variant="ghost" size="sm" onClick={addItem} type="button">
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add item
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={index} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground" htmlFor={`item-name-${index}`}>
                      Description
                    </Label>
                    <Input
                      id={`item-name-${index}`}
                      value={item.name}
                      onChange={(e) => updateItem(index, { name: e.target.value })}
                      placeholder="Web design — April retainer"
                    />
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-xs text-muted-foreground" htmlFor={`item-rate-${index}`}>
                      Rate
                    </Label>
                    <Input
                      id={`item-rate-${index}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={item.rate}
                      onChange={(e) => updateItem(index, { rate: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="w-16 space-y-1">
                    <Label className="text-xs text-muted-foreground" htmlFor={`item-qty-${index}`}>
                      Qty
                    </Label>
                    <Input
                      id={`item-qty-${index}`}
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, { quantity: e.target.value })}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    onClick={() => removeItem(index)}
                    disabled={items.length === 1}
                    aria-label="Remove item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
