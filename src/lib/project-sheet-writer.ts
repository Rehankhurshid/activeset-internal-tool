import 'server-only';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { AGENCY_CLOSE, AGENCY_START } from '@/lib/sop-templates';
import { loadSourceTemplates, toTimeline } from '@/lib/client-portal';
import {
  GoogleApiError,
  batchUpdateSpreadsheet,
  createSpreadsheetInFolder,
  getDriveFolder,
  getSpreadsheetMeta,
  parseDriveFolderId,
  writeRanges,
} from '@/lib/google-api';
import { ProjectSheetError, serviceAccountEmail } from '@/lib/project-sheet';
import {
  MANAGED_CHECKS_HEADER,
  MANAGED_HELP,
  MANAGED_INPUTS_HEADER,
  MANAGED_SEO_HEADER,
  MANAGED_OVERVIEW_FIELDS,
  MANAGED_PAGES_HEADER,
  MANAGED_PROCESS_HEADER,
  MANAGED_TABS,
  MAX_LINKS,
  managedSheetContent,
  type ManagedSheetContent,
  type SheetPageInput,
  type SheetSeoInput,
} from '@/modules/client-portal/domain/project-sheet.content';
import type { ProjectSheetRecord } from '@/modules/client-portal/domain/project-sheet.types';
import type { ChecklistSection, Project, ProjectChecklist, ProjectLink, Task } from '@/types';
import { linksFromValues, mergeProjectLinks, type WantedLink } from '@/lib/checklist-links';

/**
 * The project sheet the app creates and keeps (Rehan, 2026-10-01).
 *
 * Created in the team's Shared Drive, which is what lets the service account
 * make files at all (it has no Drive of its own). Laid out once, in the same
 * look as the master sheet; after that every write replaces the values only,
 * so formats, column widths and anyone's open tab stay put. A write happens
 * when the checklist, the page tracker or a client request changes (the app
 * asks for one), and every 15 minutes as a safety net; nothing is written when
 * nothing changed. The sheet is never read back.
 */

// --- Where sheets go -----------------------------------------------------------

// Server-only: `configurations` is world-writable, and this decides where client sheets are created.
const CONFIG_DOC = () => db.collection(COLLECTIONS.APP_SETTINGS).doc('project_sheets');

export interface ProjectSheetDrive {
  folderId: string;
  name: string;
  url: string;
  setBy?: string;
  setAt?: string;
}

export async function getProjectSheetDrive(): Promise<ProjectSheetDrive | null> {
  const snap = await CONFIG_DOC().get();
  const data = snap.data() as Partial<ProjectSheetDrive> | undefined;
  return data?.folderId ? (data as ProjectSheetDrive) : null;
}

/** Points the app at a Shared Drive (or a folder in one), once it can create files there. */
export async function setProjectSheetDrive(link: unknown, by: string): Promise<ProjectSheetDrive> {
  const folderId = parseDriveFolderId(link);
  if (!folderId) throw new ProjectSheetError(400, 'Paste the link to the Shared Drive, or a folder inside it.');
  let folder;
  try {
    folder = await getDriveFolder(folderId);
  } catch (error) {
    if (error instanceof GoogleApiError && error.status === 404) {
      throw new ProjectSheetError(
        403,
        `The app cannot see that drive yet. Add ${serviceAccountEmail() ?? 'the service account'} to the Shared Drive as a Content manager, then paste the link again.`,
      );
    }
    throw error;
  }
  if (!folder.driveId) {
    throw new ProjectSheetError(400, `"${folder.name}" is in someone's My Drive. Use a Shared Drive: the app has no Drive storage of its own.`);
  }
  if (!folder.canAddChildren) {
    throw new ProjectSheetError(403, `The app can see "${folder.name}" but cannot add files. Make ${serviceAccountEmail() ?? 'the service account'} a Content manager.`);
  }
  const drive: ProjectSheetDrive = {
    folderId: folder.id,
    name: folder.name,
    url: `https://drive.google.com/drive/folders/${folder.id}`,
    setBy: by,
    setAt: new Date().toISOString(),
  };
  await CONFIG_DOC().set(drive);
  return drive;
}

// --- The look (the master sheet's: Funnel Display and Funnel Sans, one colour per stage and status) ---

