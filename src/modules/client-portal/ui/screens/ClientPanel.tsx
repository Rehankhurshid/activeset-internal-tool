'use client';

import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Project, ProjectTimeline, Task } from '@/types';
import { cn } from '@/lib/utils';
import type { PortalLinkState } from '../../infrastructure/client-portal.repository';
import { ClientStatusChip } from '../components/ClientStatusChip';
import { ClientStatusEditor } from '../components/ClientStatusEditor';
import { ClientUpdateComposer } from '../components/ClientUpdateComposer';
import { PortalBrandingFields } from '../components/PortalBrandingFields';
import { PortalLinkCard } from '../components/PortalLinkCard';
import { PortalVisibilityLists } from '../components/PortalVisibilityLists';

interface ClientPanelProps {
  project: Project;
  timeline: ProjectTimeline | null;
  userEmail: string;
  /** Reserved for admin-only controls (client contacts / per-contact links) in the next phase. */
  isAdmin: boolean;
  /**
   * Optional. Used read-only: to name the ask a client reply answers, and to
   * show which asks are currently published. The panel never subscribes to
   * tasks itself — when the caller has them, it passes them down.
   */
  tasks?: Task[];
}

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <CardTitle className={cn('text-[11px] font-semibold uppercase tracking-wide text-muted-foreground', className)}>
      {children}
    </CardTitle>
  );
}

function formatDue(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * The asks the portal is publishing right now, read-only. There is no
 * visibility switch on these: `needsClientInput` on a not-done task sends the
 * task's title to the client verbatim, so the team needs to see the exact
 * wording somewhere. Editing happens on the task itself, hence the links out.
 */
function PublishedAsks({ tasks }: { tasks: Task[] }) {
  const asks = useMemo(
    () =>
      tasks
        .filter((t) => t.needsClientInput === true && t.status !== 'done')
        .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.order - b.order),
    [tasks],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Asks</h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {asks.length === 0 ? 'none' : `${asks.length} published`}
        </span>
      </div>
      {asks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing is being asked of the client right now. Tick “Needs client input” on a task to add one.
        </p>
      ) : (
        <div className="divide-y divide-border/60">
          {asks.map((t) => (
            <a
              key={t.id}
              href="?tab=tasks"
              className="group flex items-center gap-2 py-1.5 hover:bg-muted/40"
              title="Open the Tasks tab to edit the wording or clear the flag"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm group-hover:underline">{t.title}</span>
                {t.dueDate && (
                  <span className="block text-[11px] text-muted-foreground">Due {formatDue(t.dueDate)}</span>
                )}
              </span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Internal "Client" tab: the portal link, what the client is told, what they
 * can see, what they have written back, and how the page is branded.
 * Everything reads from the live project doc the detail screen already
 * subscribes to.
 */
export function ClientPanel(props: ClientPanelProps) {
  const { project, timeline, userEmail, tasks } = props;
  const [link, setLink] = useState<PortalLinkState | null>(null);
  const enabled = link ? link.enabled : project.clientPortal?.enabled === true;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">Client portal</h2>
        <ClientStatusChip project={project} size="md" />
        {!enabled && (
          <span className="text-xs text-muted-foreground">Off — the client cannot see anything until the portal is enabled.</span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card className="gap-3">
            <CardHeader>
              <SectionTitle>Portal link</SectionTitle>
              <CardDescription className="text-xs">
                A private, sign-in-free page showing status, plan and deliverables.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PortalLinkCard projectId={project.id} project={project} onStateChange={setLink} />
            </CardContent>
          </Card>

          <Card className="gap-3">
            <CardHeader>
              <SectionTitle>Status the client sees</SectionTitle>
              <CardDescription className="text-xs">
                Saving or “Mark updated” refreshes the freshness stamp on the portal.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ClientStatusEditor project={project} phases={timeline?.phases ?? []} userEmail={userEmail} />
            </CardContent>
          </Card>

          <Card className="gap-3">
            <CardHeader>
              <SectionTitle>Updates for the client</SectionTitle>
              <CardDescription className="text-xs">
                Short notes shown on the portal, newest first. The client reads them exactly as typed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ClientUpdateComposer projectId={project.id} userEmail={userEmail} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="gap-3">
            <CardHeader>
              <SectionTitle>What the client can see</SectionTitle>
              <CardDescription className="text-xs">
                Only switched-on milestones (title, dates, status) and links reach the portal.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PortalVisibilityLists projectId={project.id} timeline={timeline} links={project.links} />
            </CardContent>
          </Card>

          {tasks && (
            <Card className="gap-3">
              <CardHeader>
                <SectionTitle>What the client is being asked</SectionTitle>
                <CardDescription className="text-xs">
                  Every not-done task flagged “Needs client input” is published — there is no switch. The task title
                  is what the client reads, word for word.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PublishedAsks tasks={tasks} />
              </CardContent>
            </Card>
          )}

          <Card className="gap-3">
            <CardHeader>
              <SectionTitle>Branding</SectionTitle>
              <CardDescription className="text-xs">Header copy on the portal page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <PortalBrandingFields project={project} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
