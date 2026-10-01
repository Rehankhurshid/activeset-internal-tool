/**
 * Builds the ActiveSet project sheet template into an empty Google Sheet.
 *
 *   npm run sheet:template -- <sheet link or id>
 *
 * The app's service account cannot create files (Google gives it no Drive
 * storage), so make an empty sheet in Drive first, share it with the service
 * account as an Editor, and pass its link. The script refuses a sheet that
 * already has any of the template's tabs, so it can never overwrite a
 * project's sheet. After it runs, the sheet is the master: teams use File →
 * Make a copy, and change the master in Sheets rather than here.
 *
 * The format is defined in src/modules/client-portal/domain/project-sheet.template.ts.
 */
import '@/lib/load-env';
import {
  batchUpdateSpreadsheet,
  getSpreadsheetMeta,
  parseSpreadsheetId,
  readTabsWithLinks,
  writeRanges,
} from '@/lib/google-api';
import { readProjectSheet } from '@/modules/client-portal/domain/project-sheet.read';
import {
  INPUTS_HEADER,
  INPUT_ROWS,
  INPUT_STATUSES,
  OVERVIEW_FIELDS,
  OVERVIEW_HELP,
  OVERVIEW_LINKS,
  PAGES_HEADER,
  PAGE_ROWS,
  PAGE_STATUSES,
  PROCESS_HEADER,
  PROCESS_STATUSES,
  PROCESS_STEPS,
  STAGES,
  TEMPLATE_TABS,
  WHO,
} from '@/modules/client-portal/domain/project-sheet.template';

type Rgb = { red: number; green: number; blue: number };

