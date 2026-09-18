import 'server-only';
import * as admin from 'firebase-admin';
import { db, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import {
  GoogleApiError,
  createSpreadsheet,
  listTabs,
  readGrid,
  shareSpreadsheet,
  writeGrid,
} from '@/lib/google-api';
import { getStack } from '@/modules/delivery/domain/stacks';
import {
  TRACKER_TAB_TITLE,
  buildTrackerRows,
  parseTrackerRows,
  type ImportedPageRow,
} from '@/modules/delivery/domain/delivery.sheet';
import type { ProjectPage, StackId } from '@/modules/delivery/domain/delivery.types';

/**
 * Keeps the client's tracker sheet in step with the pages in the app.
 *
 * The app owns the data and the sheet is a view of it, which is the only
 * arrangement that works when the page list is discovered automatically: a
 * hand-maintained list drifts from the site within a sprint. Nobody edits the
 * generated sheet; the importer exists only to seed a project that started life
 * in a spreadsheet.
 */

interface ProjectRecord {
  name?: string;
  client?: string;
  delivery?: {
    stackId?: StackId;
    trackerSheetId?: string;
    trackerSheetUrl?: string;
  };
}

function projectRef(projectId: string) {
  return db.collection(COLLECTIONS.PROJECTS).doc(projectId);
}

async function loadProject(projectId: string): Promise<ProjectRecord> {
  const snap = await projectRef(projectId).get();
  if (!snap.exists) throw new GoogleApiError(404, 'Project not found');
  return (snap.data() ?? {}) as ProjectRecord;
}

async function loadPages(projectId: string): Promise<ProjectPage[]> {
  const snap = await projectRef(projectId).collection(COLLECTIONS.PROJECT_PAGES).orderBy('order', 'asc').get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProjectPage, 'id'>) }));
}

export interface SheetSyncResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  rows: number;
  syncedAt: string;
  created: boolean;
}

/**
 * Writes the current page list to the project's sheet, creating it on first
 * use. Safe to call repeatedly; the tab is replaced wholesale so a page removed
 * in the app disappears from the client's view rather than lingering.
 */
export async function syncTrackerSheet(projectId: string): Promise<SheetSyncResult> {
  if (!hasFirebaseAdminCredentials) {
    throw new GoogleApiError(503, 'Server is not configured', true);
  }

  const project = await loadProject(projectId);
  const stack = getStack(project.delivery?.stackId);
  const pages = await loadPages(projectId);
  const rows = buildTrackerRows(stack, pages);
  const grid = { title: TRACKER_TAB_TITLE, rows, frozenRows: 1 };

  let spreadsheetId = project.delivery?.trackerSheetId;
  let spreadsheetUrl = project.delivery?.trackerSheetUrl;
  let created = false;

  if (!spreadsheetId) {
    const label = [project.client?.trim(), project.name?.trim()].filter(Boolean).join(' – ') || 'Website';
    const sheet = await createSpreadsheet(`${label} · Website Project Tracker`, grid);
    spreadsheetId = sheet.spreadsheetId;
    spreadsheetUrl = sheet.spreadsheetUrl;
    created = true;
  } else {
    // The tab can go missing if someone renamed or deleted it in the sheet.
    // Recreating the whole document would orphan the link the client holds, so
    // fail loudly and let a person decide.
    const tabs = await listTabs(spreadsheetId);
    if (!tabs.includes(TRACKER_TAB_TITLE)) {
      throw new GoogleApiError(
        409,
        `The sheet no longer has a "${TRACKER_TAB_TITLE}" tab. Rename it back, or disconnect the sheet to generate a fresh one.`,
      );
    }
    await writeGrid(spreadsheetId, grid);
  }

  const syncedAt = new Date().toISOString();
  await projectRef(projectId).set(
    {
      delivery: { trackerSheetId: spreadsheetId, trackerSheetUrl: spreadsheetUrl, trackerSyncedAt: syncedAt },
      updatedAt: admin.firestore.Timestamp.now(),
    },
    { merge: true },
  );

  return { spreadsheetId: spreadsheetId!, spreadsheetUrl: spreadsheetUrl!, rows: rows.length - 1, syncedAt, created };
}

