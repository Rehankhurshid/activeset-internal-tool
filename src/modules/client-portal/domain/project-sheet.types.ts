/**
 * The project sheet: the Google Sheet each project runs out of, read by the app
 * and shown to the client through the portal.
 *
 * Rehan's calls, 2026-10-01 (docs/plans/project-sheet-contract.md): the team
 * writes the sheet and the app only reads it; five kinds of tab are common to
 * every project, use cases add a few more, and anything else is ignored. These
 * types are the normalised shape the reader produces. They carry only what the
 * portal may show: notes, assignees and money columns are never read, so they
 * cannot leak from here.
 */

/** The kinds of tab the reader understands. */
export type SheetKind = 'overview' | 'timeline' | 'tracker' | 'inputs' | 'changes' | 'launch' | 'seo' | 'redirects';

/**
 * What the reader does with a tab: read it as one of the kinds, count it as a
 * `[Fill this]` ask for the client, or leave it alone.
 */
export type SheetTabRole = SheetKind | 'fill' | 'ignored';

/** The one status legend every tab is read into. Taken from the Different AI tracker's legend. */
export type WorkState = 'not_started' | 'in_progress' | 'in_review' | 'changes' | 'done' | 'blocked' | 'not_needed';

/** A cell as the Sheets API returns it: the formatted text, and the link on it, if any. */
export interface SheetCell {
  v: string;
  link?: string;
}

export type SheetGrid = SheetCell[][];

/** A tab handed to the reader. */
export interface SheetTabInput {
  title: string;
  grid: SheetGrid;
}

/** A date as written in the sheet: ISO when it could be read, otherwise the words ("Day 1"). */
export interface SheetDate {
  iso?: string;
  text?: string;
}

export interface SheetLink {
  title: string;
  /** Always http(s). */
  url: string;
}

// --- Per-kind data ----------------------------------------------------------

export interface SheetOverview {
  engagement?: string;
  kickoff?: SheetDate;
  targetLaunch?: SheetDate;
  /** The KEY LINKS block. */
  links: SheetLink[];
  /** Phase number → name, from a PHASES block ("1  Foundation" → { '1': 'Foundation' }). */
  phaseNames: Record<string, string>;
  /** Phase number → its dates, from the same block: used when the Timeline's own rows have none. */
  phaseDates?: Record<string, { start?: SheetDate; end?: SheetDate }>;
}

/** Whose step a milestone is. Names are never kept. */
export type SheetOwner = 'client' | 'team' | 'both';

export interface SheetMilestone {
  id: string;
  title: string;
  state: WorkState;
  owner?: SheetOwner;
  start?: SheetDate;
  end?: SheetDate;
  /** The thing to look at for this step (the moodboard, the staging site). Always http(s). */
  link?: string;
  /** From a column headed for the client ("Note for client") only. */
  note?: string;
}

export interface SheetPhase {
  /** The phase as written ("1", "Week 2", "Discovery"); stable across syncs while the text stays. */
  key: string;
  title: string;
  /** The phase's own dates, from the Overview's PHASES block, for when its milestones carry none. */
  start?: SheetDate;
  end?: SheetDate;
  milestones: SheetMilestone[];
}

export interface SheetTimeline {
  phases: SheetPhase[];
}

export interface SheetTrack {
  key: string;
  label: string;
}

export interface SheetWorkItem {
  id: string;
  title: string;
  group?: string;
  /** The Phase column, as written; ties the row to a Timeline phase. */
  phaseKey?: string;
  /** One state per track, in the workstream's track order. */
  states: WorkState[];
  target?: SheetDate;
  links: SheetLink[];
}

/** One tracker tab: pages, deliverables, tasks, requests, animations. */
export interface SheetWorkstream {
  id: string;
  /** The tab's title, without "[Fill this]" and similar notes. */
  title: string;
  tracks: SheetTrack[];
  items: SheetWorkItem[];
}

export type SheetInputState = 'pending' | 'received' | 'not_needed';

export interface SheetInput {
  id: string;
  title: string;
  /** Written for the client ("Why it matters"), so it may be shown. */
  why?: string;
  group?: string;
  neededBy?: SheetDate;
  state: SheetInputState;
  /** The client's own person for it ("Client owner" column only). */
  owner?: string;
  link?: string;
  kind: 'input' | 'decision';
}

export type SheetChangeState = 'proposed' | 'approved' | 'declined' | 'done';