type Rgb = { red: number; green: number; blue: number };
function hex(value: string): Rgb {
  const n = parseInt(value.replace('#', ''), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}
const DISPLAY = 'Funnel Display';
const BODY = 'Funnel Sans';
const C = { ink: '#0F172A', body: '#1E293B', muted: '#64748B', faint: '#94A3B8', line: '#E2E8F0', white: '#FFFFFF', panel: '#F8FAFC', link: '#2563EB' };
const STAGE_COLOURS: Record<string, { bg: string; fg: string }> = {
  Kickoff: { bg: '#E2E8F0', fg: '#334155' },
  Copy: { bg: '#FCE7F3', fg: '#9D174D' },
  'Brand Design': { bg: '#EDE9FE', fg: '#5B21B6' },
  'Web Design': { bg: '#E0F2FE', fg: '#075985' },
  Development: { bg: '#E0E7FF', fg: '#3730A3' },
  Launch: { bg: '#FFEDD5', fg: '#9A3412' },
  Handover: { bg: '#D1FAE5', fg: '#065F46' },
};
const STATUS_COLOURS: Record<string, { bg: string; fg: string }> = {
  'Not started': { bg: '#F1F5F9', fg: '#64748B' },
  'In progress': { bg: '#DBEAFE', fg: '#1D4ED8' },
  'Waiting on client': { bg: '#FEF3C7', fg: '#B45309' },
  Done: { bg: '#DCFCE7', fg: '#15803D' },
  'Not needed': { bg: '#F8FAFC', fg: '#94A3B8' },
  Waiting: { bg: '#FEF3C7', fg: '#B45309' },
  Received: { bg: '#DCFCE7', fg: '#15803D' },
};
const WHO_COLOURS: Record<string, string> = { ActiveSet: '#475569', Client: '#B45309', Together: '#6D28D9' };
const ROWS = 300;
const FIELD_ROW = 2;
const LINKS_ROW = FIELD_ROW + MANAGED_OVERVIEW_FIELDS.length + 1;

type Range = { sheetId: number; startRowIndex: number; endRowIndex: number; startColumnIndex: number; endColumnIndex: number };
const range = (sheetId: number, r0: number, r1: number, c0: number, c1: number): Range => ({
  sheetId,
  startRowIndex: r0,
  endRowIndex: r1,
  startColumnIndex: c0,
  endColumnIndex: c1,
});
const font = (family: string, size: number, colour: string, more: Record<string, unknown> = {}) => ({
  fontFamily: family,
  fontSize: size,
  foregroundColorStyle: { rgbColor: hex(colour) },
  ...more,
});
function text(r: Range, format: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    repeatCell: {
      range: r,
      cell: { userEnteredFormat: { textFormat: format, ...extra } },
      fields: `userEnteredFormat(${['textFormat', ...Object.keys(extra)].join(',')})`,
    },
  };
}
const fill = (r: Range, colour: string) => ({
  repeatCell: { range: r, cell: { userEnteredFormat: { backgroundColorStyle: { rgbColor: hex(colour) } } }, fields: 'userEnteredFormat.backgroundColorStyle' },
});
const widths = (sheetId: number, px: number[]) =>
  px.map((pixelSize, i) => ({
    updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize }, fields: 'pixelSize' },
  }));
const rowHeight = (sheetId: number, r0: number, r1: number, pixelSize: number) => ({
  updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: r0, endIndex: r1 }, properties: { pixelSize }, fields: 'pixelSize' },
});
const base = (sheetId: number, cols: number) => ({
  repeatCell: {
    range: range(sheetId, 0, ROWS, 0, cols),
    cell: { userEnteredFormat: { textFormat: font(BODY, 10, C.body), verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP', padding: { top: 6, bottom: 6, left: 10, right: 10 } } },
    fields: 'userEnteredFormat(textFormat,verticalAlignment,wrapStrategy,padding)',
  },
});
const lines = (sheetId: number, r0: number, r1: number, c0: number, c1: number) => ({
  updateBorders: {
    range: range(sheetId, r0, r1, c0, c1),
    innerHorizontal: { style: 'SOLID', colorStyle: { rgbColor: hex(C.line) } },
    top: { style: 'SOLID', colorStyle: { rgbColor: hex(C.line) } },
    bottom: { style: 'SOLID', colorStyle: { rgbColor: hex(C.line) } },
  },
});
const header = (sheetId: number, cols: number) => [
  {
    repeatCell: {
      range: range(sheetId, 0, 1, 0, cols),
      cell: {
        userEnteredFormat: {
          backgroundColorStyle: { rgbColor: hex(C.ink) },
          textFormat: font(DISPLAY, 10, C.white, { bold: true }),
          verticalAlignment: 'MIDDLE',
          padding: { top: 8, bottom: 8, left: 10, right: 10 },
        },
      },
      fields: 'userEnteredFormat(backgroundColorStyle,textFormat,verticalAlignment,padding)',
    },
  },
  rowHeight(sheetId, 0, 1, 42),
  rowHeight(sheetId, 1, ROWS, 34),
];
const centre = (r: Range) => ({ repeatCell: { range: r, cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat.horizontalAlignment' } });
const dates = (r: Range) => ({ repeatCell: { range: r, cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'd mmm yyyy' } } }, fields: 'userEnteredFormat.numberFormat' } });
const rule = (r: Range, condition: Record<string, unknown>, format: Record<string, unknown>) => ({
  addConditionalFormatRule: { index: 0, rule: { ranges: [r], booleanRule: { condition, format } } },
});
const textEq = (word: string) => ({ type: 'TEXT_EQ', values: [{ userEnteredValue: word }] });
const formula = (f: string) => ({ type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: f }] });
const chips = (r: Range, words: Record<string, { bg: string; fg: string }>) =>
  Object.entries(words).map(([word, c]) =>
    rule(r, textEq(word), { backgroundColorStyle: { rgbColor: hex(c.bg) }, textFormat: { foregroundColorStyle: { rgbColor: hex(c.fg) }, bold: true } }),
  );
