import 'server-only';
import { createHash } from 'node:crypto';
import { FieldPath, FieldValue, type DocumentData, type UpdateData } from 'firebase-admin/firestore';
import { db, getServiceAccountCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { GoogleApiError, getSpreadsheetMeta, parseSpreadsheetId, readTabsWithLinks, type SpreadsheetTab } from '@/lib/google-api';
import { planTabs } from '@/modules/client-portal/domain/project-sheet.contract';
import { readProjectSheet } from '@/modules/client-portal/domain/project-sheet.read';
import type {
  ProjectSheetRecord,
  ProjectSheetSnapshot,
  SheetReport,
  SheetStagesFrom,
  SheetTabRole,
} from '@/modules/client-portal/domain/project-sheet.types';

/**
 * The project sheet, server side: bind a project to its Google Sheet, read the
 * sheet into a snapshot, and keep that snapshot fresh. The team writes the
 * sheet and the app only ever reads it (Rehan, 2026-10-01).
 *
 * Everything lives in `project_sheets/{projectId}`, which firestore.rules does
 * not mention, so browsers are denied. The portal renders from the snapshot and
 * never calls Google while a client waits.
 */

const ROLES: SheetTabRole[] = ['overview', 'timeline', 'tracker', 'inputs', 'changes', 'launch', 'seo', 'redirects', 'fill', 'ignored'];

/** Firestore's document limit is 1 MiB, in bytes. The reader's caps keep real sheets far below this. */
const MAX_SNAPSHOT_BYTES = 800_000;

export class ProjectSheetError extends Error {
  constructor(
    public status: number,
    message: string,
    public configuration = false,
  ) {
    super(message);
    this.name = 'ProjectSheetError';
  }
}

function doc(projectId: string) {
  return db.collection(COLLECTIONS.PROJECT_SHEETS).doc(projectId);
}

/** The address a sheet must be shared with for the app to read it. Not a secret. */
export function serviceAccountEmail(): string | null {
  return getServiceAccountCredentials()?.clientEmail ?? null;
}

export async function getProjectSheetRecord(projectId: string): Promise<ProjectSheetRecord | null> {
  const snap = await doc(projectId).get();
  return snap.exists ? (snap.data() as ProjectSheetRecord) : null;
}

/** What the portal projection gets: the data and the team's switches, nothing else. */
export function snapshotOf(record: ProjectSheetRecord | null | undefined): ProjectSheetSnapshot | null {
  if (!record?.data) return null;
  return {
    data: record.data,
    url: record.url,
    showSheetLink: record.showSheetLink === true,
    stagesFrom: record.stagesFrom,
    syncedAt: record.syncedAt,
    changedAt: record.changedAt,
  };
}

/** Google's errors, in the team's terms. A sheet the app cannot see is the common case. */
function explain(error: unknown): ProjectSheetError {
  if (error instanceof ProjectSheetError) return error;
  if (error instanceof GoogleApiError) {
    if (error.status === 403 || error.status === 404) {
      const email = serviceAccountEmail();
      return new ProjectSheetError(
        404,
        email
          ? `The app can't open this sheet. Share it with ${email} as a Viewer, then try again.`
          : "The app can't open this sheet. Share it with the app's service account as a Viewer, then try again.",
      );
    }
    return new ProjectSheetError(error.status >= 500 ? 502 : error.status, error.message, error.configuration);
  }
  return new ProjectSheetError(500, error instanceof Error ? error.message : 'Reading the sheet failed.');
}

/**
 * Points a project at a sheet and reads it. Binding the same sheet again only
 * refreshes the binding, so the client keeps the last read if this one fails;
 * a different sheet replaces everything, so nothing from the last sheet lingers.
 */
export async function bindProjectSheet(projectId: string, input: unknown, byEmail: string): Promise<ProjectSheetRecord> {
  const spreadsheetId = typeof input === 'string' ? parseSpreadsheetId(input) : null;
  if (!spreadsheetId) throw new ProjectSheetError(400, 'Paste the link to a Google Sheet.');

  let meta;
  try {
    meta = await getSpreadsheetMeta(spreadsheetId);
  } catch (error) {
    throw explain(error);
  }

  const existing = await getProjectSheetRecord(projectId);
  const binding = { url: meta.url, title: meta.title, boundAt: new Date().toISOString(), boundBy: byEmail };
  if (existing?.spreadsheetId === spreadsheetId) {
    await doc(projectId).update(binding);
  } else {
    const record: ProjectSheetRecord = { projectId, spreadsheetId, ...binding, overrides: {}, showSheetLink: false };
    await doc(projectId).set(record);
  }
  return syncProjectSheet(projectId);
}

/** What the record must still say for a read to be written: the same sheet, still bound. */
class StaleSync extends Error {}

/**
 * Writes the result of a read only if the project is still bound to the sheet
 * that was read. Without the check, an Unbind during a cron read recreated the
 * record, and a re-bind mid-read put the old sheet's data on the portal.
 */
async function writeIfStillBound(projectId: string, spreadsheetId: string, fields: UpdateData<DocumentData>): Promise<void> {
  const ref = doc(projectId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || (snap.data() as ProjectSheetRecord).spreadsheetId !== spreadsheetId) throw new StaleSync();
    tx.update(ref, fields);
  });
}

