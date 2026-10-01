'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Project, ProjectChecklist, ProjectTimeline, SOPTemplate, Task } from '@/types';
import { AGENCY_CLOSE, AGENCY_START } from '@/lib/sop-templates';
import { cn } from '@/lib/utils';
import { checklistService } from '@/services/ChecklistService';
import { legacyClientPlan, normalizeClientPlan, resolveClientPlan } from '../../domain/client-plan';
import { resolveTimelinePlan, timelineStages, type TimelineStageSource } from '../../domain/client-timeline';
import { portalStageSources } from '../../domain/portal-sources';
import type { ResolvedPlan } from '../../domain/client-plan';
import { normalizeClientStatus } from '../../domain/client-portal.types';
import type { PortalLinkState } from '../../infrastructure/client-portal.repository';
import { ClientNowEditor } from '../components/ClientNowEditor';
import { ClientMeetingsCard } from '../components/ClientMeetingsCard';
import { ClientPlanEditor } from '../components/ClientPlanEditor';
import { ClientTimelineEditor } from '../components/ClientTimelineEditor';
import { ClientStatusChip } from '../components/ClientStatusChip';
import { PortalBrandingFields } from '../components/PortalBrandingFields';
import { PortalLinkCard } from '../components/PortalLinkCard';
import { ProjectSheetCard, useProjectSheet } from '../components/ProjectSheetCard';

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

const STAGE_STATE_WORD = { done: 'Done', current: 'Now', upcoming: 'Coming up' } as const;
const AGENCY_SECTIONS = [AGENCY_START, AGENCY_CLOSE];

/** "Done · 12 Oct", "Waiting on client", "In progress", "Planned · 3 Nov", "Not started". */
function stepWord(step: TimelineStageSource['steps'][number]): string {
  const day = step.endDate ?? step.startDate;
  if (step.state === 'done') return day ? `Done · ${formatDue(day)}` : 'Done';
  if (step.waiting) return 'Waiting on client';
  if (step.state === 'current') return 'In progress';
  return day ? `Planned · ${formatDue(day)}` : 'Not started';
}

/**
 * The process the client sees, step by step, as the checklist has it: each
 * step's state comes from ticking the checklist items its SOP files under it.
 * Read-only here; change it by ticking, or relabel it in the SOP.
 */
