'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CircleCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchAuthed } from '@/lib/api-client';
import { REFRENS_PAYMENT_METHODS, settledBy, type RefrensPaymentMethod } from '../../domain/payments.refrens';
import type { IncomingPayment, PaymentInvoiceRef } from '../../domain/payments.types';
import { formatDay, formatMoney } from '../lib/format';
import { invoiceLabel } from './AssignPaymentDialog';

const METHOD_LABELS: Record<RefrensPaymentMethod, string> = {
  ACCOUNT_TRANSFER: 'Bank transfer',
  UPI: 'UPI',
  CHEQUE: 'Cheque',
  CASH: 'Cash',
  CREDIT_CARD: 'Credit card',
  DEBIT_CARD: 'Debit card',
  DD: 'Demand draft',
};

interface Preview {
  invoice: { id: string; invoiceNumber: string | null; label: string | null; currency: string; total: number; status: string };
  outstanding: number;
  paymentsOnInvoice: number;
  alreadyRecorded: boolean;
  draft: {
    amount: number;
    tds: number;
    transactionCharge: number;
    paymentMethod: RefrensPaymentMethod;
    refId: string;
    notes: string;
    warning: string | null;
    paymentDate: string;
  };
}

interface RecordInRefrensDialogProps {
  payment: IncomingPayment | null;
  invoices: PaymentInvoiceRef[];
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

const CLOSED = new Set(['PAID', 'CANCELED']);

/** An unpaid invoice found in Refrens (from /refrens/candidates). */
interface Candidate {
  refrensInvoiceId: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  currency: string;
  due: number;
  billedToName: string | null;
  score: number;
  reasons: string[];
  linkedInvoiceId: string | null;
  alreadyPaid?: boolean;
  paidOn?: string | null;
}

/** Select value: `slot:<project_invoices id>` or `refrens:<Refrens invoice id>`. */
type Pick = string;

function pickQuery(pick: Pick): Record<string, string> {
  const [kind, id] = [pick.slice(0, pick.indexOf(':')), pick.slice(pick.indexOf(':') + 1)];
  return kind === 'slot' ? { invoiceId: id } : { refrensInvoiceId: id };
}

/**
 * "Mark paid": records this bank credit as a payment on the project's Refrens
 * invoice. Refrens marks the invoice PAID once amount + TDS + charges cover it.
 */
export function RecordInRefrensDialog({ payment, invoices, onOpenChange, onDone }: RecordInRefrensDialogProps) {
  const choices = useMemo(
    () =>
      invoices.filter(
        (inv) => inv.projectId === payment?.projectId && inv.refrensMapped && (!CLOSED.has(inv.status) || inv.id === payment?.invoiceId)
      ),
    [invoices, payment?.projectId, payment?.invoiceId]
  );
  const [pick, setPick] = useState<Pick>('');
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState('');
  const [tds, setTds] = useState('');
  const [charge, setCharge] = useState('');
  const [method, setMethod] = useState<RefrensPaymentMethod>('ACCOUNT_TRANSFER');
  const [date, setDate] = useState('');
  const [refId, setRefId] = useState('');

  // Unpaid invoices straight from Refrens, so a project with nothing linked works too.
  useEffect(() => {
    if (!payment) return;
    let cancelled = false;
    setCandidates(null);
    setCandidatesError(null);
    fetchAuthed(`/api/payments/${encodeURIComponent(payment.id)}/refrens/candidates`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
        if (!cancelled) setCandidates((data.candidates ?? []) as Candidate[]);
      })
      .catch((err) => {
        if (cancelled) return;
        setCandidates([]);
        setCandidatesError(err instanceof Error ? err.message : 'Could not list Refrens invoices');
      });
    return () => {
      cancelled = true;
    };
  }, [payment]);

  // Refrens invoices not already listed as a linked slot.
  const fromRefrens = useMemo(
    () => (candidates ?? []).filter((c) => !c.linkedInvoiceId || !choices.some((ch) => ch.id === c.linkedInvoiceId)),
    [candidates, choices]
  );