function hex(value: string): Rgb {
  const n = parseInt(value.replace('#', ''), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}

const FONT = 'Inter';
const INK = hex('#111827');
const MUTED = hex('#6B7280');
const HEADER_BG = hex('#1F2937');
const WHITE = hex('#FFFFFF');

/** One colour per status, the same on every tab. */
const STATUS_COLOURS: Record<string, { bg?: string; fg: string; strike?: boolean }> = {
  Done: { bg: '#DCFCE7', fg: '#166534' },
  Received: { bg: '#DCFCE7', fg: '#166534' },
  'In progress': { bg: '#DBEAFE', fg: '#1E40AF' },
  'Waiting on client': { bg: '#FEF3C7', fg: '#92400E' },
  Waiting: { bg: '#FEF3C7', fg: '#92400E' },
  Skipped: { fg: '#9CA3AF', strike: true },
  'Not needed': { fg: '#9CA3AF' },
};

/** A quiet tint per stage, so the Process tab reads in blocks. */
const STAGE_TINTS: Record<string, string> = {
  Kickoff: '#F1F5F9',
  Copy: '#FFE4E6',
  'Brand Design': '#EDE9FE',
  'Web Design': '#E0F2FE',
  Development: '#CCFBF1',
  Launch: '#FFEDD5',
};

const ROWS = 300;

async function main() {
  const id = parseSpreadsheetId(process.argv[2] ?? '');
  if (!id) {
    console.error('Usage: npm run sheet:template -- <link to an empty Google Sheet shared with the service account as Editor>');
    process.exit(1);
  }

  const meta = await getSpreadsheetMeta(id);
  const clash = meta.tabs.filter((t) => (Object.values(TEMPLATE_TABS) as string[]).includes(t.title));
  if (clash.length) {
    console.error(`"${meta.title}" already has ${clash.map((t) => `"${t.title}"`).join(', ')}. Use an empty sheet; this never overwrites one.`);
    process.exit(1);
  }

  // 1. The four tabs, then remove whatever the empty sheet started with.
  const tabs = [
    { title: TEMPLATE_TABS.overview, colour: '#64748B', cols: 4 },
    { title: TEMPLATE_TABS.process, colour: '#7C3AED', cols: PROCESS_HEADER.length },
    { title: TEMPLATE_TABS.pages, colour: '#0284C7', cols: PAGES_HEADER.length },
    { title: TEMPLATE_TABS.inputs, colour: '#D97706', cols: INPUTS_HEADER.length },
  ];
  const added = await batchUpdateSpreadsheet(id, [
    ...tabs.map((t, index) => ({
      addSheet: {
        properties: {
          title: t.title,
          index,
          tabColorStyle: { rgbColor: hex(t.colour) },
          gridProperties: { rowCount: ROWS, columnCount: t.cols, frozenRowCount: t.title === TEMPLATE_TABS.overview ? 0 : 1 },
        },
      },
    })),
    ...meta.tabs.filter((t) => t.sheetId !== undefined).map((t) => ({ deleteSheet: { sheetId: t.sheetId } })),
  ]);
  const ids = (added.replies ?? [])
    .map((r) => (r as { addSheet?: { properties?: { sheetId: number; title: string } } }).addSheet?.properties)
    .filter((p): p is { sheetId: number; title: string } => !!p);
  const sheetId = (title: string) => ids.find((p) => p.title === title)!.sheetId;
  const OV = sheetId(TEMPLATE_TABS.overview);
  const PR = sheetId(TEMPLATE_TABS.process);
  const PG = sheetId(TEMPLATE_TABS.pages);
  const IN = sheetId(TEMPLATE_TABS.inputs);

  // 2. The content.
  const linksRow = OVERVIEW_FIELDS.length + 2; // a blank row, then KEY LINKS
  await writeRanges(id, [
    {
      tab: TEMPLATE_TABS.overview,
      rows: [
        ...OVERVIEW_FIELDS.map((f) => [f, f === 'Services' ? 'Copy, Brand Design, Web Design, Development' : '']),
        [''],
        ['KEY LINKS'],
        ...OVERVIEW_LINKS.map((l) => [l, '']),
      ],
    },
    { tab: TEMPLATE_TABS.overview, start: 'D1', rows: OVERVIEW_HELP.map((line) => [line]) },
    {
      tab: TEMPLATE_TABS.process,
      rows: [[...PROCESS_HEADER], ...PROCESS_STEPS.map((s) => ['=ROW()-1', s.stage, s.step, s.who, 'Not started', '', '', ''])],
    },
    { tab: TEMPLATE_TABS.pages, rows: [[...PAGES_HEADER], ...PAGE_ROWS.map((p) => [p, 'Not started', 'Not started', 'Not started', '', ''])] },
    { tab: TEMPLATE_TABS.inputs, rows: [[...INPUTS_HEADER], ...INPUT_ROWS.map((r) => [r.item, r.why, '', 'Waiting', ''])] },
  ]);

  // 3. The look: one font, a dark header, widths, dropdowns, colours, notes.
  const range = (sheet: number, r0: number, r1: number, c0: number, c1: number) => ({
    sheetId: sheet,
    startRowIndex: r0,
    endRowIndex: r1,
    startColumnIndex: c0,
    endColumnIndex: c1,
  });
  const widths = (sheet: number, px: number[]) =>
    px.map((pixelSize, i) => ({
      updateDimensionProperties: {
        range: { sheetId: sheet, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize },
        fields: 'pixelSize',
      },
    }));
  const base = (sheet: number, cols: number) => ({
    repeatCell: {
      range: range(sheet, 0, ROWS, 0, cols),
      cell: {
        userEnteredFormat: {
          textFormat: { fontFamily: FONT, fontSize: 10, foregroundColorStyle: { rgbColor: INK } },
          verticalAlignment: 'MIDDLE',
          wrapStrategy: 'WRAP',
          padding: { top: 6, bottom: 6, left: 8, right: 8 },
        },
      },
      fields: 'userEnteredFormat(textFormat,verticalAlignment,wrapStrategy,padding)',
    },
  });
  const header = (sheet: number, cols: number) => [
    {
      repeatCell: {
        range: range(sheet, 0, 1, 0, cols),
        cell: {
          userEnteredFormat: {
            backgroundColorStyle: { rgbColor: HEADER_BG },
            textFormat: { fontFamily: FONT, fontSize: 10, bold: true, foregroundColorStyle: { rgbColor: WHITE } },
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(backgroundColorStyle,textFormat,verticalAlignment)',
      },
    },
    { updateDimensionProperties: { range: { sheetId: sheet, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 36 }, fields: 'pixelSize' } },
    // Header words are what the app reads by: warn before anyone renames one.
    { addProtectedRange: { protectedRange: { range: range(sheet, 0, 1, 0, cols), description: 'Column names the client portal reads by', warningOnly: true } } },
  ];
  const dropdown = (r: ReturnType<typeof range>, values: readonly string[]) => ({
    setDataValidation: {
      range: r,
      rule: { condition: { type: 'ONE_OF_LIST', values: values.map((v) => ({ userEnteredValue: v })) }, strict: true, showCustomUi: true },
    },
  });
  const dateCells = (r: ReturnType<typeof range>) => [
    { setDataValidation: { range: r, rule: { condition: { type: 'DATE_IS_VALID' }, strict: false, showCustomUi: true } } },
    { repeatCell: { range: r, cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'd mmm yyyy' } } }, fields: 'userEnteredFormat.numberFormat' } },
  ];
  const statusColours = (r: ReturnType<typeof range>) =>
    Object.entries(STATUS_COLOURS).map(([word, c]) => ({
      addConditionalFormatRule: {
        index: 0,
        rule: {
          ranges: [r],
          booleanRule: {
            condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: word }] },
            format: {
              ...(c.bg ? { backgroundColorStyle: { rgbColor: hex(c.bg) } } : {}),
              textFormat: { foregroundColorStyle: { rgbColor: hex(c.fg) }, bold: !!c.bg, strikethrough: !!c.strike },
            },
          },
        },
      },
    }));
  const note = (sheet: number, row: number, col: number, text: string) => ({
    updateCells: { range: range(sheet, row, row + 1, col, col + 1), rows: [{ values: [{ note: text }] }], fields: 'note' },
  });
  const steps = PROCESS_STEPS.length;

  await batchUpdateSpreadsheet(id, [
    // Overview
    base(OV, 4),
    ...widths(OV, [170, 360, 28, 600]),
    { repeatCell: { range: range(OV, 0, OVERVIEW_FIELDS.length, 0, 1), cell: { userEnteredFormat: { textFormat: { fontFamily: FONT, bold: true, foregroundColorStyle: { rgbColor: MUTED } } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: range(OV, linksRow, linksRow + 1, 0, 2), cell: { userEnteredFormat: { textFormat: { fontFamily: FONT, bold: true, fontSize: 9, foregroundColorStyle: { rgbColor: MUTED } } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: range(OV, linksRow + 1, linksRow + 1 + OVERVIEW_LINKS.length, 0, 1), cell: { userEnteredFormat: { textFormat: { fontFamily: FONT, bold: true, foregroundColorStyle: { rgbColor: MUTED } } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: range(OV, 0, 1, 3, 4), cell: { userEnteredFormat: { textFormat: { fontFamily: FONT, bold: true, fontSize: 12, foregroundColorStyle: { rgbColor: INK } } } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: range(OV, 1, OVERVIEW_HELP.length, 3, 4), cell: { userEnteredFormat: { backgroundColorStyle: { rgbColor: hex('#F9FAFB') }, textFormat: { fontFamily: FONT, fontSize: 10, foregroundColorStyle: { rgbColor: hex('#374151') } } } }, fields: 'userEnteredFormat(backgroundColorStyle,textFormat)' } },
    ...dateCells(range(OV, OVERVIEW_FIELDS.indexOf('Kickoff date'), OVERVIEW_FIELDS.indexOf('Target launch') + 1, 1, 2)),
    note(OV, OVERVIEW_FIELDS.indexOf('Services'), 1, 'The services this project includes. Delete the stages of the others on the Process tab.'),

    // Process
    base(PR, PROCESS_HEADER.length),
    ...header(PR, PROCESS_HEADER.length),
    ...widths(PR, [44, 130, 300, 100, 160, 120, 220, 340]),
    { repeatCell: { range: range(PR, 1, ROWS, 0, 1), cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', textFormat: { fontFamily: FONT, foregroundColorStyle: { rgbColor: MUTED } } } }, fields: 'userEnteredFormat(horizontalAlignment,textFormat)' } },
    { repeatCell: { range: range(PR, 1, ROWS, 1, 2), cell: { userEnteredFormat: { textFormat: { fontFamily: FONT, bold: true } } }, fields: 'userEnteredFormat.textFormat' } },
    dropdown(range(PR, 1, ROWS, 1, 2), STAGES),
    dropdown(range(PR, 1, ROWS, 3, 4), WHO),
    dropdown(range(PR, 1, ROWS, 4, 5), PROCESS_STATUSES),
    ...dateCells(range(PR, 1, ROWS, 5, 6)),
    ...statusColours(range(PR, 1, ROWS, 4, 5)),
    ...Object.entries(STAGE_TINTS).map(([stage, tint]) => ({
      addConditionalFormatRule: {
        index: 0,
        rule: { ranges: [range(PR, 1, ROWS, 1, 2)], booleanRule: { condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: stage }] }, format: { backgroundColorStyle: { rgbColor: hex(tint) } } } },
      },
    })),
    note(PR, 0, 1, 'Delete the rows of any stage this project does not include.'),
    note(PR, 0, 3, 'ActiveSet, Client or Together. The client sees "You" on their steps.'),
    note(PR, 0, 4, 'Waiting on client = the client’s turn: their feedback, approval or files. The portal shows it as "Waiting on you". Skipped = out of scope; the client never sees it.'),
    note(PR, 0, 5, 'Done: the day it was done. Otherwise: the day it is planned for.'),
    note(PR, 0, 6, 'What the client should open for this step: the moodboard, the Figma file, the staging site.'),
    note(PR, 0, 7, 'One line the client reads on their portal, under the step. Leave blank if not needed.'),

    // Pages
    base(PG, PAGES_HEADER.length),
    ...header(PG, PAGES_HEADER.length),
    ...widths(PG, [220, 150, 150, 150, 240, 280]),
    dropdown(range(PG, 1, ROWS, 1, 4), PAGE_STATUSES),
    ...statusColours(range(PG, 1, ROWS, 1, 4)),
    { repeatCell: { range: range(PG, 1, ROWS, 5, 6), cell: { userEnteredFormat: { textFormat: { fontFamily: FONT, italic: true, foregroundColorStyle: { rgbColor: MUTED } } } }, fields: 'userEnteredFormat.textFormat' } },
    note(PG, 0, 0, 'One row per page. For a brand-only project, delete this tab.'),
    note(PG, 0, 4, 'The staging or live link for the page.'),
    note(PG, 0, 5, 'Only the team sees this column.'),

    // What we need
    base(IN, INPUTS_HEADER.length),
    ...header(IN, INPUTS_HEADER.length),
    ...widths(IN, [260, 320, 130, 130, 240]),
    ...dateCells(range(IN, 1, ROWS, 2, 3)),
    dropdown(range(IN, 1, ROWS, 3, 4), INPUT_STATUSES),
    ...statusColours(range(IN, 1, ROWS, 3, 4)),
    note(IN, 0, 0, 'Everything we are waiting on from the client. Mark each one Received when it arrives.'),
    note(IN, 0, 4, 'Where the client should put it: a Drive folder, a form.'),
  ]);

  // 4. Read it back the way the app will.
  const after = await getSpreadsheetMeta(id);
  const grids = await readTabsWithLinks(id, after.tabs.map((t) => t.title));
  const { data, report } = readProjectSheet(
    after.tabs.map((t) => ({ title: t.title, grid: grids.get(t.title) ?? [] })),
    { locale: after.locale },
  );
  console.log(`Built "${after.title}" (${after.url})`);
  for (const t of report.tabs) console.log(`  ${t.title} → ${t.role}, ${t.rows} rows${t.warnings.length ? ` (${t.warnings.join('; ')})` : ''}`);
  console.log(`  stages: ${(data.timeline?.phases ?? []).map((p) => `${p.title} (${p.milestones.length})`).join(', ')}`);
  console.log(`  ${steps} steps, ${PAGE_ROWS.length} pages, ${INPUT_ROWS.length} inputs`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
