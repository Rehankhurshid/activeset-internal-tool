import {
  normalizePageWorkStatus,
  type PageWorkStatus,
  type ProjectPage,
  type StackDefinition,
} from './delivery.types';

/**
 * The client-facing tracker sheet.
 *
 * The column order and the words in the cells match the sheets the agency
 * already sends — Muffins and Keatech — so a client opening the generated one
 * sees what they have always seen. Pure functions: building rows and reading
 * them back has nothing to do with Google, which keeps it testable.
 */

/** What the team writes in the sheets today, mapped to our statuses. */
const STATUS_TO_SHEET: Record<PageWorkStatus, string> = {
  not_started: '',
  in_progress: 'WIP',
  blocked: 'Blocked',
  in_review: 'In Review',
  completed: 'Completed',
  not_required: 'N/R',
};

/**
 * Read back leniently: these sheets are years of a dozen hands typing, so
 * "completed", "Complete", "DONE ✅" all have to land on the same status.
 */
const SHEET_TO_STATUS: { match: RegExp; status: PageWorkStatus }[] = [
  { match: /^(n\/?r|not required|na|n\/a)$/i, status: 'not_required' },
  { match: /(complete|done|✅)/i, status: 'completed' },
  { match: /(review|qa)/i, status: 'in_review' },
  // Not "pending": the sheets are full of "Assets Pending / Layout Ready",
  // which describes work under way, not work that has stopped.
  { match: /(block|stuck|on hold)/i, status: 'blocked' },
  { match: /(wip|progress|ongoing|started)/i, status: 'in_progress' },
];

export function statusToSheet(status: PageWorkStatus): string {
  return STATUS_TO_SHEET[status] ?? '';
}

export function statusFromSheet(raw: string | undefined): PageWorkStatus {
  const value = (raw ?? '').trim();
  if (!value) return 'not_started';
  for (const { match, status } of SHEET_TO_STATUS) {
    if (match.test(value)) return status;
  }
  // Something the team wrote that we do not recognise ("Assets Pending / Layout
  // Ready"). It plainly is not finished, and calling it not-started would erase
  // real progress, so treat it as in progress.
  return 'in_progress';
}

export const TRACKER_TAB_TITLE = 'Project Tracker';

export function buildTrackerHeader(stack: StackDefinition): string[] {
  const disciplines = [...stack.disciplines].sort((a, b) => a.order - b.order);
  return [
    'No.',
    'Page',
    'Docs',
    'Staging Link',
    ...disciplines.map((d) => `Status – ${d.label}`),
    'Assignee',
    'Expected Date',
    'Review Comment',
  ];
}

/**
 * One row per page, plus a spanning row wherever a group starts — the "Features
 * [P1]" header rows in the real sheets. Pages arrive already ordered.
 */
export function buildTrackerRows(stack: StackDefinition, pages: ProjectPage[]): string[][] {
  const disciplines = [...stack.disciplines].sort((a, b) => a.order - b.order);
  const rows: string[][] = [buildTrackerHeader(stack)];

  let lastGroup: string | undefined;
  let counter = 0;

  for (const page of pages) {
    const group = page.group?.trim() || undefined;
    if (group && group !== lastGroup) {
      // In the real sheets a group heading sits in the Page column with the
      // rest of the row empty, not in column A. Writing it anywhere else means
      // our own reader cannot find it again.
      rows.push(['', group]);
      lastGroup = group;
    } else if (!group) {
      lastGroup = undefined;
    }

    counter += 1;
    rows.push([
      `${counter}.0`,
      page.title || page.path,
      page.docsLink ?? '',
      page.stagingLink ?? '',
      ...disciplines.map((d) => statusToSheet(normalizePageWorkStatus(page.work?.[d.id]))),
      page.assignee ?? '',
      page.expectedDate ?? '',
      page.reviewComment ?? '',
    ]);
  }

  return rows;
}

export interface ImportedPageRow {
  path?: string;
  title: string;
  group?: string;
  docsLink?: string;
  stagingLink?: string;
  work: Record<string, PageWorkStatus>;
  assignee?: string;
  expectedDate?: string;
  reviewComment?: string;
}

