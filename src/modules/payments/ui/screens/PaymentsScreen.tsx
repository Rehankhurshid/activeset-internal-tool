'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Ban, Check, Pencil, RotateCcw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/modules/auth-access';
import { AppNavigation } from '@/shared/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetchAuthed } from '@/lib/api-client';
import { VIA_LABELS } from '../../domain/payments.matching';
import type {
  FoldConnectionStatus,
  IncomingPayment,
  PaymentInvoiceRef,
  PaymentProjectRef,
  PaymentStatus,
} from '../../domain/payments.types';
import { AssignPaymentDialog, invoiceLabel } from '../components/AssignPaymentDialog';
import { FoldConnectionCard } from '../components/FoldConnectionCard';
import { formatDay, formatMoney } from '../lib/format';

type Filter = PaymentStatus | 'all';

interface PaymentsData {
  payments: IncomingPayment[];
  projects: PaymentProjectRef[];
  invoices: PaymentInvoiceRef[];
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppNavigation title="Payments" showBackButton backHref="/" />
      <main className="flex-1 container mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}

export function PaymentsScreen() {
  const { user, loading: authLoading, isAdmin, signInWithGoogle } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<FoldConnectionStatus | null>(null);
  const [data, setData] = useState<PaymentsData | null>(null);
  const [filter, setFilter] = useState<Filter>('unassigned');
  const [assigning, setAssigning] = useState<IncomingPayment | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([fetchAuthed('/api/payments/fold'), fetchAuthed('/api/payments')]);
      if (!s.ok || !p.ok) throw new Error(`Failed to load (${s.status}/${p.status})`);
      setStatus((await s.json()) as FoldConnectionStatus);
      setData((await p.json()) as PaymentsData);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load payments');
    }
  }, []);

  useEffect(() => {
    if (user && isAdmin) void load();
  }, [user, isAdmin, load]);

  // Coming back from Fold's sign-in.
  useEffect(() => {
    const fold = searchParams.get('fold');
    if (!fold) return;
    if (fold === 'connected') toast.success('Fold connected. Tick the business account, save, then Sync now.');
    else toast.error(`Fold connection failed: ${searchParams.get('reason') ?? 'unknown error'}`);
    router.replace('/modules/payments');
  }, [searchParams, router]);

  const projectsById = useMemo(() => new Map((data?.projects ?? []).map((p) => [p.id, p])), [data?.projects]);
  const invoicesById = useMemo(() => new Map((data?.invoices ?? []).map((i) => [i.id, i])), [data?.invoices]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { unassigned: 0, assigned: 0, ignored: 0, all: 0 };
    for (const p of data?.payments ?? []) {
      c[p.status]++;
      c.all++;
    }
    return c;
  }, [data?.payments]);

  const monthTotal = useMemo(() => {
    const month = new Date().toISOString().slice(0, 7);
    return (data?.payments ?? [])
      .filter((p) => p.status !== 'ignored' && p.currency === 'INR' && p.date.startsWith(month))
      .reduce((sum, p) => sum + p.amount, 0);
  }, [data?.payments]);

  const rows = (data?.payments ?? []).filter((p) => filter === 'all' || p.status === filter);

  const patch = async (payment: IncomingPayment, body: Record<string, unknown>, done: string) => {
    try {
      const res = await fetchAuthed(`/api/payments/${encodeURIComponent(payment.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      toast.success(json.alsoAssigned ? `${done}, plus ${json.alsoAssigned} more from ${payment.payerName}` : done);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  const confirmSuggestion = (p: IncomingPayment) => {
    if (!p.suggestion) return;
    const name = projectsById.get(p.suggestion.projectId)?.name ?? 'project';
    void patch(
      p,
      { action: 'assign', projectId: p.suggestion.projectId, invoiceId: p.suggestion.invoiceId, rememberPayer: !p.via },
      `Assigned to ${name}`
    );
  };

  if (authLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }
  if (!user) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">Please sign in to continue.</p>
        <Button onClick={signInWithGoogle}>Sign In</Button>
      </Shell>
    );
  }
  if (!isAdmin) {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle>Restricted</CardTitle>
            <CardDescription>This area is admin-only.</CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      {status ? (
        <FoldConnectionCard status={status} onStatus={setStatus} onSynced={load} />
      ) : (
        <Skeleton className="h-[160px] w-full" />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Received this month</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMoney(Math.round(monthTotal))}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>To assign</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{counts.unassigned}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Assigned</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{counts.assigned}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Incoming payments</CardTitle>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList>
              <TabsTrigger value="unassigned">To assign ({counts.unassigned})</TabsTrigger>
              <TabsTrigger value="assigned">Assigned</TabsTrigger>
              <TabsTrigger value="ignored">Ignored</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {!data ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {filter === 'unassigned' ? 'Nothing to assign.' : 'No payments here yet.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[110px]">Date</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead className="w-[1%] text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => {
                    const project = p.projectId ? projectsById.get(p.projectId) : null;
                    const invoice = p.invoiceId ? invoicesById.get(p.invoiceId) : null;
                    const suggested = p.status === 'unassigned' && p.suggestion ? projectsById.get(p.suggestion.projectId) : null;
                    return (
                      <TableRow key={p.id} className={p.status === 'ignored' ? 'opacity-60' : undefined}>
                        <TableCell className="whitespace-nowrap align-top text-sm">{formatDay(p.date)}</TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{p.payerName}</span>
                            {p.via && <Badge variant="secondary">via {VIA_LABELS[p.via]}</Badge>}
                          </div>
                          <div className="mt-0.5 max-w-[360px] truncate text-xs text-muted-foreground" title={p.narration}>
                            {[p.channel, p.accountLabel].filter(Boolean).join(' · ')}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right align-top font-medium tabular-nums">
                          {formatMoney(p.amount, p.currency)}
                        </TableCell>
                        <TableCell className="min-w-[180px] max-w-[320px] whitespace-normal align-top text-sm">
                          {project ? (
                            <div>
                              <Link href={`/modules/project-links/${project.id}?tab=invoices`} className="font-medium hover:underline">
                                {project.name}
                              </Link>
                              {p.autoAssigned && <Badge variant="outline" className="ml-2">auto</Badge>}
                              {invoice && <div className="text-xs text-muted-foreground">{invoiceLabel(invoice)}</div>}
                            </div>
                          ) : suggested ? (
                            <div>
                              <span className="inline-flex items-center gap-1 text-muted-foreground">
                                <Sparkles className="h-3.5 w-3.5" /> {suggested.name}?
                              </span>
                              <div className="text-xs text-muted-foreground">{p.suggestion?.reason}</div>
                            </div>
                          ) : p.status === 'ignored' ? (
                            <span className="text-muted-foreground">Not a client payment</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-wrap justify-end gap-1">
                            {suggested && (
                              <Button size="sm" onClick={() => confirmSuggestion(p)}>
                                <Check className="mr-1 h-4 w-4" /> Confirm
                              </Button>
                            )}
                            {p.status !== 'ignored' && (
                              <Button size="sm" variant={suggested ? 'ghost' : 'outline'} onClick={() => setAssigning(p)}>
                                <Pencil className="mr-1 h-4 w-4" /> {p.status === 'assigned' || suggested ? 'Change' : 'Assign'}
                              </Button>
                            )}
                            {p.status === 'unassigned' && (
                              <Button size="sm" variant="ghost" title="Not a client payment" onClick={() => patch(p, { action: 'ignore' }, 'Ignored')}>
                                <Ban className="h-4 w-4" />
                              </Button>
                            )}
                            {p.status !== 'unassigned' && (
                              <Button size="sm" variant="ghost" title="Back to To assign" onClick={() => patch(p, { action: 'unassign' }, 'Moved back')}>
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AssignPaymentDialog
        payment={assigning}
        projects={data?.projects ?? []}
        invoices={data?.invoices ?? []}
        onOpenChange={(open) => !open && setAssigning(null)}
        onDone={load}
      />
    </Shell>
  );
}