/** Gives someone read access to the generated sheet. */
export async function shareTrackerSheet(projectId: string, email: string): Promise<void> {
  const project = await loadProject(projectId);
  const spreadsheetId = project.delivery?.trackerSheetId;
  if (!spreadsheetId) throw new GoogleApiError(400, 'This project has no tracker sheet yet');
  await shareSpreadsheet(spreadsheetId, email, 'reader');
}

export interface ImportPreview {
  rows: ImportedPageRow[];
  /** Rows whose page is already on the tracker, matched by title. */
  duplicates: number;
}

/** Reads an existing tracker sheet without writing anything, so it can be reviewed first. */
export async function previewSheetImport(
  projectId: string,
  spreadsheetId: string,
  tabTitle?: string,
): Promise<ImportPreview> {
  const project = await loadProject(projectId);
  const stack = getStack(project.delivery?.stackId);

  const tabs = await listTabs(spreadsheetId);
  // Prefer a tab that looks like a tracker; otherwise take the first.
  const chosen =
    tabTitle ??
    tabs.find((t) => /tracker|pages|project/i.test(t)) ??
    tabs[0];

  const grid = await readGrid(spreadsheetId, chosen);
  const rows = parseTrackerRows(stack, grid);

  const existing = await loadPages(projectId);
  const known = new Set(existing.map((p) => p.title.trim().toLowerCase()));
  const duplicates = rows.filter((r) => known.has(r.title.trim().toLowerCase())).length;

  return { rows, duplicates };
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
}

/**
 * Applies an import.
 *
 * Existing pages are matched by title and have their statuses filled in rather
 * than replaced wholesale — a project mid-migration has real work recorded in
 * the app already, and a spreadsheet should not silently overwrite it. Only
 * fields the sheet actually carries a value for are written.
 */
export async function applySheetImport(
  projectId: string,
  rows: ImportedPageRow[],
): Promise<ImportResult> {
  const existing = await loadPages(projectId);
  const byTitle = new Map(existing.map((p) => [p.title.trim().toLowerCase(), p]));

  const result: ImportResult = { added: 0, updated: 0, skipped: 0 };
  const now = new Date().toISOString();
  let order = existing.length;

  const pagesCol = projectRef(projectId).collection(COLLECTIONS.PROJECT_PAGES);
  let batch = db.batch();
  let pending = 0;

  const commit = async () => {
    if (pending === 0) return;
    await batch.commit();
    batch = db.batch();
    pending = 0;
  };

  for (const row of rows) {
    const title = row.title.trim();
    if (!title) {
      result.skipped += 1;
      continue;
    }

    const match = byTitle.get(title.toLowerCase());
    if (match) {
      const patch: admin.firestore.UpdateData<admin.firestore.DocumentData> = { updatedAt: now };
      for (const [disciplineId, status] of Object.entries(row.work)) {
        patch[`work.${disciplineId}`] = status;
      }
      if (row.assignee && !match.assignee) patch.assignee = row.assignee;
      if (row.expectedDate && !match.expectedDate) patch.expectedDate = row.expectedDate;
      if (row.stagingLink && !match.stagingLink) patch.stagingLink = row.stagingLink;
      if (row.docsLink && !match.docsLink) patch.docsLink = row.docsLink;
      if (row.reviewComment && !match.reviewComment) patch.reviewComment = row.reviewComment;
      if (row.group && !match.group) patch.group = row.group;

      // Only `updatedAt` means the sheet told us nothing new.
      if (Object.keys(patch).length === 1) {
        result.skipped += 1;
        continue;
      }
      batch.update(pagesCol.doc(match.id), patch);
      result.updated += 1;
    } else {
      const doc: Record<string, unknown> = {
        path: row.path ?? `/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
        title,
        order: order++,
        work: row.work,
        createdAt: now,
        updatedAt: now,
      };
      if (row.group) doc.group = row.group;
      if (row.assignee) doc.assignee = row.assignee;
      if (row.expectedDate) doc.expectedDate = row.expectedDate;
      if (row.stagingLink) doc.stagingLink = row.stagingLink;
      if (row.docsLink) doc.docsLink = row.docsLink;
      if (row.reviewComment) doc.reviewComment = row.reviewComment;
      batch.set(pagesCol.doc(), doc);
      result.added += 1;
    }

    pending += 1;
    if (pending >= 400) await commit();
  }

  await commit();
  return result;
}