function headerIndex(header: string[], ...patterns: RegExp[]): number {
  for (const pattern of patterns) {
    const i = header.findIndex((h) => pattern.test((h ?? '').trim()));
    if (i >= 0) return i;
  }
  return -1;
}

/** Only accept a real ISO day; anything else is dropped rather than guessed at. */
function isoDate(raw: string | undefined): string | undefined {
  const value = (raw ?? '').trim();
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

/**
 * Reads an existing tracker sheet back into pages, so projects already running
 * in Sheets can be seeded rather than retyped.
 *
 * Matches columns by header text rather than position, because these sheets
 * differ: Muffins has Copy/Design/Dev-Desktop/Dev-Mobile, Keatech has
 * Content/Desktop/Mobile. A discipline whose column is missing is simply not
 * set, which is the honest outcome.
 */
export function parseTrackerRows(stack: StackDefinition, grid: string[][]): ImportedPageRow[] {
  if (grid.length === 0) return [];

  // The header is rarely row 1 — the real sheets carry a title row above it.
  let headerRow = 0;
  for (let i = 0; i < Math.min(grid.length, 10); i += 1) {
    const row = grid[i] ?? [];
    if (row.some((c) => /^page$/i.test((c ?? '').trim())) || row.some((c) => /^status\s*[–-]/i.test((c ?? '').trim()))) {
      headerRow = i;
      break;
    }
  }

  const header = (grid[headerRow] ?? []).map((c) => (c ?? '').toString());
  const pageCol = headerIndex(header, /^page$/i, /^planned$/i, /^pages$/i);
  if (pageCol < 0) return [];

  const docsCol = headerIndex(header, /^docs?$/i, /doc link/i, /design link/i);
  const stagingCol = headerIndex(header, /staging/i, /test link/i, /^link$/i);
  const assigneeCol = headerIndex(header, /assignee/i, /owner/i);
  const dateCol = headerIndex(header, /expected/i, /due/i, /deadline/i);
  const commentCol = headerIndex(header, /review comment/i, /comment/i, /notes?/i);

  const disciplineCols = stack.disciplines.map((d) => {
    const label = d.label.replace(/[^a-z]/gi, '');
    const short = d.shortLabel.replace(/[^a-z]/gi, '');
    return {
      id: d.id,
      index: headerIndex(
        header,
        new RegExp(`status\\s*[–-]\\s*${label}$`, 'i'),
        new RegExp(`status\\s*[–-].*${short}`, 'i'),
        new RegExp(`^${short}$`, 'i'),
      ),
    };
  });

  const out: ImportedPageRow[] = [];
  let group: string | undefined;

  for (let i = headerRow + 1; i < grid.length; i += 1) {
    const row = grid[i] ?? [];
    const cell = (index: number) => (index >= 0 ? (row[index] ?? '').toString().trim() : '');
    const title = cell(pageCol);
    if (!title) continue;
    // These sheets stack two header rows: a title row, then "No. | Page".
    // Without this the second one is read as a page called "Page".
    if (/^(page|pages|planned|no\.?)$/i.test(title)) continue;

    // A row with only the page cell filled is a group heading, not a page.
    const populated = row.filter((c) => (c ?? '').toString().trim()).length;
    if (populated === 1 && !/^https?:/i.test(title)) {
      group = title;
      continue;
    }

    const work: Record<string, PageWorkStatus> = {};
    for (const { id, index } of disciplineCols) {
      if (index < 0) continue;
      const status = statusFromSheet(cell(index));
      if (status !== 'not_started') work[id] = status;
    }

    const staging = cell(stagingCol);
    out.push({
      title,
      group,
      // The staging URL is the only thing in these sheets resembling a path.
      path: /^https?:\/\//i.test(staging) ? staging : undefined,
      docsLink: cell(docsCol) || undefined,
      stagingLink: staging || undefined,
      work,
      assignee: cell(assigneeCol) || undefined,
      expectedDate: isoDate(cell(dateCol)),
      reviewComment: cell(commentCol) || undefined,
    });
  }

  return out;
}