  useEffect(() => {
    if (!payment) return;
    // Preselect only when there is no doubt: the linked invoice, the only
    // option, or one Refrens invoice that matches on both name and amount.
    const linked = payment.invoiceId && choices.some((c) => c.id === payment.invoiceId) ? `slot:${payment.invoiceId}` : '';
    const total = choices.length + fromRefrens.length;
    const only = total === 1 ? (choices[0] ? `slot:${choices[0].id}` : `refrens:${fromRefrens[0].refrensInvoiceId}`) : '';
    const strong = fromRefrens.filter((c) => c.score >= 5);
    const best = strong.length === 1 ? `refrens:${strong[0].refrensInvoiceId}` : '';
    setPick(linked || only || best);
    setPreview(null);
    setAmount('');
    setTds('');
    setCharge('');
    setRefId('');
  }, [payment, choices, fromRefrens]);

  useEffect(() => {
    if (!payment || !pick) return;
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    setLoadError(null);
    fetchAuthed(`/api/payments/${encodeURIComponent(payment.id)}/refrens?${new URLSearchParams(pickQuery(pick))}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
        if (cancelled) return;
        const p = data as Preview;
        setPreview(p);
        setAmount(String(p.draft.amount));
        setTds(String(p.draft.tds));
        setCharge(String(p.draft.transactionCharge));
        setMethod(p.draft.paymentMethod);
        setDate(p.draft.paymentDate.slice(0, 10));
        setRefId(p.draft.refId);
      })
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : 'Could not read the invoice from Refrens'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [payment, pick]);

  const isPaid = preview?.invoice.status === 'PAID';
  const settles = settledBy({ amount: Number(amount) || 0, tds: Number(tds) || 0, transactionCharge: Number(charge) || 0 });
  const currency = preview?.invoice.currency ?? 'INR';
  const closesInvoice = preview ? settles >= preview.outstanding - 0.5 : false;
  const blocked = isPaid
    ? !preview || preview.alreadyRecorded
    : !preview || preview.alreadyRecorded || CLOSED.has(preview.invoice.status) || !(Number(amount) > 0);

  const submit = async () => {
    if (!payment || !preview) return;
    setSaving(true);
    try {
      const res = await fetchAuthed(`/api/payments/${encodeURIComponent(payment.id)}/refrens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isPaid ? { ...pickQuery(pick), linkOnly: true } : {
          ...pickQuery(pick),
          amount: Number(amount),
          tds: Number(tds) || 0,
          transactionCharge: Number(charge) || 0,
          paymentMethod: method,
          paymentDate: date,
          refId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      toast.success(
        data.linked
          ? 'Linked to the paid invoice. Nothing was sent to Refrens.'
          : data.duplicate
          ? 'Already in Refrens; linked it here'
          : data.invoiceStatus === 'PAID'
            ? 'Recorded in Refrens. The invoice is paid.'
            : `Recorded in Refrens. Invoice is ${String(data.invoiceStatus).toLowerCase()}.`
      );
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not record the payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(payment)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mark paid in Refrens</DialogTitle>
          <DialogDescription>
            {payment && `${formatMoney(payment.amount, payment.currency)} from ${payment.payerName} on ${formatDay(payment.date)}`}
          </DialogDescription>
        </DialogHeader>

        {candidates === null && choices.length === 0 ? (
          <Skeleton className="h-10 w-full" />
        ) : choices.length === 0 && fromRefrens.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {candidatesError ?? 'No unpaid invoice in Refrens for this project. It may already be marked paid there.'}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Invoice</Label>
              <Select value={pick} onValueChange={setPick}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick an invoice" />
                </SelectTrigger>
                <SelectContent>
                  {choices.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Linked to this project</SelectLabel>
                      {choices.map((inv) => (
                        <SelectItem key={inv.id} value={`slot:${inv.id}`}>
                          {invoiceLabel(inv)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {fromRefrens.some((c) => c.alreadyPaid) && (
                    <SelectGroup>
                      <SelectLabel>Already paid in Refrens</SelectLabel>
                      {fromRefrens.filter((c) => c.alreadyPaid).map((c) => (
                        <SelectItem key={c.refrensInvoiceId} value={`refrens:${c.refrensInvoiceId}`}>
                          <span className="flex flex-col items-start">
                            <span>
                              #{c.invoiceNumber ?? '—'} · {formatMoney(c.due, c.currency)} · {c.billedToName ?? 'no bill-to'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {[c.paidOn ? `Paid ${formatDay(c.paidOn)}` : 'Paid', ...c.reasons].join(' · ')}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {fromRefrens.some((c) => !c.alreadyPaid) && (
                    <SelectGroup>
                      <SelectLabel>Unpaid in Refrens</SelectLabel>
                      {fromRefrens.filter((c) => !c.alreadyPaid).map((c) => (
                        <SelectItem key={c.refrensInvoiceId} value={`refrens:${c.refrensInvoiceId}`}>
                          <span className="flex flex-col items-start">
                            <span>
                              #{c.invoiceNumber ?? '—'} · {formatMoney(c.due, c.currency)} due · {c.billedToName ?? 'no bill-to'}
                            </span>
                            {c.reasons.length > 0 && (
                              <span className="text-xs text-muted-foreground">{c.reasons.join(' · ')}</span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
              {pick.startsWith('refrens:') && (
                <p className="text-xs text-muted-foreground">This also links the invoice to the project&apos;s Invoices tab.</p>
              )}
            </div>

            {!pick ? (
              <p className="text-sm text-muted-foreground">Pick the invoice this payment settles.</p>
            ) : loadError ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {loadError}
                  {/signature|not connected|authenticat/i.test(loadError) && (
                    <>
                      {' '}
                      The Refrens key needs reconnecting in{' '}
                      <a href="/modules/refrens-settings" className="underline">
                        Refrens settings
                      </a>
                      .
                    </>
                  )}
                </AlertDescription>
              </Alert>
            ) : loading || !preview ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {formatMoney(preview.outstanding, currency)} still due of {formatMoney(preview.invoice.total, currency)}
                  {preview.paymentsOnInvoice ? ` (${preview.paymentsOnInvoice} payment${preview.paymentsOnInvoice === 1 ? '' : 's'} already on it)` : ''}.
                </p>
                {preview.alreadyRecorded && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>This bank credit is already recorded on this invoice in Refrens.</AlertDescription>
                  </Alert>
                )}
                {isPaid && !preview.alreadyRecorded && (
                  <Alert>
                    <CircleCheck className="h-4 w-4" />
                    <AlertDescription>
                      Already paid in Refrens. Linking ties this bank credit to the invoice and its payment there. Nothing is sent to
                      Refrens.
                    </AlertDescription>
                  </Alert>
                )}
                {preview.invoice.status === 'CANCELED' && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>The invoice is cancelled in Refrens.</AlertDescription>
                  </Alert>
                )}
                {!isPaid && (
                <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="rr-amount">Received ({currency})</Label>
                    <Input id="rr-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rr-tds">TDS</Label>
                    <Input id="rr-tds" inputMode="decimal" value={tds} onChange={(e) => setTds(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rr-charge">Charges</Label>
                    <Input id="rr-charge" inputMode="decimal" value={charge} onChange={(e) => setCharge(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Method</Label>
                    <Select value={method} onValueChange={(v) => setMethod(v as RefrensPaymentMethod)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REFRENS_PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {METHOD_LABELS[m]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rr-date">Payment date</Label>
                    <Input id="rr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rr-ref">Reference (UTR)</Label>
                  <Input id="rr-ref" value={refId} onChange={(e) => setRefId(e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Settles {formatMoney(settles, currency)}.{' '}
                  {closesInvoice ? 'Refrens will mark the invoice paid.' : 'The invoice stays partly unpaid.'}
                </p>
                </>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={blocked || saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isPaid ? 'Link to invoice' : preview && Number(amount) > 0 ? `Record ${formatMoney(Number(amount), currency)} in Refrens` : 'Record in Refrens'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
