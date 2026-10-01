'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Project, ProjectChecklist, ProjectTimeline, SOPTemplate, Task } from '@/types';
import { AGENCY_CLOSE, AGENCY_START } from '@/lib/sop-templates';
import { cn } from '@/lib/utils';
import { checklistService } from '@/services/ChecklistService';
import { legacyClientPlan, normalizeClientPlan, resolveClientPlan, type ResolvedPlan } from '../../domain/client-plan';
import { resolveTimelinePlan, type TimelineStageSource } from '../../domain/client-timeline';
import { portalStageSources } from '../../domain/portal-sources';
import { normalizeClientStatus } from '../../domain/client-portal.types';
import type { PortalLinkState } from '../../infrastructure/client-portal.repository';
import { ClientMeetingsCard } from '../components/ClientMeetingsCard';
import { ClientStatusChip } from '../components/ClientStatusChip';
import { PortalBrandingFields } from '../components/PortalBrandingFields';
import { PortalLinkCard } from '../components/PortalLinkCard';
import { useProjectSheet } from '../components/ProjectSheetCard';
import { ProjectSheetPanel } from '../components/ProjectSheetPanel';

interface ClientPanelProps {
  project: Project;
  /** The Timeline tab, for a project whose checklist says nothing to the client. */
  timeline: ProjectTimeline | null;
  /** The checklist the client's page follows. Already subscribed by the project screen. */
  checklists?: ProjectChecklist[];
  userEmail: string;
  /** Unused; kept so the project screen's call stays the same. */
  isAdmin: boolean;
  /** Unused since the asks list left this tab: the Tasks tab owns them, the client's page shows them. */
  tasks?: Task[];
}

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <CardTitle className={cn('text-[11px] font-semibold uppercase tracking-wide text-muted-foreground', className)}>
      {children}
    </CardTitle>
  );
}

function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const STAGE_STATE_WORD = { done: 'Done', current: 'Now', upcoming: 'Coming up' } as const;

/** "Now", "Done", "Coming up", or "3/4 done" for a stage passed with something still open. */
function stageWord(state: keyof typeof STAGE_STATE_WORD, steps: TimelineStageSource['steps']): string {
  if (state === 'current') return 'Now';
  const done = steps.filter((s) => s.state === 'done').length;
  if (steps.length > 0 && done === steps.length) return 'Done';
  return done > 0 ? `${done}/${steps.length} done` : STAGE_STATE_WORD[state];
}
const AGENCY_SECTIONS = [AGENCY_START, AGENCY_CLOSE];

/** "Done · 12 Oct", "Waiting on client", "In progress", "Planned · 3 Nov", "Not started". */
function stepWord(step: TimelineStageSource['steps'][number]): string {
  const day = step.endDate ?? step.startDate;
  if (step.state === 'done') return day ? `Done · ${formatDay(day)}` : 'Done';
  if (step.waiting) return 'Waiting on client';
  if (step.state === 'current') return 'In progress';
  return day ? `Planned · ${formatDay(day)}` : 'Not started';
}