export interface SheetChange {
  id: string;
  /** "CR-01". */
  ref?: string;
  title: string;
  state: SheetChangeState;
  raised?: SheetDate;
  affects?: string;
  /** As written: "$350", "350 USD". A quote the client is asked to approve. */
  estimate?: string;
  days?: string;
}

export interface SheetCheck {
  title: string;
  done: boolean;
}

export interface SheetCheckGroup {
  title: string;
  checks: SheetCheck[];
}

export interface SheetLaunch {
  groups: SheetCheckGroup[];
}

export interface SheetSeoSummary {
  /** The tab it came from, so two languages stay apart. */
  tab: string;
  language?: string;
  pages: number;
  /** Pages with both a meta title and a meta description. */
  filled: number;
}

export interface SheetRedirectSummary {
  total: number;
  /** Rows with a new path. */
  mapped: number;
  /** Rows marked tested, when the sheet has that column. */
  tested?: number;
}

/** A `[Fill this]` tab: something the client fills in, in the sheet. */
export interface SheetFillTab {
  tab: string;
  label: string;
  /** Rows the client has filled, when that can be counted. */
  filled?: number;
  total?: number;
}

/** Everything the portal may use from a sheet. */
export interface ProjectSheetData {
  overview?: SheetOverview;
  timeline?: SheetTimeline;
  workstreams: SheetWorkstream[];
  inputs: SheetInput[];
  changes: SheetChange[];
  launch?: SheetLaunch;
  seo: SheetSeoSummary[];
  redirects?: SheetRedirectSummary;
  fills: SheetFillTab[];
}

// --- What the reader tells the team -----------------------------------------

export interface SheetTabReport {
  title: string;
  role: SheetTabRole;
  /** How the role was decided: by the tab's name, by the team, or not at all. */
  how: 'name' | 'team' | 'none';
  /** Rows read into data. */
  rows: number;
  /** 1-based header row, when one was found. */
  headerRow?: number;
  /** Header text the reader used, e.g. "Page / Component". */
  columns: string[];
  warnings: string[];
  /** The first data row, abbreviated, so copied-in data from another project is easy to spot. */
  sample?: string;
}

export interface SheetReport {
  tabs: SheetTabReport[];
  /** Status words the reader did not know; each was read as In progress. */
  unknownStatuses: string[];
}

export interface SheetReadResult {
  data: ProjectSheetData;
  report: SheetReport;
}

/** The team's choice for a tab, keyed by tab title. `auto` is the absence of a choice. */
export type SheetTabOverrides = Record<string, SheetTabRole>;

/** Which source drives the stages when both the sheet and the app's Timeline tab have them. */
export type SheetStagesFrom = 'sheet' | 'app';

/**
 * The stored binding and snapshot, `project_sheets/{projectId}`. Server-only:
 * the collection is absent from firestore.rules, so browsers are denied, and
 * the Client tab reaches it through `/api/client-portal/[projectId]/sheet`.
 */
export interface ProjectSheetRecord {
  projectId: string;
  spreadsheetId: string;
  url: string;
  title?: string;
  boundAt: string;
  boundBy: string;
  overrides?: SheetTabOverrides;
  stagesFrom?: SheetStagesFrom;
  /** Whether the portal links the client to the sheet (to fill `[Fill this]` tabs). */
  showSheetLink?: boolean;
  syncedAt?: string;
  /** When the data last differed from the sync before it: news for the client. */
  changedAt?: string;
  dataHash?: string;
  syncError?: { message: string; configuration?: boolean; at: string };
  report?: SheetReport;
  data?: ProjectSheetData;
  /**
   * Created and written by the app (Rehan, 2026-10-01: checklist → sheet).
   * The app never reads a managed sheet back: the client's page follows the
   * checklist, and the sheet is a view of it for whoever prefers a sheet.
   */
  managed?: boolean;
  /** The layout an app-kept sheet was last brought up to (see LAYOUT_VERSION in project-sheet-writer). */
  layoutVersion?: number;
  /** Managed sheets: when the app last wrote it, what it wrote, and the last failure. */
  writtenAt?: string;
  writtenHash?: string;
  writeError?: { message: string; configuration?: boolean; at: string };
}

/** What the portal projection receives: the snapshot and the team's switches, nothing else. */
export interface ProjectSheetSnapshot {
  data: ProjectSheetData;
  url?: string;
  showSheetLink?: boolean;
  stagesFrom?: SheetStagesFrom;
  syncedAt?: string;
  changedAt?: string;
}

export const EMPTY_SHEET_DATA: ProjectSheetData = {
  workstreams: [],
  inputs: [],
  changes: [],
  seo: [],
  fills: [],
};
