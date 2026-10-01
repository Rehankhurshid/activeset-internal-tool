import { safeHttpUrl } from './client-plan';
import { FIELDS, PRIVATE_HEADER, isFillTab, languageOf, normalizeHeader, planTabs, trackLabelFromHeader, type FieldSpec } from './project-sheet.contract';
import type {
  ProjectSheetData,
  SheetCell,
  SheetChange,
  SheetCheckGroup,
  SheetFillTab,
  SheetGrid,
  SheetInput,
  SheetKind,
  SheetLink,
  SheetMilestone,
  SheetOverview,
  SheetPhase,
  SheetReadResult,
  SheetRedirectSummary,
  SheetSeoSummary,
  SheetTabInput,
  SheetTabOverrides,
  SheetTabReport,
  SheetTrack,
  SheetWorkItem,
  SheetWorkstream,
  WorkState,
} from './project-sheet.types';
import {
  cleanText,
  groupTitle,
  isMonthFirstLocale,
  readChangeState,
  readCheck,
  readDate,
  readOwner,
  readStatus,
  slug,
  tabLabel,
  uniqueIds,
} from './project-sheet.values';

/**
 * Reads a project sheet into {@link ProjectSheetData}, plus a report the team
 * sees in the Client tab. Pure: the server fetches the grids, this decides
 * what they mean.
 *
 * The shapes it copes with all come from real trackers: a merged title and
 * description above the header (Different AI, RevPack), a two-row header
 * ("Planned" over "Page", Muffins), a stats block above the header (House of
 * Haseena), single-cell section rows ("CORE PAGES", "DESIGN AND BRAND"),
 * footnotes under the table, a second table inside a tab (the 301 REDIRECTS
 * block in Different AI's SEO Tags), and a checklist with no header at all
 * (the Project Global Checklist in every older template).
 */

/** How far down a tab the header may sit. */
const HEADER_WINDOW = 15;

const CAPS = {
  phases: 30,
  milestones: 200,
  workstreams: 8,
  items: 500,
  inputs: 200,
  changes: 100,
  checks: 300,
  links: 20,
};

export interface ReadOptions {
  overrides?: SheetTabOverrides;
  /** "Today", for reading year-less dates such as "31 Aug". */
  today?: Date;
  /** The spreadsheet's locale (`en_US`, `en_IN`), which decides how 10/2/2026 reads. */
  locale?: string;
}

// --- Grid helpers -------------------------------------------------------------

function text(row: SheetCell[] | undefined, col: number | undefined): string {
  if (!row || col === undefined) return '';
  return cleanText(row[col]?.v);
}

function filledCols(row: SheetCell[] | undefined): number[] {
  const out: number[] = [];
  (row ?? []).forEach((cell, i) => {
    if (cleanText(cell?.v)) out.push(i);
  });
  return out;
}

function linkOf(cell: SheetCell | undefined): string | undefined {
  if (!cell) return undefined;
  const fromLink = cell.link ? safeHttpUrl(cell.link) : null;
  if (fromLink) return fromLink;
  const raw = cleanText(cell.v, 2000);
  // Only text that is itself an address: "See Lottie tab" is not a link.
  if (!raw || /\s/.test(raw) || !/[./]/.test(raw)) return undefined;
  return safeHttpUrl(raw) ?? undefined;
}

interface HeaderMatch {
  row: number;
  /** field → column. `link` may name several. */
  cols: Map<string, number>;
  links: number[];
  /** Columns whose header names a track ("Copy", "Status – Mobile"). */
  tracks: number[];
  headerText: Map<number, string>;
  score: number;
}

function matchHeader(row: SheetCell[] | undefined, specs: FieldSpec[], rowIndex: number, withTracks: boolean): HeaderMatch | null {
  if (!row) return null;
  const cols = new Map<string, number>();
  const links: number[] = [];
  const tracks: number[] = [];
  const headerText = new Map<number, string>();
  const used = new Set<number>();
  row.forEach((cell, i) => {
    const raw = cleanText(cell?.v, 120);
    if (raw) headerText.set(i, raw);
  });
  // Strong names first across the whole row, then the fallbacks for fields still open.
  for (const weak of [false, true]) {
    for (const [i, raw] of headerText) {
      if (used.has(i)) continue;
      const header = normalizeHeader(raw);
      if (PRIVATE_HEADER.test(header)) continue;
      for (const spec of specs) {
        if (!!spec.weak !== weak || !spec.pattern.test(header)) continue;
        if (spec.field === 'link') {
          links.push(i);
          used.add(i);
          break;
        }
        if (cols.has(spec.field)) continue;
        cols.set(spec.field, i);
        used.add(i);
        break;
      }
    }
  }
  if (withTracks) {
    for (const [i, raw] of headerText) if (!used.has(i) && trackLabelFromHeader(raw)) tracks.push(i);
  }
  links.sort((a, b) => a - b);
  const required = [...new Set(specs.filter((s) => s.required).map((s) => s.field))].every((f) => cols.has(f));
  const score = cols.size + (links.length ? 1 : 0) + tracks.length;
  if (!required || score < 2) return null;
  return { row: rowIndex, cols, links, tracks, headerText, score };
}