/** Every step the client sees, stage by stage, as their page shows it. Read-only. */
function StepsList({ resolved, sources }: { resolved: ResolvedPlan; sources: TimelineStageSource[] }) {
  return (
    <div className="space-y-3">
      {resolved.stages.map((r, index) => {
        const steps = sources[index]?.steps ?? [];
        return (
          <section key={r.stage.id} aria-label={r.stage.title} className="space-y-1">
            <h4
              className={cn(
                'text-[11px] font-semibold uppercase tracking-wide',
                r.state === 'current' ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {r.stage.title} · {stageWord(r.state, steps)}
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
                  <span
                    className={cn(
                      'text-[11px] tabular-nums',
                      step.waiting ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground',
                    )}
                  >
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

/** A plan's stages, read-only: for a project whose checklist says nothing to the client. */
function PlanList({ resolved }: { resolved: ResolvedPlan }) {
  return (
    <ol className="divide-y divide-border/60">
      {resolved.stages.map((r, index) => (
        <li key={r.stage.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
          <span className={cn('text-sm', r.state === 'current' && 'font-medium')}>
            {index + 1}. {r.stage.title}
          </span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {STAGE_STATE_WORD[r.state]}
            {r.tracking && r.tracking.total > 0 ? ` · ${r.tracking.done}/${r.tracking.total} on the checklist` : ''}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The SOPs this project's checklists were made from, for the client-step labels
 * of a checklist that does not carry them itself. Read once per set of
 * checklists; a failed read leaves those labels out, as on the client's page.
 */
function useSourceTemplates(checklists: ProjectChecklist[]): { templates: SOPTemplate[]; loading: boolean } {
  const key = [...new Set(checklists.flatMap((c) => c.templateIds ?? [c.templateId]))].filter(Boolean).sort().join(',');
  const [loaded, setLoaded] = useState<{ key: string; templates: SOPTemplate[] } | null>(null);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const ids = key.split(',');
    checklistService
      .getSOPTemplates()
      .then((all) => all.filter((t) => ids.includes(t.id)))
      .catch(() => [] as SOPTemplate[])
      .then((templates) => {
        if (!cancelled) setLoaded({ key, templates });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);
  if (!key) return { templates: [], loading: false };
  return loaded?.key === key ? { templates: loaded.templates, loading: false } : { templates: [], loading: true };
}

/**
 * The Client tab, lean: the link, the sheet, what the client sees, and calls to
 * share. Nothing here moves the client's page by hand. Rehan, 2026-10-01: the
 * checklist manages it, so where the project is comes from ticking the
 * checklist (or the project sheet), and this tab only shows the result.
 */
export function ClientPanel(props: ClientPanelProps) {
  const { project, timeline, userEmail, checklists = [] } = props;
  const [link, setLink] = useState<PortalLinkState | null>(null);
  const enabled = link ? link.enabled : project.clientPortal?.enabled === true;
  const status = normalizeClientStatus(project.clientFacing?.status);

  const sheetState = useProjectSheet(project.id);
  const sheetRecord = sheetState.state?.sheet ?? null;
  const { templates, loading: templatesLoading } = useSourceTemplates(checklists);
  // Decided by the same function as the client's page, so the two cannot disagree.
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
  const steps = useMemo(() => (picked.kind ? resolveTimelinePlan(picked.sources, { status }) : null), [picked, status]);

  // No source with steps: the saved plan, else what an old portal was showing.
  const plan = useMemo(() => (project.clientPlan ? normalizeClientPlan(project.clientPlan) : null), [project.clientPlan]);
  const currentPhaseId = project.clientFacing?.currentPhaseId;
  const planResolved = useMemo(() => {
    if (picked.kind) return null;
    const legacy = plan ? null : legacyClientPlan({ timeline, links: project.links, currentPhaseId });
    const shown = plan ?? legacy?.plan;
    return shown ? resolveClientPlan(shown, checklists, { currentStageId: legacy?.currentStageId, status }) : null;
  }, [picked.kind, plan, timeline, project.links, currentPhaseId, checklists, status]);

  const source =
    picked.kind === 'checklist'
      ? 'From the checklist: each step moves as you tick its items. Press “Sent · waiting on them” on a client’s step when it goes out, and their page says it is waiting on them.'
      : picked.kind === 'sheet'
        ? picked.process.length === 0
          ? 'From the project sheet’s Process tab.'
          : picked.unmatched.length === 0
            ? 'From the project sheet; every step moves with the checklist.'
            : `From the project sheet. ${picked.followed} step${picked.followed === 1 ? '' : 's'} move with the checklist; these move only in the sheet: ${picked.unmatched.join(', ')}.`
        : picked.kind === 'timeline'
          ? 'From the Timeline tab: this checklist does not say what the client sees.'
          : planResolved
            ? 'The plan’s stages, moved along by the checklist.'
            : '';

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
          </CardHeader>
          <CardContent>
            <PortalLinkCard projectId={project.id} project={project} onStateChange={setLink} />
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader>
            <SectionTitle>Project sheet</SectionTitle>
          </CardHeader>
          <CardContent>
            <ProjectSheetPanel projectId={project.id} sheetState={sheetState} hasAppTimeline={picked.kind === 'timeline'} />
          </CardContent>
        </Card>
      </div>

      <Card className="gap-3">
        <CardHeader>
          <SectionTitle>What the client sees</SectionTitle>
          {source && !templatesLoading && <CardDescription className="text-xs">{source}</CardDescription>}
        </CardHeader>
        <CardContent>
          {templatesLoading ? (
            <p className="text-sm text-muted-foreground">Reading the checklist…</p>
          ) : steps ? (
            <StepsList resolved={steps} sources={picked.sources} />
          ) : planResolved ? (
            <PlanList resolved={planResolved} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing yet. Add a checklist from one of our services on the Checklist tab, and the client&apos;s process appears
              here as you tick it.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="gap-3">
        <CardHeader>
          <SectionTitle>Meetings</SectionTitle>
          <CardDescription className="text-xs">
            Calls from Fathom with this client. Nothing reaches the client until you open a call and press Share.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClientMeetingsCard
            projectId={project.id}
            stages={picked.kind ? picked.sources.map((s) => s.stage) : (planResolved?.stages.map((r) => r.stage) ?? [])}
            userEmail={userEmail}
          />
        </CardContent>
      </Card>

      {/* Set once per project, so out of the way. */}
      <details className="group rounded-xl border bg-card px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" aria-hidden="true" />
          Page header: name, welcome line, client contacts
        </summary>
        <div className="mt-3 space-y-4">
          <PortalBrandingFields project={project} />
        </div>
      </details>
    </div>
  );
}
