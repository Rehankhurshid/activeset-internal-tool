import type { ClientPlanStage } from '@/types';
import { isIsoDay } from './client-plan';
import type { TimelineStageSource, TimelineStep } from './client-timeline';
import type {
  PortalAskView,
  PortalChangeView,
  PortalFactsView,
  PortalFileView,
  PortalReadinessView,
  PortalWorkstreamView,
} from './client-portal.types';
import { workItemState } from './project-sheet.read';
import type { ProjectSheetData, ProjectSheetSnapshot, SheetOverview, SheetTimeline, WorkState } from './project-sheet.types';
import { slug, uniqueIds } from './project-sheet.values';

/**
 * The project sheet, as pieces of the client's page. Pure, and the only place
 * sheet data turns into portal views, so the projection's allow-list test
 * covers it.
 */

/**
 * Each sheet phase's stage id, by phase key: stable while the phase cell's
 * text stays the same, and unique even when two phases slug alike
 * ("Phase 1 – Design" and "Phase 1 - Design").
 */
export function sheetStageIds(timeline: SheetTimeline | undefined): Map<string, string> {
  const phases = (timeline?.phases ?? []).filter((p) => p.milestones.length > 0);
  const ids = uniqueIds(phases, (p) => `sheet-${slug(p.key)}`);
  return new Map(phases.map((p, i) => [p.key, ids[i]]));
}

function stepStateOf(state: WorkState): TimelineStep['state'] {
  if (state === 'done' || state === 'not_needed') return 'done';
  if (state === 'not_started') return 'upcoming';
  return 'current';
}

/**
 * The sheet's Timeline phases as stages, in the shape the app's Timeline tab
 * already produces, so the same resolver picks the current stage the same way:
 * the earliest phase with a milestone not done.
 */
export function sheetStageSources(timeline: SheetTimeline | undefined): TimelineStageSource[] {
  if (!timeline) return [];
  const ids = sheetStageIds(timeline);
  return timeline.phases
    .filter((phase) => phase.milestones.length > 0)
    .map((phase) => {
      // The milestones' own dates first; else the phase's, from the Overview.
      const starts = phase.milestones.map((m) => m.start?.iso).filter(isIsoDay).sort();
      const ends = phase.milestones.map((m) => m.end?.iso ?? m.start?.iso).filter(isIsoDay).sort();
      if (starts.length === 0 && isIsoDay(phase.start?.iso)) starts.push(phase.start.iso);
      if (ends.length === 0 && isIsoDay(phase.end?.iso)) ends.push(phase.end.iso);
      const stage: ClientPlanStage = { id: ids.get(phase.key)!, title: phase.title, deliverables: [], files: [] };
      if (starts.length) stage.startDate = starts[0];
      if (ends.length) stage.dueDate = ends[ends.length - 1];
      return {
        stage,
        steps: phase.milestones.map((m) => {
          const step: TimelineStep = { id: m.id, title: m.title, state: stepStateOf(m.state) };
          if (m.start?.iso) step.startDate = m.start.iso;
          if (m.end?.iso) step.endDate = m.end.iso;
          if (m.owner === 'client' || m.owner === 'both') step.owner = m.owner;
          return step;
        }),
      };
    });
}

export function sheetFacts(overview: SheetOverview | undefined): PortalFactsView | undefined {
  if (!overview) return undefined;
  const facts: PortalFactsView = {};
  if (overview.engagement) facts.engagement = overview.engagement;
  if (overview.kickoff?.iso) facts.kickoffDate = overview.kickoff.iso;
  if (overview.targetLaunch?.iso) facts.targetLaunchDate = overview.targetLaunch.iso;
  else if (overview.targetLaunch?.text) facts.targetLaunchText = overview.targetLaunch.text;
  return Object.keys(facts).length ? facts : undefined;
}

/** The Overview's KEY LINKS, and the sheet itself when the team links the client to it. */
export function sheetFiles(sheet: ProjectSheetSnapshot): PortalFileView[] {
  const files: PortalFileView[] = [];
  if (sheet.showSheetLink && sheet.url) files.push({ id: 'project-sheet', title: 'Project sheet', url: sheet.url });
  (sheet.data.overview?.links ?? []).forEach((link, index) => {
    files.push({ id: `sheet-link-${index}`, title: link.title, url: link.url });
  });
  return files;
}