function findHeader(grid: SheetGrid, specs: FieldSpec[], from: number, withTracks: boolean): HeaderMatch | null {
  let best: HeaderMatch | null = null;
  for (let r = from; r < Math.min(grid.length, from + HEADER_WINDOW); r++) {
    const match = matchHeader(grid[r], specs, r, withTracks);
    if (match && (!best || match.score > best.score)) best = match;
  }
  return best;
}

/** The kind whose header this row is, if it is one: the start of a second table. */
function headerKindOf(row: SheetCell[] | undefined, rowIndex: number): { kind: Exclude<SheetKind, 'overview'>; match: HeaderMatch } | null {
  let best: { kind: Exclude<SheetKind, 'overview'>; match: HeaderMatch } | null = null;
  for (const kind of Object.keys(FIELDS) as Exclude<SheetKind, 'overview'>[]) {
    const match = matchHeader(row, FIELDS[kind], rowIndex, kind === 'tracker');
    // Two real header words at least, so a data row that happens to say "Page" is not a header.
    if (match && match.cols.size + (match.links.length ? 1 : 0) >= 2 && (!best || match.score > best.match.score)) {
      best = { kind, match };
    }
  }
  return best;
}

interface DataRow {
  index: number;
  cells: SheetCell[];
  group?: string;
}

interface Table {
  header: HeaderMatch;
  rows: DataRow[];
  /** Where a second table starts, if one does. */
  next?: { kind: Exclude<SheetKind, 'overview'>; match: HeaderMatch };
}

/** A footnote rather than a heading: it reads as a sentence. */
function isSentence(value: string): boolean {
  return (/[.!?](\s|$)/.test(value) && value.length > 40) || value.length > 90;
}

/** "CORE PAGES", "SET – 1", "Phase 2:" — a heading, not a page called that. */
function isHeading(value: string): boolean {
  const letters = value.replace(/\s*\(.*\)\s*$/, '').replace(/[^a-z]/gi, '');
  if (letters.length >= 2 && letters === letters.toUpperCase()) return true;
  return /^(set|phase|section|group|stage|part|batch|week|sprint|month)\b/i.test(value) || /:\s*$/.test(value);
}

/**
 * The data rows under a header, with the section each sits in. A one-cell row
 * is a section heading ("CORE PAGES"), a page with nothing filled in yet, a
 * numbered placeholder, or a footnote, which ends the table. A header for
 * another kind of table ends it too, and is handed back so it can be read.
 */
function readTable(grid: SheetGrid, header: HeaderMatch, titleField: string, titlePattern: RegExp): Table {
  const titleCol = header.cols.get(titleField)!;
  const rows: DataRow[] = [];
  let group: string | undefined;
  for (let r = header.row + 1; r < grid.length; r++) {
    const row = grid[r];
    const filled = filledCols(row);
    if (filled.length === 0) continue;

    if (filled.length === 1) {
      const lone = cleanText(row[filled[0]]?.v, 200);
      if (/^\d+(\.0)?$/.test(lone)) continue;
      // In the title column, a sentence is a row with nothing filled in yet ("What is AEO? A guide…")
      // when a row of this table follows straight after it; otherwise it is the footnote under the
      // table (Different AI's Lottie tab puts its footnote in the Animation column).
      if (filled[0] === titleCol && !isHeading(lone) && (!isSentence(lone) || nextRowIsData(grid, r, header, titleCol))) {
        if (!looksLikeHeaderEcho(row, titleCol, titlePattern)) rows.push({ index: r, cells: row, group });
        continue;
      }
      if (isSentence(lone)) break;
      group = groupTitle(lone);
      continue;
    }

    const echo = looksLikeHeaderEcho(row, titleCol, titlePattern);
    if (!echo) {
      const second = headerKindOf(row, r);
      if (second) return { header, rows, next: second };
    }
    if (echo || !text(row, titleCol)) continue;
    // "Total approved", "Grand total": a sum under the table, not a row of it.
    if (/^(sub ?|grand )?totals?( approved| cost| hours| estimate| spend)?:?$/i.test(text(row, titleCol))) continue;
    rows.push({ index: r, cells: row, group });
  }
  return { header, rows };
}

