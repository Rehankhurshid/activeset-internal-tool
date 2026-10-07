'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Landmark } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchAuthed } from '@/lib/api-client';
import { VIA_LABELS } from '../../domain/payments.matching';
import type { IncomingPayment } from '../../domain/payments.types';
import { formatDay, formatMoney } from '../lib/format';

/** Money that reached the bank for this project, on its Invoices tab. Admin-only. */
export function ProjectPaymentsCard({ projectId }: { projectId: string }) {
  const [payments, setPayments] = useState<IncomingPayment[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAuthed(`/api/payments?projectId=${encodeURIComponent(projectId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { payments: IncomingPayment[] };
        if (!cancelled) setPayments(data.payments);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const total = (payments ?? []).filter((p) => p.currency === 'INR').reduce((s, p) => s + p.amount, 0);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4" /> Payments received
          </CardTitle>
          <CardDescription>
            {payments && payments.length
              ? `${formatMoney(total)} across ${payments.length} ${payments.length === 1 ? 'payment' : 'payments'}, from the bank via Fold.`
              : 'Credits on the business account, read from Fold twice a day.'}
          </CardDescription>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/modules/payments">All payments</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {failed ? (
          <p className="text-sm text-muted-foreground">Could not load payments.</p>
        ) : !payments ? (
          <Skeleton className="h-12 w-full" />
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing assigned to this project yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {payments.slice(0, 12).map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <span className="w-[100px] shrink-0 text-muted-foreground">{formatDay(p.date)}</span>
                <span className="truncate">{p.payerName}</span>
                {p.via && <Badge variant="secondary">via {VIA_LABELS[p.via]}</Badge>}
                {p.refrensPaymentId && <Badge variant="outline">In Refrens</Badge>}
                <span className="ml-auto font-medium tabular-nums">{formatMoney(p.amount, p.currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