export function sheetWork(data: ProjectSheetData, stageIds: Set<string>): PortalWorkstreamView[] {
  const byPhase = sheetStageIds(data.timeline);
  return data.workstreams
    .filter((stream) => stream.items.length > 0)
    .map((stream) => ({
      id: stream.id,
      title: stream.title,
      tracks: stream.tracks.map((t) => t.label),
      items: stream.items.map((item) => {
        const view: PortalWorkstreamView['items'][number] = {
          id: item.id,
          title: item.title,
          state: workItemState(item),
          states: [...item.states],
          links: item.links.map((link, index) => ({ id: `${item.id}-l${index}`, title: link.title, url: link.url })),
        };
        if (item.group) view.group = item.group;
        if (item.phaseKey) {
          const stageId = byPhase.get(item.phaseKey);
          if (stageId && stageIds.has(stageId)) view.stageId = stageId;
        }
        if (item.target?.iso) view.targetDate = item.target.iso;
        else if (item.target?.text) view.targetText = item.target.text;
        return view;
      }),
    }));
}

/**
 * Open client inputs and decisions, then the `[Fill this]` tabs still to fill.
 * A received input is counted, not listed: the client does not need a list of
 * what they already sent.
 */
export function sheetAsks(sheet: ProjectSheetSnapshot): { asks: PortalAskView[]; received: number } {
  const { data } = sheet;
  const asks: PortalAskView[] = [];
  let received = 0;
  for (const input of data.inputs) {
    if (input.state === 'received') received++;
    if (input.state !== 'pending') continue;
    const ask: PortalAskView = { id: input.id, title: input.title, kind: input.kind };
    if (input.neededBy?.iso) ask.dueDate = input.neededBy.iso;
    else if (input.neededBy?.text) ask.dueText = input.neededBy.text;
    if (input.why) ask.why = input.why;
    if (input.group) ask.group = input.group;
    if (input.owner) ask.owner = input.owner;
    if (input.link) ask.url = input.link;
    asks.push(ask);
  }
  for (const fill of data.fills) {
    if (fill.total !== undefined && fill.filled !== undefined && fill.total > 0 && fill.filled >= fill.total) continue;
    const ask: PortalAskView = { id: `fill-${slug(fill.tab)}`, title: `Fill in ${fill.label}`, kind: 'fill' };
    if (fill.total) ask.progress = { done: fill.filled ?? 0, total: fill.total };
    if (sheet.showSheetLink && sheet.url) ask.url = sheet.url;
    asks.push(ask);
  }
  return { asks, received };
}

export function sheetChanges(data: ProjectSheetData): PortalChangeView[] {
  return data.changes.map((change) => {
    const view: PortalChangeView = { id: change.id, title: change.title, state: change.state };
    if (change.ref) view.ref = change.ref;
    if (change.raised?.iso) view.raisedDate = change.raised.iso;
    if (change.affects) view.affects = change.affects;
    if (change.estimate) view.estimate = change.estimate;
    if (change.days) view.days = change.days;
    return view;
  });
}

export function sheetReadiness(data: ProjectSheetData): PortalReadinessView[] {
  const out: PortalReadinessView[] = [];
  if (data.launch) {
    const groups = data.launch.groups
      .filter((g) => g.checks.length > 0)
      .map((g) => ({
        title: g.title,
        done: g.checks.filter((c) => c.done).length,
        total: g.checks.length,
        checks: g.checks.map((c) => ({ title: c.title, done: c.done })),
      }));
    const total = groups.reduce((n, g) => n + g.total, 0);
    if (total > 0) {
      out.push({ id: 'launch', title: 'Launch checklist', done: groups.reduce((n, g) => n + g.done, 0), total, groups });
    }
  }
  for (const seo of data.seo) {
    if (seo.pages === 0) continue;
    out.push({ id: `seo-${slug(seo.tab)}`, title: seo.language ? `SEO tags (${seo.language})` : 'SEO tags', done: seo.filled, total: seo.pages });
  }
  if (data.redirects && data.redirects.total > 0) {
    out.push({ id: 'redirects', title: 'Redirects mapped', done: data.redirects.mapped, total: data.redirects.total });
  }
  return out;
}