/** The tab list before anything is read, so the team can ignore tabs even when the first read fails. */
function planOnlyReport(tabs: SpreadsheetTab[], overrides: ProjectSheetRecord['overrides']): SheetReport {
  const plans = planTabs(
    tabs.filter((t) => t.type === 'GRID').map((t) => t.title),
    overrides,
  );
  return {
    tabs: tabs.map((tab) => {
      const plan = plans.find((p) => p.title === tab.title);
      return {
        title: tab.title,
        role: plan?.role ?? 'ignored',
        how: plan?.how ?? 'none',
        rows: 0,
        columns: [],
        warnings: plan ? ['Not read yet: the last read failed.'] : ['A chart sheet: nothing to read.'],
      };
    }),
    unknownStatuses: [],
  };
}

/**
 * Reads the sheet into a fresh snapshot. On failure the last good snapshot
 * stays, so the client's page keeps working, and the error is recorded for
 * the Client tab, with the tab list when there was none yet.
 */
export async function syncProjectSheet(projectId: string): Promise<ProjectSheetRecord> {
  const record = await getProjectSheetRecord(projectId);
  if (!record?.spreadsheetId) throw new ProjectSheetError(404, 'No sheet is bound to this project.');
  const { spreadsheetId } = record;
  const now = new Date();
  let tabs: SpreadsheetTab[] | null = null;

  try {
    const meta = await getSpreadsheetMeta(spreadsheetId);
    tabs = meta.tabs;
    // A chart sheet has no cells; asking for its A1 range fails the whole request.
    const gridTitles = meta.tabs.filter((t) => t.type === 'GRID').map((t) => t.title);
    const plans = planTabs(gridTitles, record.overrides);
    const toRead = plans.filter((p) => p.role !== 'ignored').map((p) => p.title);
    const grids = await readTabsWithLinks(spreadsheetId, toRead);
    const read = readProjectSheet(
      gridTitles.map((title) => ({ title, grid: grids.get(title) ?? [] })),
      { overrides: record.overrides, today: now, locale: meta.locale },
    );
    const { data } = read;
    const byTitle = new Map(read.report.tabs.map((t) => [t.title, t]));
    const report: SheetReport = {
      ...read.report,
      tabs: meta.tabs.map(
        (t) => byTitle.get(t.title) ?? { title: t.title, role: 'ignored', how: 'none', rows: 0, columns: [], warnings: ['A chart sheet: nothing to read.'] },
      ),
    };

    if (Buffer.byteLength(JSON.stringify({ data, report }), 'utf8') > MAX_SNAPSHOT_BYTES) {
      // Keep the report, so the list of tabs to ignore is there to act on.
      await writeIfStillBound(projectId, spreadsheetId, { report });
      throw new ProjectSheetError(413, 'This sheet is too large to keep a snapshot of. Choose “Don’t read this tab” on the biggest tabs below and sync again.');
    }
    const dataHash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const changedAt = dataHash !== record.dataHash ? now.toISOString() : record.changedAt;

    // update(), not set-merge: a merge would keep keys the sheet no longer has
    // (a deleted Timeline, a renamed phase) inside the old snapshot.
    await writeIfStillBound(projectId, spreadsheetId, {
      title: meta.title,
      url: meta.url,
      syncedAt: now.toISOString(),
      changedAt: changedAt ?? now.toISOString(),
      dataHash,
      report,
      data,
      syncError: FieldValue.delete(),
    });
    return (await getProjectSheetRecord(projectId))!;
  } catch (error) {
    if (error instanceof StaleSync) {
      throw new ProjectSheetError(409, 'The project was unbound or bound to another sheet while this one was being read.');
    }
    const explained = explain(error);
    const fields: UpdateData<DocumentData> = {
      syncError: { message: explained.message, configuration: explained.configuration, at: now.toISOString() },
    };
    if (!record.report && tabs) fields.report = planOnlyReport(tabs, record.overrides);
    await writeIfStillBound(projectId, spreadsheetId, fields).catch((e) => {
      if (!(e instanceof StaleSync)) throw e;
    });
    throw explained;
  }
}