function ChecklistProcessList({ resolved, sources }: { resolved: ResolvedPlan; sources: TimelineStageSource[] }) {
  return (
    <div className="space-y-3">
      {resolved.stages.map((r, index) => {
        const steps = sources[index]?.steps ?? [];
        return (
          <section key={r.stage.id} aria-label={r.stage.title} className="space-y-1">
            <h4 className={cn('text-[11px] font-semibold uppercase tracking-wide', r.state === 'current' ? 'text-foreground' : 'text-muted-foreground')}>
              {r.stage.title} · {STAGE_STATE_WORD[r.state]}
            </h4>
            <ol className="divide-y divide-border/60">
              {steps.map((step) => (
                <li key={step.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
                  <span className={cn('text-sm', step.state === 'done' && 'text-muted-foreground')}>
                    {step.title}
                    {step.owner && (
                      <span className="ml-2 rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
                        {step.owner === 'client' ? 'Client' : 'Together'}
                      </span>
                    )}
                  </span>
                  <span className={cn('text-[11px] tabular-nums', step.waiting ? 'font-medium text-amber-700' : 'text-muted-foreground')}>
                    {stepWord(step)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

/**
 * The stages the project sheet's Timeline gives the client, read-only: they
 * are edited in the sheet, and the next read brings them here.
 */
function SheetStagesList({ resolved, sources }: { resolved: ResolvedPlan; sources: TimelineStageSource[] }) {
  return (
    <ol className="divide-y divide-border/60">
      {resolved.stages.map((r, index) => {
        const steps = sources[index]?.steps ?? [];
        const done = steps.filter((s) => s.state === 'done').length;
        const theirs = steps.filter((s) => s.owner === 'client' || s.owner === 'both').length;
        return (
          <li key={r.stage.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
            <span className={cn('text-sm', r.state === 'current' && 'font-medium')}>
              {index + 1}. {r.stage.title}
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {STAGE_STATE_WORD[r.state]} · {done}/{steps.length} milestones
              {theirs ? ` · ${theirs} the client's` : ''}
              {r.stage.startDate || r.stage.dueDate ? ` · ${[r.stage.startDate, r.stage.dueDate].filter(Boolean).join(' → ')}` : ''}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The SOPs this project's checklists were made from, for the client-step labels
 * of a checklist made before SOPs carried them. Read once per set of checklists;
 * a failed read leaves those labels out, as on the client's page.
 */
function useSourceTemplates(checklists: ProjectChecklist[]): SOPTemplate[] {
  const key = [...new Set(checklists.flatMap((c) => c.templateIds ?? [c.templateId]))].filter(Boolean).sort().join(',');
  const [templates, setTemplates] = useState<SOPTemplate[]>([]);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const ids = key.split(',');
    checklistService
      .getSOPTemplates()
      .then((all) => {
        if (!cancelled) setTemplates(all.filter((t) => ids.includes(t.id)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key]);
  return key ? templates : [];
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

  // The project sheet's Process when a sheet is bound and has one (moved along
  // by the checklist; unless the team chose the app's Timeline); then a
  // checklist labelled for the client; then the Timeline tab; then the plan.
  // The portal decides with the same function, so the two cannot disagree.
  const sheetState = useProjectSheet(project.id);
  const sheetRecord = sheetState.state?.sheet ?? null;
  const templates = useSourceTemplates(checklists);
  const appSources = useMemo(() => timelineStages(timeline, project.clientTimeline), [timeline, project.clientTimeline]);
  const picked = useMemo(
    () =>
      portalStageSources({
        checklists,
        templates,
        agency: AGENCY_SECTIONS,
        sheetTimeline: sheetRecord?.data?.timeline,
        stagesFrom: sheetRecord?.stagesFrom,
        timeline,
        timelineSettings: project.clientTimeline,
      }),
    [checklists, templates, sheetRecord, timeline, project.clientTimeline],
  );
  const fromSheet = picked.kind === 'sheet';
  const fromChecklist = picked.kind === 'checklist';
  const fromTimeline = picked.kind === 'timeline';
  const timelineSources = picked.sources;
  const byPhase = picked.kind !== null;
  const timelineResolved = useMemo(
    () => (byPhase ? resolveTimelinePlan(timelineSources, { currentStageId: facing?.currentStageId, status }) : null),
    [byPhase, timelineSources, facing?.currentStageId, status],
  );
  const timelineFollowing = useMemo(
    () => (byPhase ? resolveTimelinePlan(timelineSources) : null),
    [byPhase, timelineSources],
  );

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
          </CardHeader>
          <CardContent>
            {byPhase ? (
              <ClientNowEditor
                project={project}
                stages={timelineSources.map((source) => source.stage)}
                following={timelineFollowing}
                userEmail={userEmail}
                followSource={fromSheet ? 'sheet' : fromChecklist ? 'checklist' : 'timeline'}
              />
            ) : (
              <ClientNowEditor
                project={project}
                stages={plan ? plan.stages : null}
                following={following}
                userEmail={userEmail}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="gap-3">
        <CardHeader>
          <SectionTitle>Project sheet</SectionTitle>
          <CardDescription className="text-xs">
            The Google Sheet the team runs the project in. The client&apos;s page reads it; the app never writes to it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectSheetCard projectId={project.id} sheetState={sheetState} hasAppTimeline={appSources.length > 0} />
        </CardContent>
      </Card>

      {fromSheet && timelineResolved ? (
        <Card className="gap-3">
          <CardHeader>
            <SectionTitle>Stages: from the project sheet</SectionTitle>
            <CardDescription className="text-xs">
              Each stage in the sheet&apos;s Process tab is a stage on the client&apos;s page, with its steps; rows the Who
              column gives to the client show as theirs. Edit them in the sheet.
              {picked.process.length > 0 &&
                (picked.unmatched.length === 0
                  ? ' Every step moves with the checklist as you tick it.'
                  : ` ${picked.followed} step${picked.followed === 1 ? '' : 's'} move with the checklist as you tick it; these move only in the sheet: ${picked.unmatched.join(', ')}.`)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SheetStagesList resolved={timelineResolved} sources={timelineSources} />
          </CardContent>
        </Card>
      ) : fromChecklist && timelineResolved ? (
        <Card className="gap-3">
          <CardHeader>
            <SectionTitle>Process: from the checklist</SectionTitle>
            <CardDescription className="text-xs">
              What the client sees, step by step. Each step moves as you tick the checklist items behind it, and is done on
              the day the last one is ticked. A client step reads “Waiting on you” to them while its item is In progress, so
              set it In progress when you send something for review. The labels come from the SOP in the Checklist Creator.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChecklistProcessList resolved={timelineResolved} sources={timelineSources} />
          </CardContent>
        </Card>
      ) : fromTimeline && timeline ? (
        <Card className="gap-3">
          <CardHeader>
            <SectionTitle>Stages: from the Timeline</SectionTitle>
            <CardDescription className="text-xs">
              Each Timeline phase is a stage on the client&apos;s page, with its milestones, meetings and files. Edit phases
              and dates on the Timeline tab; here, choose which milestones the client sees and attach files to each stage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ClientTimelineEditor project={project} timeline={timeline} resolved={timelineResolved} userEmail={userEmail} />
          </CardContent>
        </Card>
      ) : (
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
      )}

      <Card className="gap-3">
        <CardHeader>
          <SectionTitle>Meetings</SectionTitle>
          <CardDescription className="text-xs">
            Calls from Fathom with this client, filed under the stage they happened in. Nothing reaches the client until
            you open a call and press Share.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClientMeetingsCard
            projectId={project.id}
            stages={byPhase ? timelineSources.map((source) => source.stage) : (plan?.stages ?? [])}
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