/**
 * Whether the row right after `r` (no blank row between) is a row of this
 * table: its title cell and at least one other column the header named.
 */
function nextRowIsData(grid: SheetGrid, r: number, header: HeaderMatch, titleCol: number): boolean {
  const next = grid[r + 1];
  if (!next || !text(next, titleCol)) return false;
  const others = [...header.cols.values(), ...header.links, ...header.tracks].filter((c) => c !== titleCol);
  return others.length === 0 || others.some((c) => text(next, c));
}

/** The second row of a two-row header ("No. | Page"), repeated header words, and the like. */
function looksLikeHeaderEcho(row: SheetCell[], titleCol: number, titlePattern: RegExp): boolean {
  const title = normalizeHeader(text(row, titleCol));
  return !!title && (titlePattern.test(title) || /^(no\.?|#)$/.test(title));
}

function sampleOf(row: DataRow | undefined, cols: number[]): string | undefined {
  if (!row) return undefined;
  const parts = [...new Set(cols)]
    .map((c) => text(row.cells, c))
    .filter(Boolean)
    .slice(0, 3);
  const out = parts.join(' · ');
  return out ? (out.length > 90 ? `${out.slice(0, 89)}…` : out) : undefined;
}

function headerColumns(header: HeaderMatch, extra: number[] = []): string[] {
  const cols = [...header.cols.values(), ...header.links, ...header.tracks, ...extra].sort((a, b) => a - b);
  return [...new Set(cols)].map((c) => header.headerText.get(c) ?? '').filter(Boolean);
}

/** "Staging link" → "Staging"; "URL Path" → "Page"; "Docs" → "Docs". */
function linkTitle(header: string): string {
  const cleaned = cleanText(header, 40).replace(/\[[^\]]*\]|\([^)]*\)/g, '').trim();
  if (/^url( path)?$/i.test(cleaned)) return 'Page';
  const bare = cleaned.replace(/\s*(link|links|url)$/i, '').trim();
  return bare || 'Link';
}

// --- Context shared across tabs -------------------------------------------------

interface Context {
  today: Date;
  monthFirst: boolean;
  unknown: Set<string>;
  phaseNames: Record<string, string>;
  phaseDates: NonNullable<SheetOverview['phaseDates']>;
}

function date(raw: string, ctx: Context) {
  return readDate(raw, ctx.today, ctx.monthFirst);
}

function status(raw: string, ctx: Context): WorkState {
  const read = readStatus(raw);
  if (read.unknown && raw.trim()) ctx.unknown.add(cleanText(raw, 40));
  return read.state;
}

// --- Overview -------------------------------------------------------------------

const OVERVIEW_LABELS: [keyof Pick<SheetOverview, 'engagement' | 'kickoff' | 'targetLaunch'>, RegExp][] = [
  ['engagement', /^(engagement|scope of work|services?|project type)$/],
  ['kickoff', /^(kickoff|kick-off|kickoff date|kick-off date|start date|project start)$/],
  ['targetLaunch', /^(target launch|launch date|go-?live|go-?live date|target go-?live|target launch date)$/],
];