/** Anyone who starts typing is told the app keeps this tab, and that it will be replaced. */
const kept = (sheetId: number, title: string) => ({
  addProtectedRange: {
    protectedRange: {
      range: { sheetId },
      description: `${title} is kept by the ActiveSet app from the project: edits here are replaced at the next update`,
      warningOnly: true,
    },
  },
});

/** The four tabs and their look, on a new spreadsheet. Run once, when the sheet is created. */
async function layOut(spreadsheetId: string): Promise<void> {
  const meta = await getSpreadsheetMeta(spreadsheetId);
  const tabs = [
    { title: MANAGED_TABS.overview, colour: '#475569', cols: 4, frozen: 0 },
    // Two columns more: a hidden one where the app marks the step the project is on, then the step's link.
    { title: MANAGED_TABS.process, colour: '#7C3AED', cols: MANAGED_PROCESS_HEADER.length + 2, frozen: 1 },
    { title: MANAGED_TABS.pages, colour: '#0284C7', cols: MANAGED_PAGES_HEADER.length, frozen: 1 },
    { title: MANAGED_TABS.inputs, colour: '#D97706', cols: MANAGED_INPUTS_HEADER.length, frozen: 1 },
    ...EXTRA_TABS,
  ];
  const added = await batchUpdateSpreadsheet(spreadsheetId, [
    ...tabs.map((t, index) => ({
      addSheet: {
        properties: {
          title: t.title,
          index,
          tabColorStyle: { rgbColor: hex(t.colour) },
          gridProperties: { rowCount: ROWS, columnCount: t.cols, frozenRowCount: t.frozen, hideGridlines: true },
        },
      },
    })),
    ...meta.tabs.map((t) => ({ deleteSheet: { sheetId: t.sheetId } })),
  ]);
  const ids = (added.replies ?? [])
    .map((r) => (r as { addSheet?: { properties?: { sheetId: number; title: string } } }).addSheet?.properties)
    .filter((p): p is { sheetId: number; title: string } => !!p);
  const id = (title: string) => ids.find((p) => p.title === title)!.sheetId;
  const [OV, PR, PG, IN] = [id(MANAGED_TABS.overview), id(MANAGED_TABS.process), id(MANAGED_TABS.pages), id(MANAGED_TABS.inputs)];
  const [CK, SE] = [id(MANAGED_TABS.checks), id(MANAGED_TABS.seo)];
  const all = (sheet: number, c0: number, c1: number) => range(sheet, 1, ROWS, c0, c1);
  const fields = MANAGED_OVERVIEW_FIELDS.length;

  await batchUpdateSpreadsheet(spreadsheetId, [
    // Overview: the title, a line on when it was updated, the facts, KEY LINKS; how the sheet works beside them.
    base(OV, 4),
    ...widths(OV, [150, 460, 32, 540]),
    { mergeCells: { range: range(OV, 0, 1, 0, 2), mergeType: 'MERGE_ALL' } },
    text(range(OV, 0, 1, 0, 2), font(DISPLAY, 22, C.ink, { bold: true }), { wrapStrategy: 'OVERFLOW_CELL', verticalAlignment: 'BOTTOM' }),
    rowHeight(OV, 0, 1, 56),
    { mergeCells: { range: range(OV, 1, 2, 0, 2), mergeType: 'MERGE_ALL' } },
    text(range(OV, 1, 2, 0, 2), font(BODY, 9, C.faint, { italic: true }), { wrapStrategy: 'OVERFLOW_CELL' }),
    text(range(OV, FIELD_ROW, FIELD_ROW + fields, 0, 1), font(DISPLAY, 9, C.muted, { bold: true })),
    text(range(OV, FIELD_ROW, FIELD_ROW + fields, 1, 2), font(DISPLAY, 11, C.ink), { horizontalAlignment: 'LEFT' }),
    fill(range(OV, FIELD_ROW, FIELD_ROW + fields, 1, 2), C.panel),
    lines(OV, FIELD_ROW, FIELD_ROW + fields, 0, 2),
    dates(range(OV, FIELD_ROW + 3, FIELD_ROW + 5, 1, 2)),
    text(range(OV, LINKS_ROW, LINKS_ROW + 1, 0, 2), font(DISPLAY, 9, C.muted, { bold: true })),
    text(range(OV, LINKS_ROW + 1, LINKS_ROW + 1 + MAX_LINKS, 0, 1), font(DISPLAY, 10, C.body, { bold: true })),
    text(range(OV, LINKS_ROW + 1, LINKS_ROW + 1 + MAX_LINKS, 1, 2), font(BODY, 10, C.link, { underline: true })),
    text(range(OV, FIELD_ROW, FIELD_ROW + 1, 3, 4), font(DISPLAY, 13, C.ink, { bold: true })),
    text(range(OV, FIELD_ROW + 1, FIELD_ROW + MANAGED_HELP.length, 3, 4), font(BODY, 10, '#334155')),
    fill(range(OV, FIELD_ROW, FIELD_ROW + MANAGED_HELP.length, 3, 4), '#F5F3FF'),
    { autoResizeDimensions: { dimensions: { sheetId: OV, dimension: 'ROWS', startIndex: FIELD_ROW, endIndex: FIELD_ROW + MANAGED_HELP.length } } },

    // Process: # · Stage · Step · Who · Status · Date, the step we are on standing out.
    base(PR, 6),
    ...header(PR, 6),
    ...widths(PR, [48, 150, 440, 120, 180, 130]),
    lines(PR, 1, ROWS, 0, 6),
    text(all(PR, 0, 1), font(DISPLAY, 10, C.faint), { horizontalAlignment: 'CENTER' }),
    centre(range(PR, 0, 1, 0, 1)),
    centre(range(PR, 0, 1, 4, 5)),
    text(all(PR, 1, 2), font(DISPLAY, 10, C.body, { bold: true })),
    text(all(PR, 2, 3), font(BODY, 11, C.ink)),
    text(all(PR, 3, 4), font(DISPLAY, 10, C.muted, { bold: true })),
    text(all(PR, 4, 5), font(DISPLAY, 10, C.muted, { bold: true }), { horizontalAlignment: 'CENTER' }),
    text(all(PR, 5, 6), font(BODY, 10, C.muted)),
    dates(all(PR, 5, 6)),
    rule(range(PR, 1, ROWS, 0, 6), formula('=$E2="Done"'), { textFormat: { foregroundColorStyle: { rgbColor: hex(C.faint) } } }),
    rule(range(PR, 1, ROWS, 0, 6), formula('=$E2="Waiting on client"'), { backgroundColorStyle: { rgbColor: hex('#FFFBEB') } }),
    { updateDimensionProperties: { range: { sheetId: PR, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } },
    rule(range(PR, 1, ROWS, 0, 6), formula('=$G2="now"'), { backgroundColorStyle: { rgbColor: hex('#EEF2FF') }, textFormat: { bold: true } }),
    ...Object.entries(WHO_COLOURS).map(([who, colour]) => rule(all(PR, 3, 4), textEq(who), { textFormat: { foregroundColorStyle: { rgbColor: hex(colour) }, bold: true } })),
    ...Object.entries(STAGE_COLOURS).map(([stage, c]) =>
      rule(all(PR, 1, 2), textEq(stage), { backgroundColorStyle: { rgbColor: hex(c.bg) }, textFormat: { foregroundColorStyle: { rgbColor: hex(c.fg) }, bold: true } }),
    ),
    ...chips(all(PR, 4, 5), STATUS_COLOURS),
    ...formatProcessLink(PR),

    // Pages: Page · Copy · Design · Development · Link.
    base(PG, 5),
    ...header(PG, 5),
    ...widths(PG, [420, 160, 160, 160, 280]),
    lines(PG, 1, ROWS, 0, 5),
    // One line per page: a long title is cut at the cell's edge, not wrapped
    // into a row too short to show it. The full title is in the cell.
    text(all(PG, 0, 1), font(DISPLAY, 11, C.ink, { bold: true }), { wrapStrategy: 'CLIP' }),
    text(all(PG, 1, 4), font(DISPLAY, 10, C.muted, { bold: true }), { horizontalAlignment: 'CENTER' }),
    centre(range(PG, 0, 1, 1, 4)),
    text(all(PG, 4, 5), font(BODY, 10, C.link, { underline: true }), { wrapStrategy: 'CLIP' }),
    rule(range(PG, 1, ROWS, 0, 5), formula('=AND($A2<>"",$B2="Done",$C2="Done",$D2="Done")'), { backgroundColorStyle: { rgbColor: hex('#F0FDF4') } }),
    ...chips(all(PG, 1, 4), STATUS_COLOURS),

    // What we need: Item · Needed by · Status, overdue in red.
    base(IN, 3),
    ...header(IN, 3),
    ...widths(IN, [560, 150, 170]),
    lines(IN, 1, ROWS, 0, 3),
    text(all(IN, 0, 1), font(DISPLAY, 11, C.ink, { bold: true }), { wrapStrategy: 'CLIP' }),
    text(all(IN, 1, 2), font(BODY, 10, C.body)),
    dates(all(IN, 1, 2)),
    text(all(IN, 2, 3), font(DISPLAY, 10, C.muted, { bold: true }), { horizontalAlignment: 'CENTER' }),
    centre(range(IN, 0, 1, 2, 3)),
    rule(range(IN, 1, ROWS, 0, 3), formula('=AND($C2="Waiting",ISNUMBER($B2),$B2<TODAY())'), {
      backgroundColorStyle: { rgbColor: hex('#FEF2F2') },
      textFormat: { foregroundColorStyle: { rgbColor: hex('#991B1B') } },
    }),
    rule(range(IN, 1, ROWS, 0, 3), formula('=$C2="Received"'), { textFormat: { foregroundColorStyle: { rgbColor: hex(C.faint) } } }),
    ...chips(all(IN, 2, 3), STATUS_COLOURS),

    ...[OV, PR, PG, IN].map((sheet, i) => kept(sheet, Object.values(MANAGED_TABS)[i])),
    ...formatChecks(CK),
    ...formatSeo(SE),
  ]);
}

/**
 * Bumped when a tab is added after sheets already exist: a sheet laid out
 * under an older version gets the missing tabs on its next write.
 * 2 (2026-10-01): Checklist and SEO. 3 (same day): a Link column on Process.
 */
export const LAYOUT_VERSION = 3;

/** The tabs added after the first four, and how each is laid out. */
const EXTRA_TABS = [
  { title: MANAGED_TABS.checks, colour: '#059669', cols: MANAGED_CHECKS_HEADER.length, frozen: 1 },
  { title: MANAGED_TABS.seo, colour: '#DB2777', cols: MANAGED_SEO_HEADER.length, frozen: 1 },
];

/** Process column H: the step's link (the moodboard, the sitemap), after the hidden "now" column. */
function formatProcessLink(PR: number) {
  return [
    {
      repeatCell: {
        range: range(PR, 0, 1, 7, 8),
        cell: {
          userEnteredFormat: {
            backgroundColorStyle: { rgbColor: hex(C.ink) },
            textFormat: font(DISPLAY, 10, C.white, { bold: true }),
            verticalAlignment: 'MIDDLE',
            padding: { top: 8, bottom: 8, left: 10, right: 10 },
          },
        },
        fields: 'userEnteredFormat(backgroundColorStyle,textFormat,verticalAlignment,padding)',
      },
    },
    ...widths(PR, [48, 150, 440, 120, 180, 130, 20, 280]).slice(7),
    { repeatCell: { range: range(PR, 1, ROWS, 7, 8), cell: { userEnteredFormat: { textFormat: font(BODY, 10, C.link, { underline: true }), verticalAlignment: 'MIDDLE', wrapStrategy: 'CLIP', padding: { top: 6, bottom: 6, left: 10, right: 10 } } }, fields: 'userEnteredFormat(textFormat,verticalAlignment,wrapStrategy,padding)' } },
    lines(PR, 1, ROWS, 7, 8),
  ];
}

/** Checklist: Section · Check · Status · Date, QA and launch checks from the project's checklist. */
function formatChecks(CK: number) {
  const all = (c0: number, c1: number) => range(CK, 1, ROWS, c0, c1);
  return [
    base(CK, 4),
    ...header(CK, 4),
    ...widths(CK, [200, 620, 160, 130]),
    lines(CK, 1, ROWS, 0, 4),
    text(all(0, 1), font(DISPLAY, 10, C.muted, { bold: true }), { wrapStrategy: 'CLIP' }),
    text(all(1, 2), font(BODY, 11, C.ink), { wrapStrategy: 'CLIP' }),
    text(all(2, 3), font(DISPLAY, 10, C.muted, { bold: true }), { horizontalAlignment: 'CENTER' }),
    centre(range(CK, 0, 1, 2, 3)),
    text(all(3, 4), font(BODY, 10, C.muted)),
    dates(all(3, 4)),
    rule(range(CK, 1, ROWS, 0, 4), formula('=$C2="Done"'), { textFormat: { foregroundColorStyle: { rgbColor: hex(C.faint) } } }),
    ...chips(all(2, 3), { ...STATUS_COLOURS, 'Not needed': { bg: '#F1F5F9', fg: '#94A3B8' } }),
    kept(CK, MANAGED_TABS.checks),
  ];
}

/** SEO: each scanned page's tags, lengths, schema and what to fix. */
function formatSeo(SE: number) {
  const all = (c0: number, c1: number) => range(SE, 1, ROWS, c0, c1);
  return [
    base(SE, MANAGED_SEO_HEADER.length),
    ...header(SE, MANAGED_SEO_HEADER.length),
    ...widths(SE, [260, 300, 70, 420, 90, 200, 220, 170, 90, 320, 110]),
    lines(SE, 1, ROWS, 0, MANAGED_SEO_HEADER.length),
    text(all(0, MANAGED_SEO_HEADER.length), font(BODY, 10, C.body), { wrapStrategy: 'CLIP' }),
    text(all(0, 1), font(BODY, 10, C.link, { underline: true }), { wrapStrategy: 'CLIP' }),
    text(all(1, 2), font(DISPLAY, 10, C.ink, { bold: true }), { wrapStrategy: 'CLIP' }),
    text(all(5, 7), font(BODY, 9, C.link, { underline: true }), { wrapStrategy: 'CLIP' }),
    centre(all(2, 3)),
    centre(all(4, 5)),
    centre(all(8, 9)),
    text(all(9, 10), font(BODY, 10, '#9A3412'), { wrapStrategy: 'CLIP' }),
    text(all(10, 11), font(BODY, 10, C.muted)),
    dates(all(10, 11)),
    // Lengths outside what search results show, and missing alt text, in red.
    rule(all(2, 3), formula('=AND(ISNUMBER($C2),$C2>60)'), { textFormat: { foregroundColorStyle: { rgbColor: hex('#B91C1C') }, bold: true } }),
    rule(all(4, 5), formula('=AND(ISNUMBER($E2),OR($E2>160,$E2<70))'), { textFormat: { foregroundColorStyle: { rgbColor: hex('#B91C1C') }, bold: true } }),
    rule(all(8, 9), formula('=AND(ISNUMBER($I2),$I2>0)'), { textFormat: { foregroundColorStyle: { rgbColor: hex('#B91C1C') }, bold: true } }),
    rule(all(9, 10), textEq('Nothing'), { textFormat: { foregroundColorStyle: { rgbColor: hex('#15803D') }, bold: true } }),
    kept(SE, MANAGED_TABS.seo),
  ];
}

/**
 * Brings a sheet laid out by an older version up to date: adds the tabs it is
 * missing and restyles the Overview's help lines, which grew with them.
 */
async function upgradeLayout(spreadsheetId: string): Promise<void> {
  const meta = await getSpreadsheetMeta(spreadsheetId);
  const have = new Set(meta.tabs.map((t) => t.title));
  const missing = EXTRA_TABS.filter((t) => !have.has(t.title));
  const overview = meta.tabs.find((t) => t.title === MANAGED_TABS.overview);
  const process = meta.tabs.find((t) => t.title === MANAGED_TABS.process);
  const requests: Record<string, unknown>[] = [];
  if (process?.sheetId !== undefined) {
    requests.push(
      { updateSheetProperties: { properties: { sheetId: process.sheetId, gridProperties: { columnCount: MANAGED_PROCESS_HEADER.length + 2 } }, fields: 'gridProperties.columnCount' } },
      ...formatProcessLink(process.sheetId),
    );
  }
  if (missing.length) {
    const added = await batchUpdateSpreadsheet(
      spreadsheetId,
      missing.map((t) => ({
        addSheet: {
          properties: {
            title: t.title,
            tabColorStyle: { rgbColor: hex(t.colour) },
            gridProperties: { rowCount: ROWS, columnCount: t.cols, frozenRowCount: t.frozen, hideGridlines: true },
          },
        },
      })),
    );
    for (const reply of added.replies ?? []) {
      const props = (reply as { addSheet?: { properties?: { sheetId: number; title: string } } }).addSheet?.properties;
      if (props?.title === MANAGED_TABS.checks) requests.push(...formatChecks(props.sheetId));
      if (props?.title === MANAGED_TABS.seo) requests.push(...formatSeo(props.sheetId));
    }
  }
  if (overview?.sheetId !== undefined) {
    const OV = overview.sheetId;
    requests.push(
      text(range(OV, FIELD_ROW + 1, FIELD_ROW + MANAGED_HELP.length, 3, 4), font(BODY, 10, '#334155')),
      fill(range(OV, FIELD_ROW, FIELD_ROW + MANAGED_HELP.length, 3, 4), '#F5F3FF'),
      { autoResizeDimensions: { dimensions: { sheetId: OV, dimension: 'ROWS', startIndex: FIELD_ROW, endIndex: FIELD_ROW + MANAGED_HELP.length } } },
    );
  }
  if (requests.length) await batchUpdateSpreadsheet(spreadsheetId, requests);
}

/** A tab's rows padded to its full height, so a shorter list leaves nothing behind. */
function padded(rows: (string | number)[][], width: number, height: number): (string | number)[][] {
  const blank = Array.from({ length: width }, () => '');
  return [...rows, ...Array.from({ length: Math.max(0, height - rows.length) }, () => blank)].slice(0, height);
}

function updatedLine(at: Date): string {
  const when = at.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  return `Kept up to date by ActiveSet. Last updated ${when} IST.`;
}

/** Every value in the sheet, replaced in one call. */
async function writeValues(spreadsheetId: string, content: ManagedSheetContent, at: Date): Promise<void> {
  const links = padded(content.links.map((l) => [l.name, l.url]), 2, MAX_LINKS);
  await writeRanges(spreadsheetId, [
    {
      tab: MANAGED_TABS.overview,
      rows: [
        [content.title, ''],
        [updatedLine(at), ''],
        ...MANAGED_OVERVIEW_FIELDS.map((f) => [f, content.overview[f]]),
        ['', ''],
        ['KEY LINKS', ''],
        ...links,
      ],
    },
    { tab: MANAGED_TABS.overview, start: `D${FIELD_ROW + 1}`, rows: MANAGED_HELP.map((line) => [line]) },
    {
      tab: MANAGED_TABS.process,
      rows: padded(
        [[...MANAGED_PROCESS_HEADER, '', 'Link'], ...content.process.map((s, i) => [i + 1, s.stage, s.step, s.who, s.status, s.date, s.now ? 'now' : '', s.link])],
        MANAGED_PROCESS_HEADER.length + 2,
        ROWS,
      ),
    },
    {
      tab: MANAGED_TABS.pages,
      rows: padded(
        [[...MANAGED_PAGES_HEADER], ...content.pages.map((p) => [p.page, p.copy, p.design, p.development, p.link])],
        MANAGED_PAGES_HEADER.length,
        ROWS,
      ),
    },
    {
      tab: MANAGED_TABS.inputs,
      rows: padded([[...MANAGED_INPUTS_HEADER], ...content.inputs.map((r) => [r.item, r.neededBy, r.status])], MANAGED_INPUTS_HEADER.length, ROWS),
    },
    {
      tab: MANAGED_TABS.checks,
      rows: padded([[...MANAGED_CHECKS_HEADER], ...content.checks.map((r) => [r.section, r.check, r.status, r.date])], MANAGED_CHECKS_HEADER.length, ROWS),
    },
    {
      tab: MANAGED_TABS.seo,
      rows: padded(
        [
          [...MANAGED_SEO_HEADER],
          ...content.seo.map((r) => [r.page, r.title, r.titleLength, r.description, r.descriptionLength, r.ogImage, r.canonical, r.schema, r.imagesWithoutAlt, r.toFix, r.checked]),
        ],
        MANAGED_SEO_HEADER.length,
        ROWS,
      ),
    },
  ]);
}

// --- What goes in ----------------------------------------------------------------

export async function contentFor(projectId: string): Promise<{ project: Project; content: ManagedSheetContent }> {
  const projectSnap = await db.collection(COLLECTIONS.PROJECTS).doc(projectId).get();
  if (!projectSnap.exists) throw new ProjectSheetError(404, 'Project not found.');
  const project = { ...(projectSnap.data() as Project), id: projectId };
  const [checklistSnap, pageSnap, askSnap, timelineSnap, auditSnap] = await Promise.all([
    db.collection(COLLECTIONS.PROJECT_CHECKLISTS).where('projectId', '==', projectId).limit(20).get(),
    db.collection(COLLECTIONS.PROJECTS).doc(projectId).collection(COLLECTIONS.PROJECT_PAGES).limit(500).get(),
    db.collection(COLLECTIONS.TASKS).where('projectId', '==', projectId).where('needsClientInput', '==', true).limit(500).get(),
    db.collection(COLLECTIONS.PROJECT_TIMELINES).doc(projectId).get(),
    db.collection(COLLECTIONS.PROJECTS).doc(projectId).collection('link_audits').limit(500).get(),
  ]);
  const checklists = checklistSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as ProjectChecklist);
  const templates = await loadSourceTemplates(checklists);
  const content = managedSheetContent({
    project,
    checklists,
    templates,
    agency: [AGENCY_START, AGENCY_CLOSE],
    timeline: toTimeline(projectId, timelineSnap.exists ? (timelineSnap.data() as Record<string, unknown>) : undefined),
    pages: pageSnap.docs.map((d) => d.data() as SheetPageInput),
    asks: askSnap.docs.map((d) => d.data() as Task),
    seo: seoInputs(project, auditSnap.docs.map((d) => ({ id: d.id, data: d.data() }))),
  });
  return { project, content };
}

