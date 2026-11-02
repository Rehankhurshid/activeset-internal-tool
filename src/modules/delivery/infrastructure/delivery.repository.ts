'use client';

import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
  type UpdateData,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { requestProjectSheetWrite } from '@/lib/project-sheet-trigger';
import { logDeliveryUpdate } from '@/lib/delivery-update-log';
import { fetchAuthed } from '@/lib/api-client';
import { COLLECTIONS } from '@/lib/constants';
import { DatabaseError, logError } from '@/lib/errors';
import { checklistService } from '@/services/ChecklistService';
import type { ChecklistItemStatus, DeliveryLaunchRecord, DeliverySitemapGap, ProjectChecklist, ProjectLink, SOPTemplate,
  DeliverableOwner,
  DeliverablePriority,
} from '@/types';
import type { MissingBasic } from '../domain/delivery.basics';
import type { PageRecording, RecordingSource } from '../domain/delivery.recording';
import type { Improvement } from '../domain/delivery.feedback';
import type { LaunchPlan } from '../domain/delivery.launch';
import type {
  CheckStatus,
  CreateProjectPageInput,
  PageWorkOwner,
  PageWorkStatus,
  ProjectDeliveryState,
  ProjectPage,
  StackId,
} from '../domain/delivery.types';

/**
 * Storage for the page tracker.
 *
 * Pages live at `projects/{projectId}/pages/{pageId}` rather than in an array on
 * the project document. A large site is hundreds of rows, each with its own
 * statuses and QC answers, and rewriting one array to tick one checkbox is both
 * a lost-update hazard and a route to the 1MB document ceiling.
 */

const PROJECTS = COLLECTIONS.PROJECTS;
const PAGES = COLLECTIONS.PROJECT_PAGES;

function pagesRef(projectId: string) {
  return collection(db, PROJECTS, projectId, PAGES);
}

function pageRef(projectId: string, pageId: string) {
  return doc(db, PROJECTS, projectId, PAGES, pageId);
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Site-relative, no trailing slash, always leading slash. The identity of a page. */
export function normalizePagePath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '/';
  let path = trimmed;
  try {
    if (/^https?:\/\//i.test(path)) path = new URL(path).pathname;
  } catch {
    // Not a URL after all; treat it as a path.
  }
  path = path.split('?')[0].split('#')[0];
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path || '/';
}

/** "/case-studies/acme-launch" → "Acme Launch". Beats showing a raw slug. */
export function titleFromPath(path: string): string {
  const last = normalizePagePath(path).split('/').filter(Boolean).pop();
  if (!last) return 'Homepage';
  return last
    .replace(/[-_]+/g, ' ')
    .replace(/\.[a-z]+$/i, '')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fromDoc(id: string, data: DocumentData): ProjectPage {
  return {
    id,
    path: String(data.path ?? '/'),
    title: String(data.title ?? ''),
    group: data.group ?? undefined,
    order: typeof data.order === 'number' ? data.order : 0,
    work: (data.work ?? {}) as Record<string, PageWorkStatus>,
    qc: (data.qc ?? undefined) as Record<string, CheckStatus> | undefined,
    assignee: data.assignee ?? undefined,
    expectedDate: data.expectedDate ?? undefined,
    designLink: data.designLink ?? undefined,
    stagingLink: data.stagingLink ?? undefined,
    prelaunchLink: data.prelaunchLink ?? undefined,
    docsLink: data.docsLink ?? undefined,
    reviewComment: data.reviewComment ?? undefined,
    sourceLinkId: data.sourceLinkId ?? undefined,
    recording: (data.recording ?? undefined) as PageRecording | undefined,
    createdAt: String(data.createdAt ?? nowIso()),
    updatedAt: String(data.updatedAt ?? nowIso()),
  };
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) delete value[key];
  }
  return value;
}

/**
 * Calls the sheet route and turns its failures into something a person can act
 * on. A `configuration` error means the fix is in the Google Cloud console, not
 * in this app, so it is surfaced verbatim rather than flattened to "failed".
 */
/**
 * A tracker sheet failure the card can act on: `needs_sheet` (no sheet to
 * write into yet), `read_only` / `no_access` (share it with the app as an
 * Editor), with the address to share it with.
 */
export class TrackerSheetError extends DatabaseError {
  constructor(
    message: string,
    public code?: string,
    public serviceAccountEmail?: string,
  ) {
    super(message);
  }
}