function readOverview(grid: SheetGrid, ctx: Context): { overview: SheetOverview; report: Partial<SheetTabReport> } {
  const overview: SheetOverview = { links: [], phaseNames: {} };
  const found: string[] = [];

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const label = normalizeHeader(cleanText(row[c]?.v, 80));
      if (!label) continue;

      for (const [field, pattern] of OVERVIEW_LABELS) {
        if (overview[field] !== undefined || !pattern.test(label)) continue;
        let value = '';
        for (let k = c + 1; k < row.length && !value; k++) value = cleanText(row[k]?.v, 200);
        if (!value) continue;
        if (field === 'engagement') overview.engagement = value;
        else overview[field] = date(value, ctx);
        found.push(cleanText(row[c]?.v, 40));
      }

      // KEY LINKS: the cells below, in this column, that carry a link.
      if (label === 'key links' && overview.links.length === 0) {
        for (let k = r + 1; k < grid.length && overview.links.length < CAPS.links; k++) {
          const cell = grid[k]?.[c];
          const name = cleanText(cell?.v, 80);
          if (!name) break;
          const url = linkOf(cell) ?? linkOf(grid[k]?.[c + 1]);
          if (url) overview.links.push({ title: name, url });
        }
        found.push('Key links');
      }

      // PHASES: "1  Foundation and motion direction | 31 Aug | 06 Sep" under Phase | Starts | Ends.
      if (label === 'phase' && /^(starts?|start date)$/.test(normalizeHeader(cleanText(row[c + 1]?.v, 40)))) {
        const hasEnd = /^(ends?|end date|due)$/.test(normalizeHeader(cleanText(row[c + 2]?.v, 40)));
        for (let k = r + 1; k < grid.length; k++) {
          const cell = cleanText(grid[k]?.[c]?.v, 120);
          const named = cell.match(/^(\d+)[\s.:)-]+(.+)$/);
          if (!named) break;
          overview.phaseNames[named[1]] = named[2].trim();
          const start = date(text(grid[k], c + 1), ctx);
          const end = hasEnd ? date(text(grid[k], c + 2), ctx) : undefined;
          if (start?.iso || end?.iso) {
            (overview.phaseDates ??= {})[named[1]] = {
              ...(start?.iso ? { start } : {}),
              ...(end?.iso ? { end } : {}),
            };
          }
        }
        if (Object.keys(overview.phaseNames).length) found.push('Phases');
      }
    }
  }

  ctx.phaseNames = overview.phaseNames;
  ctx.phaseDates = overview.phaseDates ?? {};
  return {
    overview,
    report: {
      rows: found.length,
      columns: [...new Set(found)],
      warnings: found.length === 0 ? ['Found none of: Engagement, Kickoff date, Target launch, KEY LINKS.'] : [],
    },
  };
}

// --- Timeline -------------------------------------------------------------------

function phaseOf(raw: string, group: string | undefined, ctx: Context): { key: string; title: string } {
  const value = raw || group || '';
  if (!value) return { key: '—', title: 'Other milestones' };
  const named = value.match(/^(\d+)[\s.:)-]+(.+)$/);
  if (named) return { key: named[1], title: named[2].trim() };
  if (/^\d+$/.test(value)) return { key: value, title: ctx.phaseNames[value] ?? `Phase ${value}` };
  return { key: value, title: value };
}

function readTimelineTable(table: Table, tab: string, ctx: Context, into: Map<string, SheetPhase>): number {
  const { cols } = table.header;
  let count = 0;
  for (const row of table.rows) {
    if (count >= CAPS.milestones) break;
    const title = text(row.cells, cols.get('title'));
    if (!title) continue;
    const phase = phaseOf(text(row.cells, cols.get('phase')), row.group, ctx);
    let target = into.get(phase.key);
    if (!target) {
      if (into.size >= CAPS.phases) continue;
      target = { key: phase.key, title: phase.title, milestones: [] };
      const dates = ctx.phaseDates[phase.key];
      if (dates?.start) target.start = dates.start;
      if (dates?.end) target.end = dates.end;
      into.set(phase.key, target);
    }
    const milestone: SheetMilestone = {
      id: `${slug(tab)}-${row.index + 1}`,
      title,
      state: cols.has('status') ? status(text(row.cells, cols.get('status')), ctx) : 'not_started',
    };
    const owner = readOwner(text(row.cells, cols.get('owner')));
    if (owner) milestone.owner = owner;
    const start = date(text(row.cells, cols.get('start')), ctx);
    const end = date(text(row.cells, cols.get('end')), ctx);
    if (start) milestone.start = start;
    if (end) milestone.end = end;
    target.milestones.push(milestone);
    count++;
  }
  return count;
}

// --- Tracker --------------------------------------------------------------------

