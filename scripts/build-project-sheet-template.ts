/**
 * Builds the ActiveSet project sheet into a Google Sheet.
 *
 *   npm run sheet:template -- <sheet>                      the template, into an empty sheet
 *   npm run sheet:template -- <sheet> --rebuild            restyle a sheet that has only the four tabs (the master), same link
 *   npm run sheet:template -- <sheet> --content <file>     a real project's sheet, from a JSON file of its rows
 *
 * The app's service account cannot create files (Google gives it no Drive
 * storage), so make the sheet in Drive first and share it with the service
 * account as an Editor. The script never touches a sheet that holds tabs it
 * does not own: it refuses an existing template tab, and --rebuild refuses a
 * sheet with any other tab. Once built, a sheet is the team's; the master is
 * changed in Sheets or rebuilt here.
 *
 * Look: Funnel Display for headings and labels, Funnel Sans for everything
 * else, a dark header, no gridlines, one colour per stage, one colour per
 * status, and three row states on Process (the step we are on, the steps
 * waiting on the client, the steps done). The format itself is in
 * src/modules/client-portal/domain/project-sheet.template.ts.
 */
import '@/lib/load-env';
import { readFileSync } from 'node:fs';
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

// --- What goes in -------------------------------------------------------------

export interface SheetContent {
  /** Shown in the Overview title: the client's name, or "Project overview" for the master. */
  title: string;
  overview: Partial<Record<(typeof OVERVIEW_FIELDS)[number], string>>;
  links: { name: string; url?: string }[];
  process: { stage: string; step: string; who: string; status?: string; date?: string; link?: string; note?: string }[];
  pages: { page: string; copy?: string; design?: string; development?: string; link?: string; notes?: string }[];
  inputs: { item: string; why?: string; neededBy?: string; status?: string; link?: string }[];
}

const TEMPLATE_CONTENT: SheetContent = {
  title: 'Project overview',
  overview: { Services: 'Copy, Brand Design, Web Design, Development' },
  links: OVERVIEW_LINKS.map((name) => ({ name })),
  process: PROCESS_STEPS.map((s) => ({ stage: s.stage, step: s.step, who: s.who })),
  pages: PAGE_ROWS.map((page) => ({ page })),
  inputs: INPUT_ROWS.map((r) => ({ item: r.item, why: r.why })),
};

// --- The look -----------------------------------------------------------------

