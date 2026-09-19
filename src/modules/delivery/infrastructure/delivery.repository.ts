'use client';

import {
  collection,
  deleteDoc,
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
import { fetchAuthed } from '@/lib/api-client';
import { COLLECTIONS } from '@/lib/constants';
import { DatabaseError, logError } from '@/lib/errors';
import { checklistService } from '@/services/ChecklistService';
import type { ChecklistItemStatus, ProjectChecklist, ProjectLink, SOPTemplate } from '@/types';
import type { MissingBasic } from '../domain/delivery.basics';
import type { Improvement } from '../domain/delivery.feedback';
import type {
  CheckStatus,
  CreateProjectPageInput,
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
    docsLink: data.docsLink ?? undefined,
    reviewComment: data.reviewComment ?? undefined,
    sourceLinkId: data.sourceLinkId ?? undefined,
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
  const parsed = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new DatabaseError(parsed?.error || `${fallback} (${res.status})`);
  return parsed;
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
      const existing = await getDocs(pagesRef(projectId));
      const known = new Set(existing.docs.map((d) => normalizePagePath(String(d.data().path ?? ''))));

      const candidates: { path: string; link: ProjectLink }[] = [];
      const seen = new Set<string>();
      for (const link of links) {
        if (!link.url) continue;
        const path = normalizePagePath(link.url);
        if (known.has(path) || seen.has(path)) continue;
        seen.add(path);
        candidates.push({ path, link });
      }

      if (candidates.length === 0) return { added: 0, skipped: links.length };

      const created = nowIso();
      let order = existing.size;
      // Firestore caps a batch at 500 writes; sites this size are realistic.
      const chunks: (typeof candidates)[] = [];
      for (let i = 0; i < candidates.length; i += 400) chunks.push(candidates.slice(i, i + 400));

      for (const chunk of chunks) {
        const batch = writeBatch(db);
        for (const { path, link } of chunk) {
          batch.set(
            doc(pagesRef(projectId)),
            stripUndefined({
              path,
              title: link.title?.trim() || titleFromPath(path),
              order: order++,
              work: {},
              sourceLinkId: link.id,
              createdAt: created,
              updatedAt: created,
            } as Record<string, unknown>),
          );
        }
        await batch.commit();
      }

      return { added: candidates.length, skipped: links.length - candidates.length };
    } catch (error) {
      logError(error, 'importFromLinks');
      throw new DatabaseError('Failed to import pages');
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
  ): Promise<void> {
    try {
      await updateDoc(pageRef(projectId, pageId), {
        [`work.${disciplineId}`]: status,
        updatedAt: nowIso(),
      });
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

  // --- The client's tracker sheet ------------------------------------------
  // Everything here goes through /api/delivery/[projectId]/sheet: the Google
  // credentials are the server's service account and must never reach a
  // browser. The app owns the page data; the sheet is a view of it.

  async syncSheet(projectId: string): Promise<{
    spreadsheetUrl: string;
    rows: number;
    created: boolean;
    syncedAt: string;
  }> {
    return sheetAction(projectId, { action: 'sync' }, 'Failed to update the tracker sheet');
  },

  async shareSheet(projectId: string, email: string): Promise<void> {
    await sheetAction(projectId, { action: 'share', email }, 'Failed to share the tracker sheet');
  },

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
    } catch (error) {
      logError(error, 'movePage');
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to move the page');
    }
  },
};
