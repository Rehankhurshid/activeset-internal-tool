'use client';

import { BellRing, Handshake, Link2, ListTodo } from 'lucide-react';
import type { Project } from '@/types';
import {
  CLIENT_STATUS_LABELS,
  PORTAL_STALE_AFTER_DAYS,
  ageLabel,
  daysSinceClientUpdate,
  isPortalStale,
  normalizeClientStatus,
} from '@/modules/client-portal';
import { todayIso } from '@/lib/review-status';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ProjectClientFlowBannerProps {
  project: Project;
  className?: string;
  onOpenClientTab: () => void;
  onCopyPortalLink: () => void;
  onOpenTasksTab: () => void;
  isCopyingLink?: boolean;
}

/**
 * One actionable strip on the project page for the client portal: enable the
 * link, nudge when the client owes input, or when the portal has gone quiet.
 */
export function ProjectClientFlowBanner({
  project,
  className,
  onOpenClientTab,
  onCopyPortalLink,
  onOpenTasksTab,
  isCopyingLink,
}: ProjectClientFlowBannerProps) {
  const enabled = project.clientPortal?.enabled === true;
  const status = normalizeClientStatus(project.clientFacing?.status);
  const today = todayIso();
  const stale = enabled && isPortalStale(project, today);
  const days = daysSinceClientUpdate(project.clientFacing, today);

  if (status === 'delivered') return null;

  if (!enabled) {
    return (
      <FlowShell tone="neutral" className={className} icon={Handshake} title="Client portal is off">
        <p className="text-sm text-muted-foreground">
          Turn on a private dashboard link so {project.client?.trim() || 'the client'} can see progress, files, and
          what you need from them.
        </p>
        <Actions>
          <Button size="sm" onClick={onOpenClientTab}>
            Set up client link
          </Button>
        </Actions>
      </FlowShell>
    );
  }

  if (status === 'needs_client') {
    return (
      <FlowShell tone="attention" className={className} icon={Handshake} title="Waiting on client">
        <p className="text-sm text-muted-foreground">
          Their dashboard shows{' '}
          <span className="font-medium text-foreground">{CLIENT_STATUS_LABELS.needs_client}</span>. Send the portal link
          again or check open asks on Tasks.
        </p>
        <Actions>
          <Button size="sm" variant="secondary" onClick={onCopyPortalLink} disabled={isCopyingLink}>
            <Link2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Copy portal link
          </Button>
          <Button size="sm" variant="outline" onClick={onOpenTasksTab}>
            <ListTodo className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Open tasks
          </Button>
          <Button size="sm" variant="ghost" onClick={onOpenClientTab}>
            Client tab
          </Button>
        </Actions>
      </FlowShell>
    );
  }

  if (status === 'blocked') {
    return (
      <FlowShell tone="attention" className={className} icon={Handshake} title="Blocked">
        <p className="text-sm text-muted-foreground">
          Marked blocked internally. Update the checklist or client status when you are moving again.
        </p>
        <Actions>
          <Button size="sm" onClick={onOpenClientTab}>
            Review client view
          </Button>
        </Actions>
      </FlowShell>
    );
  }

  if (stale) {
    return (
      <FlowShell tone="attention" className={className} icon={BellRing} title="Client updates due">
        <p className="text-sm text-muted-foreground">
          No checklist-driven update in {PORTAL_STALE_AFTER_DAYS}+ days
          {days === null ? ' (never)' : ` (last ${ageLabel(days)})`}. Tick progress on the Checklist so their page
          stays fresh.
        </p>
        <Actions>
          <Button size="sm" onClick={onOpenClientTab}>
            Open Client tab
          </Button>
          <Button size="sm" variant="outline" onClick={onCopyPortalLink} disabled={isCopyingLink}>
            Copy portal link
          </Button>
        </Actions>
      </FlowShell>
    );
  }

  return null;
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 pt-1">{children}</div>;
}

function FlowShell({
  tone,
  icon: Icon,
  title,
  children,
  className,
}: {
  tone: 'neutral' | 'attention';
  icon: typeof Handshake;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="region"
      aria-label={title}
      className={cn(
        'rounded-xl border p-3 sm:p-4',
        tone === 'attention'
          ? 'border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent'
          : 'border-border/60 bg-muted/30',
        className,
      )}
    >
      <div className="flex gap-3">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            tone === 'attention' ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