type Rgb = { red: number; green: number; blue: number };
function hex(value: string): Rgb {
  const n = parseInt(value.replace('#', ''), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}

const DISPLAY = 'Funnel Display';
const BODY = 'Funnel Sans';

const C = {
  ink: '#0F172A',
  body: '#1E293B',
  muted: '#64748B',
  faint: '#94A3B8',
  line: '#E2E8F0',
  header: '#0F172A',
  white: '#FFFFFF',
  panel: '#F8FAFC',
  link: '#2563EB',
};

/** One colour per stage: a soft fill with a deep text of the same hue. */
const STAGE_COLOURS: Record<string, { bg: string; fg: string }> = {
  Kickoff: { bg: '#E2E8F0', fg: '#334155' },
  Copy: { bg: '#FCE7F3', fg: '#9D174D' },
  'Brand Design': { bg: '#EDE9FE', fg: '#5B21B6' },
  'Web Design': { bg: '#E0F2FE', fg: '#075985' },
  Development: { bg: '#E0E7FF', fg: '#3730A3' },
  Launch: { bg: '#FFEDD5', fg: '#9A3412' },
  Handover: { bg: '#D1FAE5', fg: '#065F46' },
};

/** One colour per status, the same on every tab. */
const STATUS_COLOURS: Record<string, { bg: string; fg: string; strike?: boolean }> = {
  'Not started': { bg: '#F1F5F9', fg: '#64748B' },
  'In progress': { bg: '#DBEAFE', fg: '#1D4ED8' },
  'Waiting on client': { bg: '#FEF3C7', fg: '#B45309' },
  Done: { bg: '#DCFCE7', fg: '#15803D' },
  Skipped: { bg: '#F8FAFC', fg: '#94A3B8', strike: true },
  'Not needed': { bg: '#F8FAFC', fg: '#94A3B8' },
  Waiting: { bg: '#FEF3C7', fg: '#B45309' },
  Received: { bg: '#DCFCE7', fg: '#15803D' },
};

/** Who does the step: the client's steps stand out. */
const WHO_COLOURS: Record<string, string> = { ActiveSet: '#475569', Client: '#B45309', Together: '#6D28D9' };

const ROWS = 300;

// --- Requests -----------------------------------------------------------------

type Range = { sheetId: number; startRowIndex: number; endRowIndex: number; startColumnIndex: number; endColumnIndex: number };
const range = (sheetId: number, r0: number, r1: number, c0: number, c1: number): Range => ({
  sheetId,
  startRowIndex: r0,
  endRowIndex: r1,
  startColumnIndex: c0,
  endColumnIndex: c1,
});

function text(r: Range, format: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const fields = ['textFormat', ...Object.keys(extra)].join(',');
  return {
    repeatCell: {
      range: r,
      cell: { userEnteredFormat: { textFormat: format, ...extra } },
      fields: `userEnteredFormat(${fields})`,
    },
  };
}
const font = (family: string, size: number, colour: string, more: Record<string, unknown> = {}) => ({
  fontFamily: family,
  fontSize: size,
  foregroundColorStyle: { rgbColor: hex(colour) },
  ...more,
});
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
    cell: {
      userEnteredFormat: {
        textFormat: font(BODY, 10, C.body),
        verticalAlignment: 'MIDDLE',
        wrapStrategy: 'WRAP',
        padding: { top: 6, bottom: 6, left: 10, right: 10 },
      },
    },
    fields: 'userEnteredFormat(textFormat,verticalAlignment,wrapStrategy,padding)',
  },
});
const rowLines = (sheetId: number, r0: number, cols: number) => ({
  updateBorders: {
    range: range(sheetId, r0, ROWS, 0, cols),
    innerHorizontal: { style: 'SOLID', colorStyle: { rgbColor: hex(C.line) } },
    bottom: { style: 'SOLID', colorStyle: { rgbColor: hex(C.line) } },
  },
});
function header(sheetId: number, cols: number) {
  return [
    {
      repeatCell: {
        range: range(sheetId, 0, 1, 0, cols),
        cell: {
          userEnteredFormat: {
            backgroundColorStyle: { rgbColor: hex(C.header) },
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
    // The words in this row are what the client portal reads by: warn before anyone renames one.
    { addProtectedRange: { protectedRange: { range: range(sheetId, 0, 1, 0, cols), description: 'Column names the client portal reads by', warningOnly: true } } },
  ];
}
/** Centres a column's header over its centred cells (the status columns). */
const centreHeader = (sheetId: number, c0: number, c1: number) => ({
  repeatCell: { range: range(sheetId, 0, 1, c0, c1), cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat.horizontalAlignment' },
});
const dropdown = (r: Range, values: readonly string[]) => ({
  setDataValidation: { range: r, rule: { condition: { type: 'ONE_OF_LIST', values: values.map((v) => ({ userEnteredValue: v })) }, strict: true, showCustomUi: true } },
});
const dateCells = (r: Range) => [
  { setDataValidation: { range: r, rule: { condition: { type: 'DATE_IS_VALID' }, strict: false, showCustomUi: true } } },
  { repeatCell: { range: r, cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'd mmm yyyy' } } }, fields: 'userEnteredFormat.numberFormat' } },
];
/** A conditional format. Added later = higher priority, and only the first match colours a cell. */
const rule = (r: Range, condition: Record<string, unknown>, format: Record<string, unknown>) => ({
  addConditionalFormatRule: { index: 0, rule: { ranges: [r], booleanRule: { condition, format } } },
});
const textEq = (word: string) => ({ type: 'TEXT_EQ', values: [{ userEnteredValue: word }] });
const formula = (f: string) => ({ type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: f }] });
const chips = (r: Range, words: Record<string, { bg: string; fg: string; strike?: boolean }>) =>
  Object.entries(words).map(([word, c]) =>
    rule(r, textEq(word), {
      backgroundColorStyle: { rgbColor: hex(c.bg) },
      textFormat: { foregroundColorStyle: { rgbColor: hex(c.fg) }, bold: true, strikethrough: !!c.strike },
    }),
  );
