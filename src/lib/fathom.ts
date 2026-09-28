// No `server-only` guard: `npm run fathom:sync` runs this from a plain Node
// script, where that package does not exist. It reads firebase-admin and a
// server env var, so it cannot work in a browser bundle anyway.
import { db as adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import {
  meetingDomainsFor,
  stageForDate,
  timelineStages,
} from '@/modules/client-portal/domain/client-timeline';
import { normalizeClientPlan } from '@/modules/client-portal/domain/client-plan';
import type {
  ClientPlanStage,
  Project,
  ProjectMeeting,
  ProjectMeetingActionItem,
  ProjectMeetingAttendee,
  ProjectTimeline,
} from '@/types';

/**
 * Fathom calls, filed under the project and the stage they were about.
 *
 * Fathom records the team's calls. A call with someone from a client's email
 * domain belongs to that client's project, and to the Timeline phase (or plan
 * stage) its date falls in. Every call arrives `pending`: the client sees
 * nothing until someone in the Client tab reads it and presses Share, because
 * a Fathom summary is the team's candid notes, not a client document.
 *
 * API: https://developers.fathom.ai — `GET /external/v1/meetings`, `X-Api-Key`.
 */

const FATHOM_API = 'https://api.fathom.ai/external/v1/meetings';
const KEY_ENV = 'FATHOM_API_KEY';

export class FathomUnavailableError extends Error {
  constructor() {
    super('Fathom is not connected: add FATHOM_API_KEY to the environment (Fathom → Settings → API Access).');
    this.name = 'FathomUnavailableError';
  }
}

export const fathomConfigured = () => !!process.env[KEY_ENV];

/** The fields of Fathom's meeting item this app reads. */
interface FathomMeeting {
  title?: string;
  meeting_title?: string | null;
  recording_id: number;
  url?: string;
  share_url?: string;
  created_at?: string;
  scheduled_start_time?: string;
  recording_start_time?: string;
  recording_end_time?: string;
  calendar_invitees?: { name?: string | null; email?: string | null; email_domain?: string | null; is_external?: boolean }[];
  default_summary?: { markdown_formatted?: string | null } | null;
  action_items?: { description?: string; assignee?: { name?: string | null } | null }[] | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Every call created after `createdAfter` with someone external on it, optionally only these domains. */
export async function listFathomMeetings(options: { createdAfter: string; domains?: string[] }): Promise<FathomMeeting[]> {
  const key = process.env[KEY_ENV];
  if (!key) throw new FathomUnavailableError();
  const items: FathomMeeting[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 40; page += 1) {
    const params = new URLSearchParams({
      include_summary: 'true',
      include_action_items: 'true',
      calendar_invitees_domains_type: 'one_or_more_external',
      created_after: options.createdAfter,
    });
    for (const domain of options.domains ?? []) params.append('calendar_invitees_domains[]', domain);
    if (cursor) params.set('cursor', cursor);

    let res: Response | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      res = await fetch(`${FATHOM_API}?${params}`, { headers: { 'X-Api-Key': key, accept: 'application/json' } });
      if (res.status !== 429) break;
      const wait = Number(res.headers.get('retry-after'));
      await sleep(Math.min(60_000, Number.isFinite(wait) && wait > 0 ? wait * 1000 : 5_000 * (attempt + 1)));
    }
    if (!res || !res.ok) {
      throw new Error(`Fathom refused the meeting list (${res?.status ?? 'no response'})`);
    }
    const body = (await res.json()) as { items?: FathomMeeting[]; next_cursor?: string | null };
    items.push(...(body.items ?? []));
    cursor = body.next_cursor ?? null;
    if (!cursor) break;
  }
  return items;
}

function domainOf(invitee: { email?: string | null; email_domain?: string | null }): string | null {
  const domain = invitee.email_domain || invitee.email?.split('@')[1];
  return domain ? domain.trim().toLowerCase().replace(/^www\./, '') : null;
}

function toAttendees(meeting: FathomMeeting): ProjectMeetingAttendee[] {
  return (meeting.calendar_invitees ?? []).map((person) => {
    const attendee: ProjectMeetingAttendee = { external: person.is_external === true };
    if (person.name?.trim()) attendee.name = person.name.trim();
    if (person.email?.trim()) attendee.email = person.email.trim().toLowerCase();
    return attendee;
  });
}

function toActionItems(meeting: FathomMeeting): ProjectMeetingActionItem[] {
  return (meeting.action_items ?? [])
    .filter((item) => item?.description?.trim())
    .map((item) => {
      const out: ProjectMeetingActionItem = { text: item.description!.trim() };
      if (item.assignee?.name?.trim()) out.owner = item.assignee.name.trim();
      return out;
    });
}

/** The stages a call can be filed under: the Timeline's phases, else the plan's stages. */
function stagesOf(project: Project, timeline: ProjectTimeline | null): Pick<ClientPlanStage, 'id' | 'startDate' | 'dueDate'>[] {
  const fromTimeline = timelineStages(timeline, project.clientTimeline).map((source) => source.stage);
  if (fromTimeline.length) return fromTimeline;
  return project.clientPlan ? normalizeClientPlan(project.clientPlan).stages : [];
}

export interface FathomSyncResult {
  seen: number;
  /** Calls written, per project name. */
  filed: Record<string, number>;
  added: number;
}

/**
 * Pull calls from Fathom and file each under every project whose client
 * domain was on it. A call already filed keeps what the team decided (shared
 * or hidden, a hand-picked stage, an edited summary); only what Fathom knows —
 * title, times, attendees, its summary once ready — is refreshed.
 */
export async function syncFathomMeetings(options: { createdAfter: string; projectIds?: string[] }): Promise<FathomSyncResult> {
  const projectDocs = options.projectIds
    ? await Promise.all(options.projectIds.map((id) => adminDb.collection(COLLECTIONS.PROJECTS).doc(id).get()))
    : (await adminDb.collection(COLLECTIONS.PROJECTS).get()).docs;

  const projects: { project: Project; domains: string[] }[] = [];
  for (const doc of projectDocs) {
    if (!doc.exists) continue;
    const project = { ...(doc.data() as Project), id: doc.id };
    const domains = meetingDomainsFor(project);
    if (domains.length) projects.push({ project, domains });
  }
  const result: FathomSyncResult = { seen: 0, filed: {}, added: 0 };
  if (projects.length === 0) return result;

  const meetings = await listFathomMeetings({
    createdAfter: options.createdAfter,
    // One project: ask Fathom for just its domains. Every project: ask for all
    // external calls and match here, rather than one request per project.
    domains: options.projectIds ? [...new Set(projects.flatMap((p) => p.domains))] : undefined,
  });
  result.seen = meetings.length;

  const timelines = new Map<string, ProjectTimeline | null>();
  const timelineFor = async (projectId: string) => {
    if (!timelines.has(projectId)) {
      const snap = await adminDb.collection(COLLECTIONS.PROJECT_TIMELINES).doc(projectId).get();
      timelines.set(projectId, snap.exists ? ({ ...(snap.data() as ProjectTimeline), id: projectId }) : null);
    }
    return timelines.get(projectId) ?? null;
  };

  const now = new Date().toISOString();
  for (const meeting of meetings) {
    if (!meeting.recording_id) continue;
    const external = new Set(
      (meeting.calendar_invitees ?? [])
        .filter((person) => person.is_external)
        .map(domainOf)
        .filter((d): d is string => !!d),
    );
    const startedAt = meeting.recording_start_time || meeting.scheduled_start_time || meeting.created_at;
    if (!startedAt) continue;

    for (const { project, domains } of projects) {
      if (!domains.some((domain) => external.has(domain))) continue;
      const ref = adminDb
        .collection(COLLECTIONS.PROJECTS)
        .doc(project.id)
        .collection(COLLECTIONS.PROJECT_MEETINGS)
        .doc(String(meeting.recording_id));
      const autoPhase = stageForDate(stagesOf(project, await timelineFor(project.id)), startedAt);

      const fromFathom: Partial<ProjectMeeting> = {
        id: String(meeting.recording_id),
        source: 'fathom',
        title: (meeting.meeting_title || meeting.title || 'Call').trim(),
        startedAt,
        attendees: toAttendees(meeting),
        actionItems: toActionItems(meeting),
        syncedAt: now,
      };
      if (meeting.recording_end_time) fromFathom.endedAt = meeting.recording_end_time;
      if (meeting.url) fromFathom.fathomUrl = meeting.url;
      if (meeting.share_url) fromFathom.shareUrl = meeting.share_url;
      const summary = meeting.default_summary?.markdown_formatted?.trim();
      if (summary) fromFathom.summary = summary;

      const added = await adminDb.runTransaction(async (transaction) => {
        const snap = await transaction.get(ref);
        if (!snap.exists) {
          transaction.set(ref, {
            ...fromFathom,
            status: 'pending',
            ...(autoPhase ? { phaseId: autoPhase, phaseSetBy: 'auto' } : {}),
          });
          return true;
        }
        const existing = snap.data() as ProjectMeeting;
        // The stage follows the timeline until a person picks one.
        const phase = existing.phaseSetBy === 'team' || !autoPhase ? {} : { phaseId: autoPhase, phaseSetBy: 'auto' };
        transaction.set(ref, { ...fromFathom, ...phase }, { merge: true });
        return false;
      });
      if (added) result.added += 1;
      result.filed[project.name] = (result.filed[project.name] ?? 0) + 1;
    }
  }
  return result;
}
