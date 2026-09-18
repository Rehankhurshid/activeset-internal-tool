'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import type { ProjectLink, ProjectTimeline, TimelineMilestone, TimelinePhase } from '@/types';
import { TIMELINE_STATUS_LABELS } from '@/types';
import { timelineRepository } from '@/modules/timeline';
import { cn } from '@/lib/utils';
import { clientPortalRepository } from '../../infrastructure/client-portal.repository';
import { StartPlanFromTemplate } from './StartPlanFromTemplate';

interface PortalVisibilityListsProps {
  projectId: string;
  timeline: ProjectTimeline | null;
  links: ProjectLink[];
}

interface PhaseGroup {
  key: string;
  title: string;
  milestones: TimelineMilestone[];
}

function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatRange(start: string, end: string): string {
  if (!start) return '';
  if (!end || end === start) return formatDay(start);
  return `${formatDay(start)} – ${formatDay(end)}`;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function groupByPhase(phases: TimelinePhase[], milestones: TimelineMilestone[]): PhaseGroup[] {
  const byStart = (a: TimelineMilestone, b: TimelineMilestone) =>
    a.startDate.localeCompare(b.startDate) || a.order - b.order;
  const sortedPhases = [...phases].sort((a, b) => a.order - b.order);
  const known = new Set(sortedPhases.map((p) => p.id));
  const groups: PhaseGroup[] = sortedPhases.map((p) => ({
    key: p.id,
    title: p.title,
    milestones: milestones.filter((m) => m.phaseId === p.id).sort(byStart),
  }));
  const loose = milestones.filter((m) => !m.phaseId || !known.has(m.phaseId)).sort(byStart);
  if (loose.length > 0) groups.push({ key: '__none__', title: 'No phase', milestones: loose });
  return groups.filter((g) => g.milestones.length > 0);
}

function SectionHeader({ title, visible, total }: { title: string; visible: number; total: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {total === 0 ? 'none' : `${visible} of ${total} visible`}
      </span>
    </div>
  );
}

interface RowProps {
  id: string;
  title: string;
  meta: string;
  checked: boolean;
  pending: boolean;
  onChange: (next: boolean) => void;
}

function VisibilityRow({ id, title, meta, checked, pending, onChange }: RowProps) {
  const switchId = `portal-visible-${id}`;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <Switch id={switchId} checked={checked} disabled={pending} onCheckedChange={onChange} aria-label={`Show “${title}” to the client`} />
      <label htmlFor={switchId} className={cn('min-w-0 flex-1 cursor-pointer', pending && 'opacity-60')}>
        <span className="block truncate text-sm">{title}</span>
        {meta && <span className="block truncate text-[11px] text-muted-foreground">{meta}</span>}
      </label>
    </div>
  );
}

/**
 * The two allow-lists the portal reads: which milestones and which manual
 * links the client can see. Nothing here widens beyond the switches — the
 * projection only ever includes rows flagged `clientVisible: true`.
 */
export function PortalVisibilityLists({ projectId, timeline, links }: PortalVisibilityListsProps) {
  const [pending, setPending] = useState<Set<string>>(() => new Set());

  const milestones = useMemo(() => timeline?.milestones ?? [], [timeline?.milestones]);
  const groups = useMemo(() => groupByPhase(timeline?.phases ?? [], milestones), [timeline?.phases, milestones]);
  const manualLinks = useMemo(
    () => links.filter((l) => l.source !== 'auto').sort((a, b) => a.order - b.order),
    [links],
  );

  const visibleMilestones = milestones.filter((m) => m.clientVisible === true).length;
  const visibleLinks = manualLinks.filter((l) => l.clientVisible === true).length;

  const track = async (key: string, work: () => Promise<void>, failure: string) => {
    setPending((s) => new Set(s).add(key));
    try {
      await work();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : failure);
    } finally {
      setPending((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
    }
  };

  const setMilestoneVisible = (m: TimelineMilestone, clientVisible: boolean) =>
    track(
      `m:${m.id}`,
      () => timelineRepository.setMilestoneClientVisible(projectId, m.id, clientVisible),
      'Failed to update milestone visibility',
    );

  const setLinkVisible = (l: ProjectLink, clientVisible: boolean) =>
    track(
      `l:${l.id}`,
      () => clientPortalRepository.updateLinkClientVisibility(projectId, l.id, clientVisible),
      'Failed to update link visibility',
    );

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <SectionHeader title="Milestones" visible={visibleMilestones} total={milestones.length} />
        {milestones.length === 0 ? (
          <StartPlanFromTemplate projectId={projectId} />
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <div key={g.key}>
                <p className="mb-0.5 text-xs font-medium text-muted-foreground">{g.title}</p>
                <div className="divide-y divide-border/60">
                  {g.milestones.map((m) => (
                    <VisibilityRow
                      key={m.id}
                      id={m.id}
                      title={m.title}
                      meta={[formatRange(m.startDate, m.endDate), TIMELINE_STATUS_LABELS[m.status]].filter(Boolean).join(' · ')}
                      checked={m.clientVisible === true}
                      pending={pending.has(`m:${m.id}`)}
                      onChange={(next) => void setMilestoneVisible(m, next)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <SectionHeader title="Deliverables" visible={visibleLinks} total={manualLinks.length} />
        {manualLinks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No manual links yet. Add links from the Links tab, then switch on the ones the client should see.
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {manualLinks.map((l) => (
              <VisibilityRow
                key={l.id}
                id={l.id}
                title={l.title}
                meta={hostnameOf(l.url)}
                checked={l.clientVisible === true}
                pending={pending.has(`l:${l.id}`)}
                onChange={(next) => void setLinkVisible(l, next)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