const note = (sheetId: number, row: number, col: number, body: string) => ({
  updateCells: { range: range(sheetId, row, row + 1, col, col + 1), rows: [{ values: [{ note: body }] }], fields: 'note' },
});

// --- Building -----------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const rebuild = args.includes('--rebuild');
  const contentPath = args.includes('--content') ? args[args.indexOf('--content') + 1] : null;
  const id = parseSpreadsheetId(args.find((a) => !a.startsWith('--') && a !== contentPath) ?? '');
  if (!id) {
    console.error('Usage: npm run sheet:template -- <sheet link> [--rebuild | --content <file.json>]');
    process.exit(1);
  }
  const content: SheetContent = contentPath ? JSON.parse(readFileSync(contentPath, 'utf8')) : TEMPLATE_CONTENT;

  let meta = await getSpreadsheetMeta(id);
  const ours = (Object.values(TEMPLATE_TABS) as string[]);
  if (rebuild) {
    const strangers = meta.tabs.filter((t) => !ours.includes(t.title));
    if (strangers.length) {
      console.error(`--rebuild only restyles a sheet with just the four template tabs; "${meta.title}" also has ${strangers.map((t) => `"${t.title}"`).join(', ')}.`);
      process.exit(1);
    }
    // A sheet must keep one tab, so park a blank one while the four are rebuilt.
    await batchUpdateSpreadsheet(id, [
      { addSheet: { properties: { title: '_rebuilding' } } },
      ...meta.tabs.map((t) => ({ deleteSheet: { sheetId: t.sheetId } })),
    ]);
    meta = await getSpreadsheetMeta(id);
  } else {
    const clash = meta.tabs.filter((t) => ours.includes(t.title));
    if (clash.length) {
      console.error(`"${meta.title}" already has ${clash.map((t) => `"${t.title}"`).join(', ')}. Use an empty sheet, or --rebuild for the master.`);
      process.exit(1);
    }
  }

  // 1. The four tabs, then remove whatever the sheet started with.
  const tabs = [
    { title: TEMPLATE_TABS.overview, colour: '#475569', cols: 4, frozen: 0 },
    { title: TEMPLATE_TABS.process, colour: '#7C3AED', cols: PROCESS_HEADER.length, frozen: 1 },
    { title: TEMPLATE_TABS.pages, colour: '#0284C7', cols: PAGES_HEADER.length, frozen: 1 },
    { title: TEMPLATE_TABS.inputs, colour: '#D97706', cols: INPUTS_HEADER.length, frozen: 1 },
  ];
  const added = await batchUpdateSpreadsheet(id, [
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

  // 2. The content. Overview: a title, the fields, KEY LINKS, and the help beside them.
  const FIELD_ROW = 2; // 0-based: title, a gap, then the fields
  const linksRow = FIELD_ROW + OVERVIEW_FIELDS.length + 1;
  const steps = content.process.length;
  await writeRanges(id, [
    {
      tab: TEMPLATE_TABS.overview,
      rows: [
        [content.title],
        [''],
        ...OVERVIEW_FIELDS.map((f) => [f, content.overview[f] ?? '']),
        [''],
        ['KEY LINKS'],
        ...content.links.map((l) => [l.name, l.url ?? '']),
      ],
    },
    { tab: TEMPLATE_TABS.overview, start: `D${FIELD_ROW + 1}`, rows: OVERVIEW_HELP.map((line) => [line]) },
    {
      tab: TEMPLATE_TABS.process,
      rows: [
        [...PROCESS_HEADER],
        ...content.process.map((s) => ['=ROW()-1', s.stage, s.step, s.who, s.status ?? 'Not started', s.date ?? '', s.link ?? '', s.note ?? '']),
      ],
    },
    {
      tab: TEMPLATE_TABS.pages,
      rows: [
        [...PAGES_HEADER],
        ...content.pages.map((p) => [p.page, p.copy ?? 'Not started', p.design ?? 'Not started', p.development ?? 'Not started', p.link ?? '', p.notes ?? '']),
      ],
    },
    {
      tab: TEMPLATE_TABS.inputs,
      rows: [[...INPUTS_HEADER], ...content.inputs.map((r) => [r.item, r.why ?? '', r.neededBy ?? '', r.status ?? 'Waiting', r.link ?? ''])],
    },
  ]);

  // 3. The look.
  const all = (sheet: number, c0: number, c1: number) => range(sheet, 1, ROWS, c0, c1);
  const P = { num: 0, stage: 1, step: 2, who: 3, status: 4, date: 5, link: 6, note: 7 };
  await batchUpdateSpreadsheet(id, [
    // ---- Overview: a card of facts on the left, how the sheet works on the right.
    base(OV, 4),
    ...widths(OV, [170, 460, 32, 560]),
    // The title spans the facts column, on one line.
    { mergeCells: { range: range(OV, 0, 1, 0, 2), mergeType: 'MERGE_ALL' } },
    text(range(OV, 0, 1, 0, 2), font(DISPLAY, 22, C.ink, { bold: true }), { wrapStrategy: 'OVERFLOW_CELL', verticalAlignment: 'BOTTOM' }),
    rowHeight(OV, 0, 1, 56),
    rowHeight(OV, 1, 2, 14),
    text(range(OV, FIELD_ROW, FIELD_ROW + OVERVIEW_FIELDS.length, 0, 1), font(DISPLAY, 9, C.muted, { bold: true })),
    text(range(OV, FIELD_ROW, FIELD_ROW + OVERVIEW_FIELDS.length, 1, 2), font(DISPLAY, 11, C.ink), { horizontalAlignment: 'LEFT' }),
    fill(range(OV, FIELD_ROW, FIELD_ROW + OVERVIEW_FIELDS.length, 1, 2), C.panel),
    {
      updateBorders: {
        range: range(OV, FIELD_ROW, FIELD_ROW + OVERVIEW_FIELDS.length, 0, 2),
        innerHorizontal: { style: 'SOLID', colorStyle: { rgbColor: hex(C.line) } },
        top: { style: 'SOLID', colorStyle: { rgbColor: hex(C.line) } },
        bottom: { style: 'SOLID', colorStyle: { rgbColor: hex(C.line) } },
      },
    },
    text(range(OV, linksRow, linksRow + 1, 0, 2), font(DISPLAY, 9, C.muted, { bold: true })),
    text(range(OV, linksRow + 1, linksRow + 1 + content.links.length, 0, 1), font(DISPLAY, 10, C.body, { bold: true })),
    text(range(OV, linksRow + 1, linksRow + 1 + content.links.length, 1, 2), font(BODY, 10, C.link, { underline: true })),
    fill(range(OV, linksRow + 1, linksRow + 1 + content.links.length, 1, 2), C.panel),
    {
      updateBorders: {
        range: range(OV, linksRow + 1, linksRow + 1 + content.links.length, 0, 2),
        innerHorizontal: { style: 'SOLID', colorStyle: { rgbColor: hex(C.line) } },
        top: { style: 'SOLID', colorStyle: { rgbColor: hex(C.line) } },
        bottom: { style: 'SOLID', colorStyle: { rgbColor: hex(C.line) } },
      },
    },
    text(range(OV, FIELD_ROW, FIELD_ROW + 1, 3, 4), font(DISPLAY, 13, C.ink, { bold: true })),
    text(range(OV, FIELD_ROW + 1, FIELD_ROW + OVERVIEW_HELP.length, 3, 4), font(BODY, 10, '#334155')),
    fill(range(OV, FIELD_ROW, FIELD_ROW + OVERVIEW_HELP.length, 3, 4), '#F5F3FF'),
    ...dateCells(range(OV, FIELD_ROW + OVERVIEW_FIELDS.indexOf('Kickoff date'), FIELD_ROW + OVERVIEW_FIELDS.indexOf('Target launch') + 1, 1, 2)),
    note(OV, FIELD_ROW + OVERVIEW_FIELDS.indexOf('Services'), 1, 'The services this project includes. Delete the stages of the others on the Process tab.'),
    // Facts and help share rows; let each row be as tall as its longest wrapped line.
    { autoResizeDimensions: { dimensions: { sheetId: OV, dimension: 'ROWS', startIndex: FIELD_ROW, endIndex: linksRow + 1 + content.links.length } } },

    // ---- Process
    base(PR, PROCESS_HEADER.length),
    ...header(PR, PROCESS_HEADER.length),
    ...widths(PR, [48, 140, 380, 110, 170, 120, 220, 340]),
    rowLines(PR, 1, PROCESS_HEADER.length),
    text(all(PR, P.num, P.num + 1), font(DISPLAY, 10, C.faint), { horizontalAlignment: 'CENTER' }),
    centreHeader(PR, P.num, P.num + 1),
    centreHeader(PR, P.status, P.status + 1),
    text(all(PR, P.stage, P.stage + 1), font(DISPLAY, 10, C.body, { bold: true })),
    text(all(PR, P.step, P.step + 1), font(BODY, 11, C.ink)),
    text(all(PR, P.who, P.who + 1), font(DISPLAY, 10, C.muted, { bold: true })),
    text(all(PR, P.status, P.status + 1), font(DISPLAY, 10, C.muted, { bold: true }), { horizontalAlignment: 'CENTER' }),
    text(all(PR, P.date, P.date + 1), font(BODY, 10, C.muted)),
    text(all(PR, P.link, P.link + 1), font(BODY, 10, C.link, { underline: true })),
    text(all(PR, P.note, P.note + 1), font(BODY, 10, C.muted, { italic: true })),
    dropdown(all(PR, P.stage, P.stage + 1), STAGES),
    dropdown(all(PR, P.who, P.who + 1), WHO),
    dropdown(all(PR, P.status, P.status + 1), PROCESS_STATUSES),
    ...dateCells(all(PR, P.date, P.date + 1)),
    // Row states, lowest priority first: done rows fade, the client's turn glows, the step we are on stands out.
    rule(range(PR, 1, ROWS, 0, PROCESS_HEADER.length), formula('=$E2="Done"'), { textFormat: { foregroundColorStyle: { rgbColor: hex(C.faint) } } }),
    rule(range(PR, 1, ROWS, 0, PROCESS_HEADER.length), formula('=$E2="Waiting on client"'), { backgroundColorStyle: { rgbColor: hex('#FFFBEB') } }),
    rule(
      range(PR, 1, ROWS, 0, PROCESS_HEADER.length),
      formula('=AND($C2<>"",$E2<>"Done",$E2<>"Skipped",COUNTIFS($C$2:$C2,"<>",$E$2:$E2,"<>Done",$E$2:$E2,"<>Skipped")=1)'),
      { backgroundColorStyle: { rgbColor: hex('#EEF2FF') }, textFormat: { bold: true } },
    ),
    // Cell colours win over row states: who, stage and status keep theirs on every row.
    ...Object.entries(WHO_COLOURS).map(([who, colour]) => rule(all(PR, P.who, P.who + 1), textEq(who), { textFormat: { foregroundColorStyle: { rgbColor: hex(colour) }, bold: true } })),
    ...Object.entries(STAGE_COLOURS).map(([stage, c]) =>
      rule(all(PR, P.stage, P.stage + 1), textEq(stage), { backgroundColorStyle: { rgbColor: hex(c.bg) }, textFormat: { foregroundColorStyle: { rgbColor: hex(c.fg) }, bold: true } }),
    ),
    ...chips(all(PR, P.status, P.status + 1), STATUS_COLOURS),
    note(PR, 0, P.stage, 'Delete the rows of any stage this project does not include.'),
    note(PR, 0, P.who, 'ActiveSet, Client or Together. The client sees "You" on their steps.'),
    note(PR, 0, P.status, 'Waiting on client = the client’s turn: their feedback, approval or files. The portal shows it as "Waiting on you". Skipped = out of scope; the client never sees it.'),
    note(PR, 0, P.date, 'Done: the day it was done. Otherwise: the day it is planned for.'),
    note(PR, 0, P.link, 'What the client should open for this step: the moodboard, the Figma file, the staging site.'),
    note(PR, 0, P.note, 'One line the client reads on their portal, under the step. Leave blank if not needed.'),

    // ---- Pages
    base(PG, PAGES_HEADER.length),
    ...header(PG, PAGES_HEADER.length),
    ...widths(PG, [280, 150, 150, 150, 240, 300]),
    rowLines(PG, 1, PAGES_HEADER.length),
    text(all(PG, 0, 1), font(DISPLAY, 11, C.ink, { bold: true })),
    text(all(PG, 1, 4), font(DISPLAY, 10, C.muted, { bold: true }), { horizontalAlignment: 'CENTER' }),
    centreHeader(PG, 1, 4),
    text(all(PG, 4, 5), font(BODY, 10, C.link, { underline: true })),
    text(all(PG, 5, 6), font(BODY, 10, C.muted, { italic: true })),
    dropdown(all(PG, 1, 4), PAGE_STATUSES),
    rule(range(PG, 1, ROWS, 0, PAGES_HEADER.length), formula('=AND($A2<>"",$B2="Done",$C2="Done",$D2="Done")'), { backgroundColorStyle: { rgbColor: hex('#F0FDF4') } }),
    ...chips(all(PG, 1, 4), STATUS_COLOURS),
    note(PG, 0, 0, 'One row per page. For a brand-only project, delete this tab.'),
    note(PG, 0, 4, 'The staging or live link for the page.'),
    note(PG, 0, 5, 'Only the team sees this column.'),

    // ---- What we need
    base(IN, INPUTS_HEADER.length),
    ...header(IN, INPUTS_HEADER.length),
    ...widths(IN, [360, 380, 130, 140, 240]),
    rowLines(IN, 1, INPUTS_HEADER.length),
    text(all(IN, 0, 1), font(DISPLAY, 11, C.ink, { bold: true })),
    text(all(IN, 1, 2), font(BODY, 10, C.muted)),
    text(all(IN, 2, 3), font(BODY, 10, C.body)),
    text(all(IN, 3, 4), font(DISPLAY, 10, C.muted, { bold: true }), { horizontalAlignment: 'CENTER' }),
    centreHeader(IN, 3, 4),
    text(all(IN, 4, 5), font(BODY, 10, C.link, { underline: true })),
    ...dateCells(all(IN, 2, 3)),
    dropdown(all(IN, 3, 4), INPUT_STATUSES),
    // Overdue: still waiting after the day we needed it.
    rule(range(IN, 1, ROWS, 0, INPUTS_HEADER.length), formula('=AND($D2="Waiting",ISNUMBER($C2),$C2<TODAY())'), {
      backgroundColorStyle: { rgbColor: hex('#FEF2F2') },
      textFormat: { foregroundColorStyle: { rgbColor: hex('#991B1B') } },
    }),
    rule(range(IN, 1, ROWS, 0, INPUTS_HEADER.length), formula('=$D2="Received"'), { textFormat: { foregroundColorStyle: { rgbColor: hex(C.faint) } } }),
    ...chips(all(IN, 3, 4), STATUS_COLOURS),
    note(IN, 0, 0, 'Everything we are waiting on from the client. Mark each one Received when it arrives. Rows turn red once they are overdue.'),
    note(IN, 0, 4, 'Where the client should put it: a Drive folder, a form.'),

    // Last: rows with content grow to fit their wrapped text; empty rows keep the even 34px rhythm.
    ...[
      [PR, content.process.length],
      [PG, content.pages.length],
      [IN, content.inputs.length],
    ].map(([sheet, n]) => ({ autoResizeDimensions: { dimensions: { sheetId: sheet, dimension: 'ROWS', startIndex: 1, endIndex: 1 + n } } })),
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
  console.log(`  ${steps} steps, ${content.pages.length} pages, ${content.inputs.length} inputs; unknown status words: ${report.unknownStatuses.join(', ') || 'none'}`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