async function sheetAction<T>(
  projectId: string,
  body: Record<string, unknown>,
  fallback: string,
): Promise<T> {
  const res = await fetchAuthed(`/api/delivery/${encodeURIComponent(projectId)}/sheet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string; serviceAccountEmail?: string };
  if (!res.ok) {
    throw new TrackerSheetError(parsed?.error || `${fallback} (${res.status})`, parsed?.code, parsed?.serviceAccountEmail ?? undefined);
  }
  return parsed;
}

/**
 * Adds the rows whose path is not on the tracker yet, in the order given, after
 * the pages already there. Shared by the sitemap import and the live-sitemap
 * check so both skip duplicates the same way.
 */
async function addNewPages(
  projectId: string,
  rows: { path: string; title: string; stagingLink?: string; sourceLinkId?: string }[],
): Promise<{ added: number }> {
  const existing = await getDocs(pagesRef(projectId));
  const known = new Set(existing.docs.map((d) => normalizePagePath(String(d.data().path ?? ''))));

  const candidates: (typeof rows)[number][] = [];
  for (const row of rows) {
    const path = normalizePagePath(row.path);
    if (known.has(path)) continue;
    known.add(path);
    candidates.push({ ...row, path });
  }
  if (candidates.length === 0) return { added: 0 };

  const created = nowIso();
  let order = existing.size;
  // Firestore caps a batch at 500 writes; sites this size are realistic.
  for (let i = 0; i < candidates.length; i += 400) {
    const batch = writeBatch(db);
    for (const row of candidates.slice(i, i + 400)) {
      batch.set(
        doc(pagesRef(projectId)),
        stripUndefined({
          path: row.path,
          title: row.title.trim() || titleFromPath(row.path),
          order: order++,
          work: {},
          stagingLink: row.stagingLink,
          sourceLinkId: row.sourceLinkId,
          createdAt: created,
          updatedAt: created,
        } as Record<string, unknown>),
      );
    }
    await batch.commit();
  }

  requestProjectSheetWrite(projectId);
  return { added: candidates.length };
}

export const deliveryRepository = {
  subscribeToPages(projectId: string, callback: (pages: ProjectPage[]) => void): () => void {
    const q = query(pagesRef(projectId), orderBy('order', 'asc'));
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => fromDoc(d.id, d.data()))),
      (error) => {
        console.error('subscribeToPages failed', error);
        callback([]);
      },
    );
  },

  async listPages(projectId: string): Promise<ProjectPage[]> {
    const snap = await getDocs(query(pagesRef(projectId), orderBy('order', 'asc')));
    return snap.docs.map((d) => fromDoc(d.id, d.data()));
  },

  async addPage(projectId: string, input: CreateProjectPageInput): Promise<string> {
    try {
      const path = normalizePagePath(input.path);
      const existing = await getDocs(pagesRef(projectId));
      if (existing.docs.some((d) => normalizePagePath(String(d.data().path ?? '')) === path)) {
        throw new DatabaseError(`${path} is already on the tracker`);
      }
      const order = input.order ?? existing.size;
      const ref = doc(pagesRef(projectId));
      const created = nowIso();
      await setDoc(
        ref,
        stripUndefined({
          ...input,
          path,
          title: input.title.trim() || titleFromPath(path),
          order,
          work: input.work ?? {},
          createdAt: created,
          updatedAt: created,
        } as Record<string, unknown>),
      );
      requestProjectSheetWrite(projectId);
      return ref.id;
    } catch (error) {
      logError(error, 'addPage');
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to add the page');
    }
  },

  /**
   * Adds the discovered pages that are not on the tracker yet, and reports what
   * it skipped. The app already knows the site's URLs from the sitemap scan and
   * the Webflow sync; this is what stops the team retyping them into a sheet.
   */
  async importFromLinks(
    projectId: string,
    links: ProjectLink[],
  ): Promise<{ added: number; skipped: number }> {
    try {
      const rows = links
        .filter((link) => link.url)
        .map((link) => ({ path: link.url, title: link.title?.trim() || '', sourceLinkId: link.id }));
      const { added } = await addNewPages(projectId, rows);
      return { added, skipped: links.length - added };
    } catch (error) {
      logError(error, 'importFromLinks');
      throw new DatabaseError('Failed to import pages');
    }
  },

  /**
   * Adds pages the live sitemap lists and the tracker does not. Once the site
   * is launched each gets its live address as its link, the same as the pages
   * "Mark launched" moved.
   */
  async addPagesFromSitemap(
    projectId: string,
    entries: { path: string; url: string; title: string }[],
    withLink: boolean,
  ): Promise<{ added: number; skipped: number }> {
    try {
      const rows = entries.map((entry) => ({
        path: entry.path,
        title: entry.title,
        ...(withLink && /^https?:\/\//i.test(entry.url) ? { stagingLink: entry.url } : {}),
      }));
      const { added } = await addNewPages(projectId, rows);
      return { added, skipped: entries.length - added };
    } catch (error) {
      logError(error, 'addPagesFromSitemap');
      throw new DatabaseError('Failed to add the pages');
    }
  },

  /** Asks the server to read the live sitemap and compare it with the tracker; saves and returns the result. */
  async checkSitemapGap(projectId: string, origin?: string): Promise<DeliverySitemapGap> {
    const res = await fetchAuthed(`/api/delivery/${encodeURIComponent(projectId)}/sitemap-gap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(origin ? { origin } : {}),
    });
    const parsed = (await res.json().catch(() => ({}))) as { gap?: DeliverySitemapGap; error?: string };
    if (!res.ok || !parsed.gap) throw new DatabaseError(parsed.error || `The sitemap could not be checked (${res.status})`);
    return parsed.gap;
  },

  /** Paths, or `/folder/*`, that do not belong on the tracker; the sitemap check stops listing them. */
  async setSitemapIgnored(projectId: string, patterns: string[], ignored: boolean): Promise<void> {
    if (patterns.length === 0) return;
    try {
      await updateDoc(doc(db, PROJECTS, projectId), {
        'delivery.sitemapIgnore': ignored ? arrayUnion(...patterns) : arrayRemove(...patterns),
      });
    } catch (error) {
      logError(error, 'setSitemapIgnored');
      throw new DatabaseError('Could not save that');
    }
  },

  /**
   * Marks the site launched: every page link the plan names moves to the live
   * domain, and the launch is recorded on the project, in one transaction. The
   * transaction reads the project first and refuses when a launch is already
   * recorded, unless `again` (the team typed a different domain on purpose),
   * so two people pressing it, or one pressing it twice, change nothing more.
   *
   * The link a page had before is kept as `prelaunchLink` (only the first
   * time), so staging can still be recorded or restored by hand.
   */
  async markLaunched(input: {
    projectId: string;
    plan: LaunchPlan;
    includeUnlinked: boolean;
    /** Pages that already keep a pre-launch link, which a second launch must not overwrite. */
    keepPrelaunch: ReadonlySet<string>;
    by?: string;
    again?: boolean;
  }): Promise<DeliveryLaunchRecord> {
    const { projectId, plan, includeUnlinked, keepPrelaunch, by, again } = input;
    const unlinked = includeUnlinked ? plan.unlinked : [];
    // One transaction is at most 500 writes: the project plus the pages.
    if (plan.rewrites.length + unlinked.length > 450) {
      throw new DatabaseError('Too many pages to move in one go (more than 450)');
    }
    const record: DeliveryLaunchRecord = stripUndefined({
      launchedAt: nowIso(),
      launchedBy: by?.toLowerCase().trim() || undefined,
      liveOrigin: plan.liveOrigin,
      fromHosts: plan.fromHosts,
      rewritten: plan.rewrites.length,
      linked: unlinked.length,
    });
    try {
      await runTransaction(db, async (tx) => {
        const project = await tx.get(doc(db, PROJECTS, projectId));
        const existing = project.data()?.delivery?.launch as DeliveryLaunchRecord | undefined;
        if (existing?.launchedAt && !again) {
          throw new DatabaseError(
            `Already marked launched on ${existing.launchedAt.slice(0, 10)}${existing.launchedBy ? ` by ${existing.launchedBy}` : ''}`,
          );
        }
        const updatedAt = record.launchedAt;
        for (const change of plan.rewrites) {
          tx.update(pageRef(projectId, change.pageId), {
            stagingLink: change.to,
            ...(change.from && !keepPrelaunch.has(change.pageId) ? { prelaunchLink: change.from } : {}),
            updatedAt,
          });
        }
        for (const change of unlinked) {
          tx.update(pageRef(projectId, change.pageId), { stagingLink: change.to, updatedAt });
        }
        tx.update(doc(db, PROJECTS, projectId), { 'delivery.launch': record, updatedAt: Timestamp.now() });
      });
    } catch (error) {
      logError(error, 'markLaunched');
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Could not mark the site launched');
    }
    requestProjectSheetWrite(projectId);
    if (record.launchedBy) {
      const host = new URL(plan.liveOrigin).host;
      logDeliveryUpdate(projectId, {
        by: record.launchedBy,
        summary: `Marked launched on ${host}: ${record.rewritten + record.linked} page links now open the live site`,
        kind: 'page',
      }).catch(() => {});
    }
    return record;
  },

  /**
   * Ask the worker for a scroll-through video of one page.
   *
   * The job and the page's `recording: queued` go in one batch, so the table
   * never shows a recording that was not queued, or a job it cannot see. Not a
   * page edit: no `updatedAt`, no sheet rewrite.
   */
  async requestRecording(input: {
    projectId: string;
    projectName?: string;
    page: Pick<ProjectPage, 'id' | 'title' | 'path'>;
    source: RecordingSource;
    url: string;
    requestedBy?: string;
  }): Promise<string> {
    try {
      const batch = writeBatch(db);
      const job = doc(collection(db, 'worker_jobs'));
      const requestedAt = nowIso();
      batch.set(job, {
        kind: 'page_recording',
        projectId: input.projectId,
        ...(input.projectName ? { projectName: input.projectName } : {}),
        payload: {
          pageId: input.page.id,
          source: input.source,
          url: input.url,
          pageTitle: input.page.title || input.page.path,
        },
        status: 'queued',
        createdAt: requestedAt,
        attempts: 0,
        ...(input.requestedBy ? { requestedBy: input.requestedBy } : {}),
      });
      const recording: PageRecording = stripUndefined({
        status: 'queued' as const,
        source: input.source,
        sourceUrl: input.url,
        jobId: job.id,
        requestedBy: input.requestedBy,
        requestedAt,
      });
      // Only the request fields: the previous video's paths stay until the
      // worker has a new one, so a failed re-record still plays the old video.
      batch.update(pageRef(input.projectId, input.page.id), {
        'recording.status': recording.status,
        'recording.source': recording.source,
        'recording.sourceUrl': recording.sourceUrl,
        'recording.jobId': recording.jobId,
        'recording.requestedAt': recording.requestedAt,
        'recording.requestedBy': recording.requestedBy ?? deleteField(),
        'recording.progress': deleteField(),
        'recording.error': deleteField(),
      });
      await batch.commit();
      return job.id;
    } catch (error) {
      logError(error, 'requestRecording');
      throw new DatabaseError('Could not queue the recording');
    }
  },

  async updatePage(
    projectId: string,
    pageId: string,
    patch: Partial<Omit<ProjectPage, 'id' | 'createdAt'>>,
  ): Promise<void> {
    try {
      const update: UpdateData<DocumentData> = { ...patch, updatedAt: nowIso() };
      if (patch.path !== undefined) update.path = normalizePagePath(patch.path);
      await updateDoc(pageRef(projectId, pageId), update);
      requestProjectSheetWrite(projectId);
    } catch (error) {
      logError(error, 'updatePage');
      throw new DatabaseError('Failed to update the page');
    }
  },

  /**
   * Sets one discipline's status on one page.
   *
   * A dotted path so two people moving different columns on the same row cannot
   * overwrite each other — the whole point of the grid is several people working
   * it at once.
   */
  async setPageWork(
    projectId: string,
    pageId: string,
    disciplineId: string,
    status: PageWorkStatus,
    userEmail?: string,
    pageLabel?: string,
  ): Promise<void> {
    try {
      await updateDoc(pageRef(projectId, pageId), {
        [`work.${disciplineId}`]: status,
        updatedAt: nowIso(),
      });
      requestProjectSheetWrite(projectId);
      if (userEmail) {
        const summary = pageLabel ?? `${disciplineId} → ${status}`;
        logDeliveryUpdate(projectId, { by: userEmail, summary, kind: 'page' }).catch(() => {});
      }
    } catch (error) {
      logError(error, 'setPageWork');
      throw new DatabaseError('Failed to update the status');
    }
  },

  async setPageCheck(
    projectId: string,
    pageId: string,
    checkId: string,
    status: CheckStatus,
  ): Promise<void> {
    try {
      await updateDoc(pageRef(projectId, pageId), {
        [`qc.${checkId}`]: status,
        updatedAt: nowIso(),
      });
    } catch (error) {
      logError(error, 'setPageCheck');
      throw new DatabaseError('Failed to update the check');
    }
  },

  async deletePage(projectId: string, pageId: string): Promise<void> {
    try {
      await deleteDoc(pageRef(projectId, pageId));
      requestProjectSheetWrite(projectId);
    } catch (error) {
      logError(error, 'deletePage');
      throw new DatabaseError('Failed to remove the page');
    }
  },

  /** Persists a reordered grid in one commit so it cannot end up half-applied. */
  async reorderPages(projectId: string, orderedIds: string[]): Promise<void> {
    try {
      const batch = writeBatch(db);
      const updatedAt = nowIso();
      orderedIds.forEach((id, order) => batch.update(pageRef(projectId, id), { order, updatedAt }));
      await batch.commit();
      requestProjectSheetWrite(projectId);
    } catch (error) {
      logError(error, 'reorderPages');
      throw new DatabaseError('Failed to reorder the pages');
    }
  },

  // --- Project-level delivery state (stack, site checks, kickoff) -----------

  async setStack(projectId: string, stackId: StackId): Promise<void> {
    try {
      await updateDoc(doc(db, PROJECTS, projectId), {
        'delivery.stackId': stackId,
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      logError(error, 'setStack');
      throw new DatabaseError('Failed to set the stack');
    }
  },




  // --- The project's own checklist ------------------------------------------
  // Kickoff and the site-wide launch list are sections of it, tagged with a
  // stage. Delivery renders them; the Checklist tab renders all of them; both
  // tick the same item.

  subscribeToChecklists(projectId: string, cb: (checklists: ProjectChecklist[]) => void): () => void {
    return checklistService.subscribeToProjectChecklists(projectId, cb);
  },

  setChecklistItemStatus(
    checklistId: string,
    sectionId: string,
    itemId: string,
    status: ChecklistItemStatus,
    userEmail?: string,
  ): Promise<void> {
    return checklistService.updateItemStatus(checklistId, sectionId, itemId, status, userEmail);
  },

  /**
   * What a step recorded — the date of the call, the link to the recording, the
   * emails that went into the channel — keyed by field id.
   *
   * A patch, not the whole map: the caller sends the one field that was just
   * edited, so two people filling in two fields of the same step do not undo
   * each other.
   */
  /** Owner, priority or week of a deliverable; `null` clears one. */
  setChecklistItemPlan(
    checklistId: string,
    sectionId: string,
    itemId: string,
    patch: { owner?: DeliverableOwner | null; priority?: DeliverablePriority | null; week?: string | null },
  ): Promise<void> {
    return checklistService.updateItemPlan(checklistId, sectionId, itemId, patch);
  },

  setChecklistItemValues(
    checklistId: string,
    sectionId: string,
    itemId: string,
    values: Record<string, string>,
  ): Promise<void> {
    return checklistService.updateChecklistItemValues(checklistId, sectionId, itemId, values);
  },

  /**
   * The SOP a checklist was copied from, or null when it is gone — a template
   * can be deleted while the projects made from it are still running.
   */
  getSOPTemplate(templateId: string): Promise<SOPTemplate | null> {
    return checklistService.getSOPTemplate(templateId);
  },

  /**
   * The one write that travels from a project back towards the process.
   *
   * Passed through untouched, errors included: the one raised for a built-in
   * template says what to do instead, and wrapping it would lose that.
   */
  saveTemplateImprovements(templateId: string, improvements: Improvement[]): Promise<void> {
    return checklistService.saveTemplateImprovements(templateId, improvements);
  },

  /**
   * Puts the agency's own routine onto a checklist that was copied before it
   * existed.
   *
   * One checklist per call, because each is its own document and its own deep
   * copy — a project with several has several gaps, and the caller saves them one
   * at a time so it can say honestly how far it got.
   */
  addAgencyBasics(checklistId: string, chosen: MissingBasic[]): Promise<void> {
    return checklistService.addAgencyBasics(checklistId, chosen);
  },

  /**
   * The same gap, with each resemblance judged rather than guessed at by
   * counting shared words.
   *
   * Goes through a route because the judgment needs a server-only API key.
   * Returns `judged: false` when no key is configured or the judgment failed,
   * and the caller keeps the answer it already has rather than being told this
   * one was judged when it was not.
   */
  async judgeBasicsGap(
    checklistId: string,
  ): Promise<{ judged: boolean; missing: MissingBasic[] } | null> {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return null;

    const res = await fetch('/api/delivery/basics-gap', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ checklistId }),
    });
    if (!res.ok) return null;

    const body = (await res.json()) as { gap?: { missing?: MissingBasic[] }; judged?: boolean };
    return { judged: Boolean(body.judged), missing: body.gap?.missing ?? [] };
  },

  /** This project's per-page QC questions, replacing whatever was there. */
  async setPageChecks(
    projectId: string,
    checks: NonNullable<ProjectDeliveryState['pageChecks']>,
  ): Promise<void> {
    try {
      await updateDoc(doc(db, PROJECTS, projectId), {
        'delivery.pageChecks': checks,
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      logError(error, 'setPageChecks');
      throw new DatabaseError('Failed to save the page checks');
    }
  },

  async updateDeliveryState(
    projectId: string,
    patch: Pick<ProjectDeliveryState, 'callCadence' | 'lastSyncCallAt'>,
  ): Promise<void> {
    try {
      const update: UpdateData<DocumentData> = { updatedAt: Timestamp.now() };
      if (patch.callCadence !== undefined) update['delivery.callCadence'] = patch.callCadence;
      if (patch.lastSyncCallAt !== undefined) update['delivery.lastSyncCallAt'] = patch.lastSyncCallAt;
      await updateDoc(doc(db, PROJECTS, projectId), update);
    } catch (error) {
      logError(error, 'updateDeliveryState');
      throw new DatabaseError('Failed to update the project');
    }
  },

  /**
   * Says who does a tracker column on this project. `null` goes back to what
   * the project's services say. The project sheet is rewritten, since its Pages
   * tab words the client's columns differently.
   */

  async setDevOwnerEmail(projectId: string, email: string): Promise<void> {
    try {
      await updateDoc(doc(db, PROJECTS, projectId), {
        'delivery.devOwnerEmail': email.toLowerCase().trim(),
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      logError(error, 'setDevOwnerEmail');
      throw new DatabaseError('Failed to save dev owner');
    }
  },

  async setDisciplineOwner(projectId: string, disciplineId: string, owner: PageWorkOwner | null): Promise<void> {
    try {
      await updateDoc(doc(db, PROJECTS, projectId), {
        [`delivery.disciplineOwners.${disciplineId}`]: owner ?? deleteField(),
        updatedAt: Timestamp.now(),
      });
      requestProjectSheetWrite(projectId);
    } catch (error) {
      logError(error, 'setDisciplineOwner');
      throw new DatabaseError('Failed to change who does that work');
    }
  },

  // --- The client's tracker sheet ------------------------------------------
  // Everything here goes through /api/delivery/[projectId]/sheet: the Google
  // credentials are the server's service account and must never reach a
  // browser. Writing the sheet is the project sheet's job now (client-portal);
  // what is left here is importing pages from a sheet the team already has.

  /** Reads a sheet and reports what would be imported, writing nothing. */
  async previewSheetImport(
    projectId: string,
    sheetUrl: string,
  ): Promise<{ rows: { title: string; group?: string }[]; duplicates: number }> {
    return sheetAction(projectId, { action: 'preview-import', sheetUrl }, 'Failed to read that sheet');
  },

  async importSheet(
    projectId: string,
    sheetUrl: string,
  ): Promise<{ added: number; updated: number; skipped: number }> {
    return sheetAction(projectId, { action: 'import', sheetUrl }, 'Failed to import that sheet');
  },

  /**
   * Moves a page to a new position, renumbering only what it passes. Kept in a
   * transaction so a drag during someone else's edit cannot duplicate an order.
   */
  async movePage(projectId: string, pageId: string, toIndex: number): Promise<void> {
    try {
      await runTransaction(db, async (tx) => {
        const snap = await getDocs(query(pagesRef(projectId), orderBy('order', 'asc')));
        const ids = snap.docs.map((d) => d.id);
        const from = ids.indexOf(pageId);
        if (from < 0) throw new DatabaseError('Page not found');
        ids.splice(toIndex, 0, ...ids.splice(from, 1));
        const updatedAt = nowIso();
        ids.forEach((id, order) => tx.update(pageRef(projectId, id), { order, updatedAt }));
      });
      requestProjectSheetWrite(projectId);
    } catch (error) {
      logError(error, 'movePage');
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to move the page');
    }
  },
};
