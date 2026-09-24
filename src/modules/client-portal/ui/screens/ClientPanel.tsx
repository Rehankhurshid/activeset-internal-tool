'use client';

import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Project, ProjectChecklist, ProjectTimeline, Task } from '@/types';
import { cn } from '@/lib/utils';
import { legacyClientPlan, normalizeClientPlan, resolveClientPlan } from '../../domain/client-plan';
import { normalizeClientStatus } from '../../domain/client-portal.types';
import type { PortalLinkState } from '../../infrastructure/client-portal.repository';
import { ClientNowEditor } from '../components/ClientNowEditor';
import { ClientPlanEditor } from '../components/ClientPlanEditor';
import { ClientStatusChip } from '../components/ClientStatusChip';
import { PortalBrandingFields } from '../components/PortalBrandingFields';
import { PortalLinkCard } from '../components/PortalLinkCard';

interface ClientPanelProps {
  project: Project;
  /** Read only to show what an old portal still publishes before a plan is saved. */
  timeline: ProjectTimeline | null;
  /** The checklist the tracker follows. Already subscribed by the project screen. */
  checklists?: ProjectChecklist[];
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
 * The Client tab: the link to send, where the project is, and the plan the
 * client sees. Everything reads from the live project doc and checklist the
 * detail screen already subscribes to, and every change reaches the client's
 * page on their next visit.
 */
export function ClientPanel(props: ClientPanelProps) {
  const { project, timeline, userEmail, tasks, checklists = [] } = props;
  const [link, setLink] = useState<PortalLinkState | null>(null);
  const enabled = link ? link.enabled : project.clientPortal?.enabled === true;
  const facing = project.clientFacing;
  const status = normalizeClientStatus(facing?.status);

  const plan = useMemo(() => (project.clientPlan ? normalizeClientPlan(project.clientPlan) : null), [project.clientPlan]);
  // Until a plan is saved, an old portal keeps publishing its timeline and link switches.
  const legacy = useMemo(
    () => (plan ? null : legacyClientPlan({ timeline, links: project.links, currentPhaseId: facing?.currentPhaseId })),
    [plan, timeline, project.links, facing?.currentPhaseId],
  );
  const resolved = useMemo(() => {
    const shown = plan ?? legacy?.plan;
    if (!shown) return null;
    return resolveClientPlan(shown, checklists, {
      currentStageId: plan ? facing?.currentStageId : legacy?.currentStageId,
      status,
    });
  }, [plan, legacy, checklists, facing?.currentStageId, status]);
  const following = useMemo(() => (plan ? resolveClientPlan(plan, checklists) : null), [plan, checklists]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">Client dashboard</h2>
        <ClientStatusChip project={project} size="md" />
        {!enabled && (
          <span className="text-xs text-muted-foreground">Off: the client can&apos;t open anything until the link is on.</span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-3">
          <CardHeader>
            <SectionTitle>Link to send</SectionTitle>
            <CardDescription className="text-xs">
              A private page, no sign-in: where the project is, what they get and when, and the files.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PortalLinkCard projectId={project.id} project={project} onStateChange={setLink} />
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader>
            <SectionTitle>Now</SectionTitle>
            <CardDescription className="text-xs">Where the project is, in the client&apos;s words.</CardDescription>
          </CardHeader>
          <CardContent>
            <ClientNowEditor
              project={project}
              stages={plan ? plan.stages : null}
              resolved={resolved}
              following={following}
              userEmail={userEmail}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="gap-3">
        <CardHeader>
          <SectionTitle>Plan: what they get, and when</SectionTitle>
          <CardDescription className="text-xs">
            Stages with dates, what the client gets in each, and the files that go with them. Ticking the checklist moves
            the tracker; you can also move it by hand above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClientPlanEditor
            project={project}
            plan={plan}
            legacy={legacy}
            resolved={resolved}
            checklists={checklists}
            userEmail={userEmail}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {tasks && (
          <Card className="gap-3">
            <CardHeader>
              <SectionTitle>What we need from them</SectionTitle>
              <CardDescription className="text-xs">
                Every open task marked “Needs client input”, titled exactly as the client reads it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PublishedAsks tasks={tasks} />
            </CardContent>
          </Card>
        )}

        <Card className="gap-3">
          <CardHeader>
            <SectionTitle>Page header</SectionTitle>
            <CardDescription className="text-xs">The name and welcome line at the top of their page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <PortalBrandingFields project={project} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
