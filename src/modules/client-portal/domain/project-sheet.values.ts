import type { SheetChangeState, SheetDate, SheetOwner, WorkState } from './project-sheet.types';

/**
 * Reading single cells: status words, dates, owners. Pure.
 *
 * Every word below was found in a real ActiveSet tracker (eight of them, 2024
 * to 2026) or in the legend on the Different AI tracker's Overview tab.
 */

/** Lowercase, single-spaced, without emoji-only decoration at the ends. */
export function normalizeWord(raw: string | undefined): string {
  return (raw ?? '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

const EXACT: Record<string, WorkState> = {};
function words(state: WorkState, list: string[]) {
  for (const word of list) EXACT[word] = state;
}
words('not_started', ['', 'not started', 'not yet started', 'queued', 'to do', 'todo', 'planned', 'pending', 'no', 'false', 'not yet', 'open', 'new', 'yet to start', 'upcoming']);
// Reviews inside the team (QA, a developer's own review) are still our work in progress: only a
// review that waits on the client may say "Ready for your review" on their page.
words('in_progress', ['in progress', 'wip', 'working', 'working on it', 'ongoing', 'started', 'in development', 'in design', 'building', 'doing', 'active', 'progress', 'in production', 'in development review', 'in design review', 'dev review', 'design review', 'internal review', 'qa', 'in qa', 'testing']);
// Anything waiting on the client is their turn: "Waiting on client" is the Process tab's word for it.
words('in_review', ['ready for review', 'to be reviewed', 'in review', 'review', 'awaiting review', 'for review', 'needs review', 'client review', 'awaiting client review', 'shared for review', 'sent for review', 'with client', 'waiting on client', 'waiting for client', 'awaiting client', 'awaiting feedback', 'waiting for feedback', 'awaiting approval', 'waiting for approval', 'waiting on you']);
words('changes', ['changes requested', 'changes', 'change requested', 'feedback', 'feedback received', 'revisions', 'revision', 'revise', 'rework', 'needs changes']);
words('done', ['done', 'completed', 'complete', 'approved', 'signed off', 'live', 'received', 'yes', 'true', '✅', '✓', '✔', 'published', 'delivered', 'finished', 'passed', 'ok', 'tested', 'closed', 'resolved', 'confirmed', 'shipped']);
words('blocked', ['blocked', 'on hold', 'hold', 'waiting', 'stuck', 'client dependency', 'deferred', 'paused', 'dependency']);
words('not_needed', ['n/a', 'na', 'n/r', 'nr', 'not applicable', 'not required', 'none', 'skip', 'skipped', '-', '—', 'not needed', 'dropped', 'out of scope', 'cancelled', 'canceled']);

/** Loose fallbacks, tried in this order, for words with extra text ("Completed ✅", "In review (Arth)"). */
const LOOSE: [RegExp, WorkState][] = [
  [/\bn\/?[ar]\b|not (required|applicable|needed)/, 'not_needed'],
  // "Not received", "Not done", "Not started yet", "Yet to start": a negation is never progress.
  [/^(not|no|yet to|never)\b/, 'not_started'],
  [/internal|development review|design review|dev review|\bqa\b|testing/, 'in_progress'],
  [/review|with client|(awaiting|waiting (on|for)) (client|you|feedback|approval|sign-?off)/, 'in_review'],
  [/change|feedback|revis|rework/, 'changes'],
  [/block|stuck|hold|waiting|depend|defer|pause/, 'blocked'],
  [/complete|\bdone\b|approved|signed|\blive\b|received|deliver|publish|✅|✓/, 'done'],
  [/progress|wip|ongoing|started|develop|design|build|working/, 'in_progress'],
  [/not started|to ?do|queued|pending|planned/, 'not_started'],
];

export interface StatusRead {
  state: WorkState;
  /** True when the word matched nothing and was read as In progress. */
  unknown: boolean;
}

/**
 * A status cell in the one legend. A word nobody taught the reader counts as
 * In progress (somebody typed something, so it has started) and is reported,
 * so a typo shows up in the Client tab rather than silently moving a bar.
 */
export function readStatus(raw: string | undefined): StatusRead {
  const word = normalizeWord(raw);
  if (word in EXACT) return { state: EXACT[word], unknown: false };
  for (const [pattern, state] of LOOSE) if (pattern.test(word)) return { state, unknown: false };
  return { state: 'in_progress', unknown: true };
}

/** A tick-box cell: TRUE/FALSE, Yes/No, Done. `null` for N/A, which counts neither way. */
export function readCheck(raw: string | undefined): boolean | null {
  const { state } = readStatus(raw);
  if (state === 'not_needed') return null;
  return state === 'done';
}

/** A change request's status. A row with a description and no status is a proposal. */
export function readChangeState(raw: string | undefined): SheetChangeState {
  const word = normalizeWord(raw);
  if (!word) return 'proposed';
  // "Pending approval", "Awaiting client approval": still a question for the client.
  if (/pending|awaiting|waiting|sent for|for approval|proposed|quoted|open|new|draft/.test(word)) return 'proposed';
  if (/declin|reject|cancel|dropped|^no\b|not approved|not going ahead/.test(word)) return 'declined';
  if (/done|complete|deliver|live|shipped|built|closed/.test(word)) return 'done';
  // Work under way on a change means the client agreed to it.
  if (/approv|accept|^yes\b|go ahead|signed|progress|started|wip|building|scheduled/.test(word)) return 'approved';
  return 'proposed';
}

/** Whose milestone this is. "Client" is the client's own step; "Rehan + Client" is shared. */
export function readOwner(raw: string | undefined): SheetOwner | undefined {
  const word = normalizeWord(raw);
  if (!word) return undefined;
  const client = /\b(client|you|customer)\b/.test(word);
  const team = /\b(activeset|team|agency|us|we)\b/.test(word) || /[+&,/]| and /.test(word);
  if (/^(both|together|joint|all)$/.test(word) || (client && team)) return 'both';
  if (client) return 'client';
  return 'team';
}

// --- Dates ------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** "Aug", "august", "Sept" → 8, 8, 9. Only real month names: "Day" is not a month. */
function monthOf(word: string): number | undefined {
  const month = MONTHS[word.slice(0, 3)];
  if (!month) return undefined;
  const full = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'][month - 1];
  return full.startsWith(word) || word === 'sept' ? month : undefined;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function validIso(y: number, m: number, d: number): string | undefined {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return undefined;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** The year that puts a year-less date closest to `ref`: "31 Aug" read in October is this August. */
function nearestYear(m: number, d: number, ref: Date): string | undefined {
  const base = ref.getUTCFullYear();
  let best: string | undefined;
  let bestGap = Infinity;
  for (const y of [base - 1, base, base + 1]) {
    const iso = validIso(y, m, d);
    if (!iso) continue;
    const gap = Math.abs(Date.parse(iso) - ref.getTime());
    if (gap < bestGap) {
      best = iso;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * Whether a spreadsheet locale writes numeric dates month first. Sheets
 * formats dates in the spreadsheet's locale, so 10/2/2026 is 2 October in an
 * en_US sheet and 10 February in an en_GB or en_IN one.
 */
export function isMonthFirstLocale(locale: string | undefined): boolean {
  return /^(en_US|en_PH|en_CA|es_US|fil)/i.test(locale ?? '');
}

/**
 * A date cell. Reads ISO, numeric dates in the sheet's locale order (day first
 * unless `monthFirst`; the team is in India: 27/04/2026), and the written forms
 * the sheets use ("31 Aug", "Mon, 31 Aug 2026", "Sep 7, 2026"). Anything else
 * ("Day 1", "Wk 2") is kept as words.
 */
export function readDate(raw: string | undefined, ref: Date = new Date(), monthFirst = false): SheetDate | undefined {
  const text = (raw ?? '').trim();
  if (!text) return undefined;

  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (m) {
    const iso = validIso(+m[1], +m[2], +m[3]);
    return iso ? { iso } : { text };
  }

  m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    // a = day, b = month, in the sheet's order; swapped when that order is impossible.
    let a = monthFirst ? +m[2] : +m[1];
    let b = monthFirst ? +m[1] : +m[2];
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (b > 12 && a <= 12) [a, b] = [b, a];
    const iso = validIso(y, b, a);
    return iso ? { iso } : { text };
  }

  const cleaned = text.toLowerCase().replace(/^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*,?\s+/, '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  // 31 Aug [2026]
  m = cleaned.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]{3,9})\.?(?: (\d{4}))?$/);
  if (m && monthOf(m[2])) {
    const month = monthOf(m[2])!;
    const iso = m[3] ? validIso(+m[3], month, +m[1]) : nearestYear(month, +m[1], ref);
    return iso ? { iso } : { text };
  }
  // Aug 31 [2026]
  m = cleaned.match(/^([a-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/);
  if (m && monthOf(m[1])) {
    const month = monthOf(m[1])!;
    const iso = m[3] ? validIso(+m[3], month, +m[2]) : nearestYear(month, +m[2], ref);
    return iso ? { iso } : { text };
  }

  return { text: text.slice(0, 40) };
}

// --- Text -------------------------------------------------------------------

/** Cell text worth keeping: trimmed, single-spaced, capped, and never a formula error. */
export function cleanText(raw: string | undefined, max = 300): string {
  const text = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (/^#(REF|N\/A|VALUE|DIV\/0|NAME\?|NUM|NULL|ERROR)!?$/i.test(text)) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** "GLOBAL COMPONENTS (built once in Phase 1)" → "Global components". */
export function groupTitle(raw: string): string {
  const text = cleanText(raw, 120).replace(/\s*\(.*\)\s*$/, '').replace(/[:–—-]\s*$/, '').trim();
  const letters = text.replace(/[^a-z]/gi, '');
  if (letters && letters === letters.toUpperCase()) {
    const lower = text.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return text;
}

/** "SEO Tags – English [Fill this]" → "SEO Tags – English". */
export function tabLabel(title: string): string {
  return title.replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

/** FNV-1a, for an id from text with no Latin letters or digits in it. */
function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** A short, stable id fragment. Text with nothing Latin in it ("डिज़ाइन") gets a hash, not a shared "row". */
export function slug(text: string): string {
  const latin = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  if (latin) return latin;
  return text.trim() ? `h${shortHash(text.trim())}` : 'row';
}

/** Makes ids unique in order of appearance: a second "phase-1" becomes "phase-1-2". */
export function uniqueIds<T>(items: T[], idOf: (item: T) => string): string[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = idOf(item);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  });
}