/** Headers that are never a track, whatever their cells say. */
const NOT_A_TRACK = /^(no\.?|#|id|task id|assignee|owner|who|notes?|notes \/ blockers|blockers?|comments?|review comment|priority|size|trigger|loop|hours|person-hours|depends on|evidence.*|done when|why.*|sections.*|placement|proposed placement|revisions.*|indexable|type|lottie on page)$/;

function inferTracks(table: Table, ctx: Context): number[] {
  const { header } = table;
  const taken = new Set<number>([...header.cols.values(), ...header.links, ...header.tracks]);
  const out: number[] = [];
  for (const [col, raw] of header.headerText) {
    if (taken.has(col) || NOT_A_TRACK.test(normalizeHeader(raw))) continue;
    const values = table.rows.map((r) => text(r.cells, col)).filter(Boolean);
    if (values.length < 2) continue;
    const known = values.filter((v) => !readStatus(v).unknown);
    // Yes/No/None columns are flags ("Loop", "Indexable"), not progress.
    const strong = values.some((v) => !/^(yes|no|true|false|none|n\/?a|-)$/i.test(v.trim()) && !readStatus(v).unknown);
    if (strong && known.length / values.length >= 0.7) out.push(col);
  }
  void ctx;
  return out;
}

function overallState(states: WorkState[]): WorkState {
  if (states.length === 0) return 'not_started';
  const live: WorkState[] = states.filter((s) => s !== 'not_needed');
  if (live.length === 0) return 'not_needed';
  if (live.every((s) => s === 'done')) return 'done';
  for (const s of ['changes', 'in_review', 'blocked', 'in_progress'] as WorkState[]) if (live.includes(s)) return s;
  return live.some((s) => s === 'done') ? 'in_progress' : 'not_started';
}

function readTrackerTable(table: Table, tab: string, ctx: Context): { stream: SheetWorkstream; warnings: string[]; extra: number[] } {
  const { header } = table;
  const { cols } = header;
  const inferred = inferTracks(table, ctx);
  const trackCols: number[] = [
    ...(cols.has('status') ? [cols.get('status')!] : []),
    ...header.tracks,
    ...inferred,
  ].sort((a, b) => a - b);
  const tracks: SheetTrack[] = trackCols.map((c) => {
    const raw = header.headerText.get(c) ?? 'Status';
    const label = trackLabelFromHeader(raw) ?? cleanText(raw, 40);
    return { key: slug(label), label };
  });

  const items: SheetWorkItem[] = [];
  for (const row of table.rows) {
    if (items.length >= CAPS.items) break;
    const title = text(row.cells, cols.get('title'));
    if (!title) continue;
    const item: SheetWorkItem = {
      id: `${slug(tab)}-${row.index + 1}`,
      title,
      states: trackCols.map((c) => status(text(row.cells, c), ctx)),
      links: [],
    };
    const group = text(row.cells, cols.get('group')) || row.group;
    if (group) item.group = groupTitle(group);
    const phase = text(row.cells, cols.get('phase'));
    if (phase) item.phaseKey = phaseOf(phase, undefined, ctx).key;
    const target = date(text(row.cells, cols.get('target')), ctx);
    if (target) item.target = target;
    const own = linkOf(row.cells[cols.get('title')!]);
    const links: SheetLink[] = own && row.cells[cols.get('title')!]?.link ? [{ title: 'Open', url: own }] : [];
    for (const c of header.links) {
      const url = linkOf(row.cells[c]);
      if (url && !links.some((l) => l.url === url)) links.push({ title: linkTitle(header.headerText.get(c) ?? ''), url });
    }
    item.links = links.slice(0, 4);
    items.push(item);
  }

  const warnings: string[] = [];
  if (tracks.length === 0) warnings.push('No status columns found, so every row shows as Not started.');
  if (table.rows.length > CAPS.items) warnings.push(`Kept the first ${CAPS.items} rows.`);
  return { stream: { id: slug(tab), title: tabLabel(tab), tracks, items }, warnings, extra: inferred };
}

/** A row's state across its tracks, for filters and counts. */
export function workItemState(item: Pick<SheetWorkItem, 'states'>): WorkState {
  return overallState(item.states);
}

// --- Client inputs --------------------------------------------------------------

function readInputsTable(table: Table, tab: string, ctx: Context, out: SheetInput[]): number {
  const { cols } = table.header;
  let count = 0;
  const decisionsTab = /decision/i.test(tab);
  for (const row of table.rows) {
    if (out.length >= CAPS.inputs) break;
    const title = text(row.cells, cols.get('title'));
    if (!title) continue;
    let state: SheetInput['state'];
    if (cols.has('status')) {
      const s = status(text(row.cells, cols.get('status')), ctx);
      state = s === 'done' ? 'received' : s === 'not_needed' ? 'not_needed' : 'pending';
    } else {
      state = text(row.cells, cols.get('received')) ? 'received' : 'pending';
    }
    const input: SheetInput = {
      id: `${slug(tab)}-${row.index + 1}`,
      title,
      state,
      kind: decisionsTab || /decision/i.test(row.group ?? '') ? 'decision' : 'input',
    };
    const why = text(row.cells, cols.get('why'));
    if (why) input.why = why;
    if (row.group) input.group = groupTitle(row.group);
    const needed = date(text(row.cells, cols.get('neededBy')), ctx);
    if (needed) input.neededBy = needed;
    const owner = text(row.cells, cols.get('owner'));
    if (owner) input.owner = cleanText(owner, 60);
    const linkCol = table.header.links[0];
    const link =
      (linkCol !== undefined ? linkOf(row.cells[linkCol]) : undefined) ??
      (row.cells[cols.get('title')!]?.link ? linkOf(row.cells[cols.get('title')!]) : undefined);
    if (link) input.link = link;
    out.push(input);
    count++;
  }
  return count;
}

// --- Change log -----------------------------------------------------------------

function readChangesTable(table: Table, tab: string, ctx: Context, out: SheetChange[]): number {
  const { cols } = table.header;
  let count = 0;
  for (const row of table.rows) {
    if (out.length >= CAPS.changes) break;
    const title = text(row.cells, cols.get('title'));
    if (!title) continue;
    const change: SheetChange = {
      id: `${slug(tab)}-${row.index + 1}`,
      title,
      state: readChangeState(text(row.cells, cols.get('status'))),
    };
    const ref = text(row.cells, cols.get('ref'));
    if (ref) change.ref = cleanText(ref, 20);
    const raised = date(text(row.cells, cols.get('raised')), ctx);
    if (raised) change.raised = raised;
    const affects = text(row.cells, cols.get('affects'));
    if (affects) change.affects = cleanText(affects, 120);
    const estimate = text(row.cells, cols.get('estimate'));
    if (estimate) change.estimate = cleanText(estimate, 40);
    const days = text(row.cells, cols.get('days'));
    if (days) change.days = cleanText(days, 20);
    out.push(change);
    count++;
  }
  return count;
}

// --- Launch checklist -----------------------------------------------------------

function pushCheck(groups: SheetCheckGroup[], group: string, title: string, done: boolean) {
  let target = groups[groups.length - 1];
  if (!target || target.title !== group) {
    target = { title: group, checks: [] };
    groups.push(target);
  }
  target.checks.push({ title, done });
}

function readLaunchTable(table: Table, groups: SheetCheckGroup[], counted: { n: number }): void {
  const { cols } = table.header;
  for (const row of table.rows) {
    if (counted.n >= CAPS.checks) return;
    const title = text(row.cells, cols.get('title'));
    if (!title) continue;
    const done = readCheck(text(row.cells, cols.get('done')));
    if (done === null) continue;
    pushCheck(groups, row.group ?? 'Checks', cleanText(title, 160), done);
    counted.n++;
  }
}

/**
 * The older "Project Global Checklist": no header, a check in column A, TRUE or
 * FALSE beside it, and one-cell rows ("CONTENT", "POST LAUNCH") between them.
 */
function readHeaderlessChecklist(grid: SheetGrid, groups: SheetCheckGroup[], counted: { n: number }): number {
  let group = 'Checks';
  let rows = 0;
  for (const row of grid) {
    if (counted.n >= CAPS.checks) break;
    const filled = filledCols(row);
    if (filled.length === 0) continue;
    if (filled.length === 1) {
      group = groupTitle(cleanText(row[filled[0]]?.v, 80));
      continue;
    }
    const titleCol = filled[0];
    const markCol = filled.slice(1).find((c) => /^(true|false|yes|no|done|✅|✓|n\/?a)$/i.test(text(row, c)));
    if (markCol === undefined) continue;
    const done = readCheck(text(row, markCol));
    if (done === null) continue;
    pushCheck(groups, group, cleanText(row[titleCol]?.v, 160), done);
    counted.n++;
    rows++;
  }
  return rows;
}

// --- SEO and redirects --------------------------------------------------------

function readSeoTable(table: Table, tab: string): SheetSeoSummary {
  const { cols } = table.header;
  let pages = 0;
  let filled = 0;
  for (const row of table.rows) {
    if (!text(row.cells, cols.get('page'))) continue;
    pages++;
    if (text(row.cells, cols.get('title')) && text(row.cells, cols.get('description'))) filled++;
  }
  const summary: SheetSeoSummary = { tab, pages, filled };
  const language = languageOf(tab);
  if (language) summary.language = language;
  return summary;
}

function readRedirectsTable(table: Table, into: SheetRedirectSummary): number {
  const { cols } = table.header;
  let rows = 0;
  for (const row of table.rows) {
    if (!text(row.cells, cols.get('from'))) continue;
    rows++;
    into.total++;
    if (text(row.cells, cols.get('to'))) into.mapped++;
    if (cols.has('tested') && readCheck(text(row.cells, cols.get('tested')))) into.tested = (into.tested ?? 0) + 1;
  }
  return rows;
}

// --- [Fill this] tabs -----------------------------------------------------------

/** How much of a `[Fill this]` tab nobody taught the reader has been filled: best effort, counts only. */
function countFill(grid: SheetGrid): { filled: number; total: number } | null {
  let headerRow = -1;
  for (let r = 0; r < Math.min(grid.length, 10); r++) {
    if (filledCols(grid[r]).length >= 2) {
      headerRow = r;
      break;
    }
  }
  if (headerRow < 0) return null;
  const headers = grid[headerRow] ?? [];
  const answerCols = headers
    .map((cell, i) => (/fill|paste|client|your|answer|value|code|script/i.test(cell?.v ?? '') ? i : -1))
    .filter((i) => i >= 0);
  let total = 0;
  let filled = 0;
  for (let r = headerRow + 1; r < grid.length; r++) {
    const cols = filledCols(grid[r]);
    if (cols.length === 0) continue;
    total++;
    const done = answerCols.length ? answerCols.every((c) => text(grid[r], c)) : cols.length >= 2;
    if (done) filled++;
  }
  return total > 0 ? { filled, total } : null;
}

// --- The whole sheet ------------------------------------------------------------

const ORDER: Record<string, number> = { overview: 0, timeline: 1 };

/**
 * Every tab, read by what it is. Tabs are read overview-first so phase names on
 * the Overview can name the Timeline's numbered phases; the report keeps the
 * sheet's own tab order.
 */
export function readProjectSheet(tabs: SheetTabInput[], options: ReadOptions = {}): SheetReadResult {
  const ctx: Context = {
    today: options.today ?? new Date(),
    monthFirst: isMonthFirstLocale(options.locale),
    unknown: new Set(),
    phaseNames: {},
    phaseDates: {},
  };
  const plans = planTabs(
    tabs.map((t) => t.title),
    options.overrides,
  );
  const grids = new Map(tabs.map((t) => [t.title, t.grid ?? []]));

  const data: ProjectSheetData = { workstreams: [], inputs: [], changes: [], seo: [], fills: [] };
  const phases = new Map<string, SheetPhase>();
  const checkGroups: SheetCheckGroup[] = [];
  const checksCounted = { n: 0 };
  const redirects: SheetRedirectSummary = { total: 0, mapped: 0 };
  let sawRedirects = false;
  let sawLaunch = false;
  const reports = new Map<string, SheetTabReport>();

  const readOrder = plans
    .map((plan, index) => ({ plan, index }))
    .sort((a, b) => (ORDER[a.plan.role] ?? 2) - (ORDER[b.plan.role] ?? 2) || a.index - b.index);

  for (const { plan } of readOrder) {
    const report: SheetTabReport = { title: plan.title, role: plan.role, how: plan.how, rows: 0, columns: [], warnings: [] };
    reports.set(plan.title, report);
    if (plan.role === 'ignored') continue;
    const grid = grids.get(plan.title) ?? [];
    if (grid.length === 0) {
      report.warnings.push('The tab is empty.');
      continue;
    }

    if (plan.role === 'overview') {
      const read = readOverview(grid, ctx);
      data.overview = read.overview;
      Object.assign(report, read.report);
      continue;
    }

    if (plan.role === 'fill') {
      const counts = countFill(grid);
      const fill: SheetFillTab = { tab: plan.title, label: tabLabel(plan.title) };
      if (counts) Object.assign(fill, counts);
      data.fills.push(fill);
      report.rows = counts?.total ?? 0;
      continue;
    }

    // A table kind. The headerless checklist is the one shape without a header.
    const kind = plan.role;
    const header = findHeader(grid, FIELDS[kind], 0, kind === 'tracker');
    if (!header) {
      if (kind === 'launch') {
        sawLaunch = true;
        report.rows = readHeaderlessChecklist(grid, checkGroups, checksCounted);
        if (report.rows === 0) report.warnings.push('No checks with a TRUE/FALSE or Yes/No beside them.');
        else report.columns = ['Check', 'TRUE / FALSE'];
        continue;
      }
      report.warnings.push(`No header row in the first ${HEADER_WINDOW} rows. Expected a column like "${expectedHeader(kind)}".`);
      continue;
    }

    report.headerRow = header.row + 1;
    let table: Table | undefined = readTable(grid, header, titleFieldOf(kind), titlePatternOf(kind));
    let tableKind: Exclude<SheetKind, 'overview'> = kind;
    let first = true;
    // One tab can hold more than one table: SEO tags, then a 301 REDIRECTS block.
    while (table) {
      const n = readOne(tableKind, table, plan.title, first);
      if (first) {
        report.rows += n.rows;
        report.columns = headerColumns(table.header, n.extra);
        report.sample = sampleOf(table.rows[0], [table.header.cols.get(titleFieldOf(tableKind))!, ...[...table.header.cols.values()]]);
        report.warnings.push(...n.warnings);
      } else if (n.rows > 0) {
        report.warnings.push(`Also read ${n.rows} ${KIND_NOUN[tableKind]} from a second table in this tab.`);
      }
      first = false;
      if (!table.next) break;
      tableKind = table.next.kind;
      table = readTable(grid, table.next.match, titleFieldOf(tableKind), titlePatternOf(tableKind));
    }
    if (report.rows === 0) report.warnings.push('No rows under the header yet.');
  }

  function readOne(kind: Exclude<SheetKind, 'overview'>, table: Table, tab: string, primary: boolean): { rows: number; warnings: string[]; extra: number[] } {
    switch (kind) {
      case 'timeline':
        return { rows: readTimelineTable(table, tab, ctx, phases), warnings: [], extra: [] };
      case 'tracker': {
        if (data.workstreams.length >= CAPS.workstreams) return { rows: 0, warnings: ['Too many trackers; this one was skipped.'], extra: [] };
        const read = readTrackerTable(table, primary ? tab : `${tab} (table ${data.workstreams.length + 1})`, ctx);
        if (read.stream.items.length) data.workstreams.push(read.stream);
        return { rows: read.stream.items.length, warnings: read.warnings, extra: read.extra };
      }
      case 'inputs':
        return { rows: readInputsTable(table, tab, ctx, data.inputs), warnings: [], extra: [] };
      case 'changes':
        return { rows: readChangesTable(table, tab, ctx, data.changes), warnings: [], extra: [] };
      case 'launch': {
        sawLaunch = true;
        const before = checksCounted.n;
        readLaunchTable(table, checkGroups, checksCounted);
        return { rows: checksCounted.n - before, warnings: [], extra: [] };
      }
      case 'seo': {
        const summary = readSeoTable(table, tab);
        if (summary.pages) data.seo.push(summary);
        return { rows: summary.pages, warnings: [], extra: [] };
      }
      case 'redirects':
        sawRedirects = true;
        return { rows: readRedirectsTable(table, redirects), warnings: [], extra: [] };
    }
  }

  // `[Fill this]` on a tab the reader understands: the ask goes on top of the data.
  for (const plan of plans) {
    if (plan.role === 'fill' || plan.role === 'ignored' || !isFillTab(plan.title)) continue;
    const fill: SheetFillTab = { tab: plan.title, label: tabLabel(plan.title) };
    const seo = data.seo.find((s) => s.tab === plan.title);
    if (seo) Object.assign(fill, { filled: seo.filled, total: seo.pages });
    data.fills.push(fill);
  }

  // Two tabs that slug alike ("Pages", "pages") must not share an id.
  uniqueIds(data.workstreams, (w) => w.id).forEach((id, i) => {
    data.workstreams[i].id = id;
  });

  if (phases.size) data.timeline = { phases: [...phases.values()].filter((p) => p.milestones.length > 0) };
  if (sawLaunch && checkGroups.length) data.launch = { groups: checkGroups };
  if (sawRedirects && redirects.total > 0) data.redirects = redirects;

  return {
    data,
    report: {
      tabs: plans.map((p) => reports.get(p.title)!),
      unknownStatuses: [...ctx.unknown].slice(0, 20),
    },
  };
}

const KIND_NOUN: Record<Exclude<SheetKind, 'overview'>, string> = {
  timeline: 'milestones',
  tracker: 'rows',
  inputs: 'inputs',
  changes: 'changes',
  launch: 'checks',
  seo: 'pages',
  redirects: 'redirects',
};

function titleFieldOf(kind: Exclude<SheetKind, 'overview'>): string {
  return kind === 'seo' ? 'page' : kind === 'redirects' ? 'from' : 'title';
}

function titlePatternOf(kind: Exclude<SheetKind, 'overview'>): RegExp {
  return FIELDS[kind].find((f) => f.field === titleFieldOf(kind))!.pattern;
}

function expectedHeader(kind: Exclude<SheetKind, 'overview'>): string {
  return {
    timeline: 'Milestone',
    tracker: 'Page, Task or Deliverable',
    inputs: 'Input needed',
    changes: 'Description',
    launch: 'Check',
    seo: 'Page',
    redirects: 'Old path',
  }[kind];
}