/** Tools the team links to, never pages of the site itself. */
const TOOL_HOSTS = /(^|\.)(figma\.com|markup\.io|google\.com|notion\.so|loom\.com|clickup\.com|slack\.com|fathom\.video)$/i;

/**
 * Each of the site's pages as its last scan read it, in the project's link
 * order. Scans cover the links the app knows, which for a site still being
 * built is usually the old live site: the URL and the Checked date say which.
 */
function seoInputs(project: Project, audits: { id: string; data: Record<string, unknown> }[]): SheetSeoInput[] {
  const byLink = new Map(audits.map((a) => [a.id, a.data]));
  const rows: SheetSeoInput[] = [];
  for (const link of [...(project.links ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    let host = '';
    try {
      host = new URL(link.url).hostname;
    } catch {
      continue;
    }
    if (TOOL_HOSTS.test(host)) continue;
    const audit = byLink.get(link.id) as
      | { lastRun?: string; categories?: Record<string, Record<string, unknown> | undefined> }
      | undefined;
    const c = audit?.categories;
    if (!c?.seo) continue;
    rows.push({
      url: link.url,
      title: c.seo.title as string | undefined,
      description: c.seo.metaDescription as string | undefined,
      ogImage: c.openGraph?.image as string | undefined,
      canonical: c.metaTags?.canonicalUrl as string | undefined,
      schemaTypes: (c.schema?.schemaTypes as string[] | undefined) ?? [],
      imagesWithoutAlt: c.seo.imagesWithoutAlt as number | undefined,
      h1Count: c.headingStructure?.h1Count as number | undefined,
      checkedAt: audit?.lastRun,
    });
  }
  return rows;
}

const hashOf = (content: ManagedSheetContent) => createHash('sha256').update(JSON.stringify(content)).digest('hex');

// --- Creating and keeping --------------------------------------------------------

const recordRef = (projectId: string) => db.collection(COLLECTIONS.PROJECT_SHEETS).doc(projectId);

/**
 * Creates the project's sheet in the Shared Drive, lays it out and fills it.
 * A project that already has an app-kept sheet keeps it; one with a hand-kept
 * sheet bound is moved to the new one (the old sheet itself is left alone).
 */
export async function createManagedSheet(projectId: string, by: string): Promise<ProjectSheetRecord> {
  const drive = await getProjectSheetDrive();
  if (!drive) throw new ProjectSheetError(409, 'Set up the Shared Drive first: the app creates project sheets there.');
  const existing = (await recordRef(projectId).get()).data() as ProjectSheetRecord | undefined;
  if (existing?.managed) return writeManagedSheet(projectId, { force: true });

  const { content } = await contentFor(projectId);
  const file = await createSpreadsheetInFolder(drive.folderId, content.title);
  await layOut(file.id);
  const record: ProjectSheetRecord = {
    projectId,
    spreadsheetId: file.id,
    url: file.url,
    title: content.title,
    boundAt: new Date().toISOString(),
    boundBy: by,
    managed: true,
    layoutVersion: LAYOUT_VERSION,
  };
  // `set`, not merge: a hand-kept sheet's snapshot and report go with its binding.
  await recordRef(projectId).set(record);
  await recordOnChecklist(projectId, file.url);
  // The kickoff email links the client's sheet from here.
  await db.collection(COLLECTIONS.PROJECTS).doc(projectId).update({ 'delivery.trackerSheetUrl': file.url });
  return writeManagedSheet(projectId, { force: true });
}

/**
 * The checklist's "Share the project tracker" step records the sheet the app
 * made (Rehan, 2026-10-01: why is this not filled automatically), and so does
 * the project's "Project Tracker" link, as when the team records it by hand.
 * The step is not ticked: sharing it with the client is still the team's to do.
 */
export async function recordOnChecklist(projectId: string, url: string): Promise<void> {
  const snap = await db.collection(COLLECTIONS.PROJECT_CHECKLISTS).where('projectId', '==', projectId).limit(20).get();
  const wanted: WantedLink[] = [];
  for (const doc of snap.docs) {
    const sections = (doc.get('sections') ?? []) as ChecklistSection[];
    let changed = false;
    for (const section of sections) {
      for (const item of section.items ?? []) {
        if (!(item.fields ?? []).some((f) => f.id === 'tracker') || item.values?.tracker === url) continue;
        item.values = { ...(item.values ?? {}), tracker: url };
        wanted.push(...linksFromValues(item.fields, { tracker: url }));
        changed = true;
      }
    }
    if (changed) await doc.ref.update({ sections: JSON.parse(JSON.stringify(sections)), updatedAt: FieldValue.serverTimestamp() });
  }
  if (wanted.length) {
    const projectRef = db.collection(COLLECTIONS.PROJECTS).doc(projectId);
    const links = ((await projectRef.get()).get('links') ?? []) as ProjectLink[];
    const merged = mergeProjectLinks(links, wanted, () => `link_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`);
    if (merged.changed.length) await projectRef.update({ links: JSON.parse(JSON.stringify(merged.links)) });
  }
}

/** Writes the sheet if anything in it changed since the last write (or always, with `force`). */
export async function writeManagedSheet(projectId: string, options: { force?: boolean } = {}): Promise<ProjectSheetRecord> {
  const ref = recordRef(projectId);
  const record = (await ref.get()).data() as ProjectSheetRecord | undefined;
  if (!record?.managed) throw new ProjectSheetError(404, 'This project has no sheet kept by the app.');
  const { content } = await contentFor(projectId);
  const hash = hashOf(content);
  if (!options.force && hash === record.writtenHash) return record;
  const at = new Date();
  try {
    if ((record.layoutVersion ?? 1) < LAYOUT_VERSION) {
      await upgradeLayout(record.spreadsheetId);
      await ref.update({ layoutVersion: LAYOUT_VERSION });
      record.layoutVersion = LAYOUT_VERSION;
    }
    await writeValues(record.spreadsheetId, content, at);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ref.update({ writeError: { message, configuration: error instanceof GoogleApiError && error.configuration, at: at.toISOString() } });
    throw error;
  }
  const patch = { writtenAt: at.toISOString(), writtenHash: hash, title: content.title };
  await ref.update({ ...patch, writeError: FieldValue.delete() });
  const next: ProjectSheetRecord = { ...record, ...patch };
  delete next.writeError;
  return next;
}

/** The cron's safety net: every app-kept sheet whose content moved since its last write. */
export async function writeAllManagedSheets(): Promise<{ written: number; unchanged: number; failed: number }> {
  const snap = await db.collection(COLLECTIONS.PROJECT_SHEETS).where('managed', '==', true).limit(500).get();
  let written = 0;
  let unchanged = 0;
  let failed = 0;
  for (const doc of snap.docs) {
    try {
      const before = doc.get('writtenHash');
      const after = await writeManagedSheet(doc.id);
      if (after.writtenHash !== before) written++;
      else unchanged++;
    } catch (error) {
      failed++;
      console.error(`[project-sheet] write failed for ${doc.id}:`, error instanceof Error ? error.message : error);
    }
  }
  return { written, unchanged, failed };
}