export interface ProjectSheetSettingsPatch {
  /** One tab's role; `null` goes back to what its name says. */
  tab?: { title: string; role: SheetTabRole | null };
  stagesFrom?: SheetStagesFrom;
  showSheetLink?: boolean;
}

/**
 * The team's switches. A tab choice changes what is read, so it re-reads the
 * sheet; the other two only change what the portal shows from the snapshot.
 */
export async function updateProjectSheetSettings(projectId: string, patch: ProjectSheetSettingsPatch): Promise<ProjectSheetRecord> {
  const record = await getProjectSheetRecord(projectId);
  if (!record?.spreadsheetId) throw new ProjectSheetError(404, 'No sheet is bound to this project.');

  const update: Record<string, unknown> = {};
  if (patch.tab) {
    const { title, role } = patch.tab;
    if (typeof title !== 'string' || !title || title.length > 200) throw new ProjectSheetError(400, 'Unknown tab.');
    if (role !== null && !ROLES.includes(role)) throw new ProjectSheetError(400, 'Unknown tab role.');
    // Rewritten whole rather than by field path: tab titles hold dots and slashes.
    const overrides = { ...(record.overrides ?? {}) };
    if (role === null) delete overrides[title];
    else overrides[title] = role;
    update.overrides = overrides;
  }
  if (patch.stagesFrom !== undefined) {
    if (patch.stagesFrom !== 'sheet' && patch.stagesFrom !== 'app') throw new ProjectSheetError(400, 'Unknown stage source.');
    update.stagesFrom = patch.stagesFrom;
  }
  if (patch.showSheetLink !== undefined) update.showSheetLink = patch.showSheetLink === true;
  if (Object.keys(update).length === 0) return record;

  await doc(projectId).update(update);
  if (patch.tab) return syncProjectSheet(projectId);
  return (await getProjectSheetRecord(projectId))!;
}

export async function unbindProjectSheet(projectId: string): Promise<void> {
  await doc(projectId).delete();
}

/**
 * Every bound sheet, a few at a time, paged by document id so none is ever
 * skipped. One failing sheet does not stop the rest. A record whose project
 * was deleted is removed rather than read forever.
 */
export async function syncAllProjectSheets(options: { pageSize?: number; concurrency?: number } = {}): Promise<{ synced: number; failed: number; removed: number; errors: { projectId: string; message: string }[] }> {
  const pageSize = options.pageSize ?? 200;
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const errors: { projectId: string; message: string }[] = [];
  let synced = 0;
  let removed = 0;
  let after: string | undefined;

  for (;;) {
    let query = db.collection(COLLECTIONS.PROJECT_SHEETS).orderBy(FieldPath.documentId()).limit(pageSize);
    if (after) query = query.startAfter(after);
    const page = await query.get();
    if (page.empty) break;
    const ids = page.docs.map((d) => d.id);
    after = ids[ids.length - 1];

    const projects = await db.getAll(...ids.map((id) => db.collection(COLLECTIONS.PROJECTS).doc(id)));
    const live = ids.filter((id, i) => {
      if (projects[i].exists) return true;
      removed++;
      void doc(id).delete();
      return false;
    });

    for (let i = 0; i < live.length; i += concurrency) {
      await Promise.all(
        live.slice(i, i + concurrency).map(async (projectId) => {
          try {
            await syncProjectSheet(projectId);
            synced++;
          } catch (error) {
            errors.push({ projectId, message: error instanceof Error ? error.message : String(error) });
          }
        }),
      );
    }
    if (page.size < pageSize) break;
  }
  return { synced, failed: errors.length, removed, errors: errors.slice(0, 20) };
}
