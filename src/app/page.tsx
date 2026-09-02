'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Lock, Sparkle } from '@phosphor-icons/react';
import { LoginForm, useAuth } from '@/modules/auth-access';
import { Skeleton } from '@/components/ui/skeleton';
import { AppNavigation } from '@/shared/ui';
import { DashboardAlertPanel } from '@/components/alerts/DashboardAlertPanel';
import { DailyHealthPanel } from '@/components/alerts/DailyHealthPanel';
import { RecentProjectsPanel } from '@/components/dashboard/RecentProjectsPanel';
import { useNavItems, type ResolvedNavItem } from '@/components/shell';
import { Kbd, KeyCombo, useListNavigation, useShortcut } from '@/shared/keyboard';
import { cn } from '@/lib/utils';

const MODULE_TINTS: Record<string, string> = {
  '/modules/project-links': 'bg-sky-500/12 text-sky-400',
  '/modules/proposal': 'bg-fuchsia-500/12 text-fuchsia-400',
  '/modules/screenshot-runner': 'bg-amber-500/12 text-amber-400',
  '/modules/internal-tools': 'bg-violet-500/12 text-violet-400',
  '/modules/checklist-creator': 'bg-emerald-500/12 text-emerald-400',
};

const MODULE_TAGS: Record<string, string> = {
  '/modules/proposal': 'AI',
  '/modules/checklist-creator': 'New',
};

function greeting(date: Date): string {
  const h = date.getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function ModuleRow({
  item,
  index,
  selected,
  rowProps,
}: {
  item: ResolvedNavItem;
  index: number;
  selected: boolean;
  rowProps: Record<string, unknown>;
}) {
  const router = useRouter();
  const locked = !item.loading && !item.hasAccess;
  const Icon = item.icon;
  const tag = MODULE_TAGS[item.href];

  // 1–9 jump straight to a module. Hidden from the sheet: the row itself shows the number.
  useShortcut({
    id: `home-open-${index}`,
    keys: String(index + 1),
    label: `Open ${item.label}`,
    group: 'Navigation',
    hidden: true,
    enabled: !locked,
    handler: () => router.push(item.href),
  });

  if (item.loading) {
    return (
      <div className="sh-row h-[4.25rem]">
        <Skeleton className="size-5 rounded" />
        <Skeleton className="size-10 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-64" />
        </div>
      </div>
    );
  }

  return (
    <Link
      href={locked ? '#' : item.href}
      aria-disabled={locked}
      onClick={(e) => locked && e.preventDefault()}
      className={cn('sh-row h-[4.25rem] group', locked && 'cursor-not-allowed')}
      {...rowProps}
    >
      <Kbd className={cn('shrink-0', selected && 'text-primary')}>{index + 1}</Kbd>
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg',
          locked ? 'bg-muted text-muted-foreground' : MODULE_TINTS[item.href] ?? 'bg-muted text-foreground',
        )}
      >
        {locked ? <Lock className="size-5" /> : <Icon className="size-5" weight="duotone" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn('truncate text-sm font-medium', locked && 'text-muted-foreground')}>{item.label}</span>
          {tag && !locked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-1.5 py-px text-[10px] font-medium text-primary">
              <Sparkle className="size-2.5" weight="fill" />
              {tag}
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {locked ? 'No access — ask an admin.' : item.description}
        </span>
      </span>
      <span className="hidden shrink-0 items-center gap-3 sm:flex">
        {!locked && <KeyCombo keys={item.keys} className="opacity-60 transition-opacity group-hover:opacity-100" />}
        <ArrowRight
          className={cn(
            'size-4 text-muted-foreground transition-all',
            selected ? 'translate-x-0 opacity-100 text-primary' : '-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100',
          )}
        />
      </span>
    </Link>
  );
}

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const modules = useNavItems().filter((item) => item.href !== '/');

  const { index, itemProps } = useListNavigation({
    count: modules.length,
    onSelect: (i) => {
      const item = modules[i];
      if (item && (item.loading || item.hasAccess)) router.push(item.href);
    },
    selectLabel: 'Open module',
    hint: true,
  });

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <AppNavigation title="Home" />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <div className="mb-8 space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-8 w-64" />
          </div>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Skeleton className="h-80 w-full rounded-xl" />
            <div className="space-y-4">
              <Skeleton className="h-36 w-full rounded-xl" />
              <Skeleton className="h-36 w-full rounded-xl" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!user) return <LoginForm />;

  const now = new Date();
  const firstName = user.displayName?.split(' ')[0] ?? user.email?.split('@')[0] ?? 'there';
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppNavigation title="Home" />

      <main className="relative flex-1">
        <div className="sh-glow pointer-events-none absolute inset-x-0 top-0 h-64" aria-hidden />
        <div className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <header className="mb-8">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{dateLabel}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              {greeting(now)}, {firstName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Press a number to open a module, or <KeyCombo keys="mod+k" className="mx-0.5" /> to go anywhere.
            </p>
          </header>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section aria-labelledby="modules-heading">
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 id="modules-heading" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Modules
                </h2>
                <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
                  <Kbd>J</Kbd>
                  <Kbd>K</Kbd>
                  <span>move</span>
                  <span className="mx-1 text-muted-foreground/40">·</span>
                  <Kbd>↵</Kbd>
                  <span>open</span>
                </span>
              </div>
              <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/70 bg-card/60">
                {modules.map((item, i) => (
                  <ModuleRow key={item.href} item={item} index={i} selected={i === index} rowProps={itemProps(i)} />
                ))}
              </div>
            </section>

            <aside className="space-y-6">
              <RecentProjectsPanel />
              <DashboardAlertPanel />
              <DailyHealthPanel />
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
