import type { SheetKind, SheetTabOverrides, SheetTabRole } from './project-sheet.types';

/**
 * The contract between a project sheet and the app: which tab names mean what,
 * and which header words name which field. Everything here is data, so a new
 * alias is a one-line change, and the reader never has to guess.
 *
 * Built from eight real trackers (the 2024 Webflow Development template,
 * Cosmos, Muffins AI, the Canopy migration, RevPack, Different AI, Peak XV's
 * SEO + AEO tracker, House of Haseena). Tabs are matched by name only: a tab
 * whose name matches nothing is ignored, which is what keeps another client's
 * copied-in rows (four sheets still carry LimeChat's URLs) off a portal.
 */

/** Lowercase, dashes unified, `[Fill this]`-style notes and parentheticals dropped. */
export function normalizeTabName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/[_°]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const LANGUAGE_SUFFIX = /\s*[-:|]\s*([a-z]{2}(?:-[a-z]{2})?|english|spanish|french|german|italian|portuguese|dutch|arabic|hindi|japanese|chinese|korean)$/;

/** "SEO Tags – English [Fill this]" → "English". */
export function languageOf(title: string): string | undefined {
  const match = normalizeTabName(title).match(LANGUAGE_SUFFIX);
  if (!match) return undefined;
  const word = match[1];
  return word.length <= 5 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1);
}

/** Tab names per kind, tried in this order. Matched against the normalised name, with and without a language suffix. */
const TAB_NAMES: [SheetKind, RegExp][] = [
  ['overview', /^(overview|project overview|start here|summary|project summary|dashboard)$/],
  ['timeline', /^(timeline|project timeline|schedule|project schedule|roadmap|phases|project plan|plan)$/],
  ['inputs', /^(client inputs?|inputs?|inputs? (and|&) dependencies|client inputs? (and|&) dependencies|dependencies|client dependencies|decisions|client decisions|what we need|what we need from you|asks|client asks)$/],
  ['changes', /^(change ?log|change requests?|changes|scope changes|crs?)$/],
  ['launch', /^(launch checklist|qa (and|&) launch( checklist)?|pre-?launch( checklist)?|launch qa|project global checklist|global checklist|go-?live checklist)$/],
  ['seo', /^(seo|seo tags|seo meta|meta tags|meta|seo titles?( (and|&) descriptions?)?|titles? ?\/ ?descriptions?)$/],
  ['redirects', /^((301 )?redirects?( map)?|301s?|url redirects)$/],
  ['tracker', /(^| )tracker$|^(pages|page list|tasks|deliverables|requests|tickets|work items|content migration|blog migration|cms migration)$/],
];

/** Whether a tab is a `[Fill this]` tab: the templates' own mark for "the client fills this in". */
export function isFillTab(title: string): boolean {
  return /\[\s*fill( this| in)?\s*\]/i.test(title);
}

/** The kind a tab's name says it is, if any. */
export function kindFromName(title: string): SheetKind | undefined {
  const name = normalizeTabName(title);
  const bare = name.replace(LANGUAGE_SUFFIX, '').trim();
  for (const [kind, pattern] of TAB_NAMES) {
    if (pattern.test(name) || pattern.test(bare)) return kind;
  }
  return undefined;
}

export interface TabPlan {
  title: string;
  role: SheetTabRole;
  how: 'name' | 'team' | 'none';
}

/**
 * What to do with each tab, before reading any of it: the team's choice wins,
 * then the name, then `[Fill this]`; anything else is ignored. A recognised tab
 * that is also `[Fill this]` (SEO Tags [Fill this]) keeps its kind; the reader
 * adds the ask on top.
 */
export function planTabs(titles: string[], overrides: SheetTabOverrides = {}): TabPlan[] {
  return titles.map((title) => {
    const chosen = overrides[title];
    if (chosen) return { title, role: chosen, how: 'team' };
    const kind = kindFromName(title);
    if (kind) return { title, role: kind, how: 'name' };
    if (isFillTab(title)) return { title, role: 'fill', how: 'name' };
    return { title, role: 'ignored', how: 'none' };
  });
}

// --- Columns ----------------------------------------------------------------

/** "Meta title (50 to 60 chars)" → "meta title"; "Page Link [Paste Staging URL]" → "page link". */
export function normalizeHeader(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/[:*?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface FieldSpec {
  field: string;
  pattern: RegExp;
  /** The header row must name this field for a row to count as the header. */
  required?: boolean;
  /**
   * A fallback name, used only when no column has a stronger one: in
   * "Week | Phase | Milestone" the phase is Phase, not Week.
   */
  weak?: boolean;
}

/**
 * Link columns that may reach the client, by exact name. A link column is the
 * one place a whole cell goes to the client verbatim, so it is an allow-list:
 * "Internal link", "Invoice link" or "Admin URL" never match.
 */
export const LINK_HEADER = /^(links?|url|url path|page url|live url|live link|live site|staging|staging link|staging url|page link|test link|preview|preview link|figma|figma link|design link|docs?|doc link|docs link|document|storyboard link|source file link|source files|webflow link|loom|video|recording)$/;

/** Words that keep a column away from the client even if its name otherwise looks like a link. */
export const PRIVATE_HEADER = /\b(internal|invoice|admin|contract|private|password|login|credentials?|cms|editor|billing)\b/;

/**
 * Header words per kind. Only fields the portal may show are listed; a column
 * that matches nothing (Notes, Assignee, Contract value) is never read.
 */
export const FIELDS: Record<Exclude<SheetKind, 'overview'>, FieldSpec[]> = {
  tracker: [
    { field: 'title', required: true, pattern: /^(page|pages|planned|page name|page \/ component|page\/component|component|task|tasks|deliverable|request|animation|article|articles|blog articles?|asset|ticket|feature)$/ },
    { field: 'title', required: true, weak: true, pattern: /^(item|items|name|title)$/ },
    { field: 'group', pattern: /^(group|section|category|package)$/ },
    { field: 'group', weak: true, pattern: /^(area|type|set)$/ },
    { field: 'phase', pattern: /^(phase|stage)$/ },
    { field: 'phase', weak: true, pattern: /^(sprint|month|milestone)$/ },
    { field: 'status', pattern: /^(status|state|progress|overall status)$/ },
    { field: 'target', pattern: /^(expected date|target date|target|due|due date|deadline|eta|publish date|dev - due date|design - due date|go-?live)$/ },
    { field: 'target', weak: true, pattern: /^(end date|ends)$/ },
    { field: 'link', pattern: LINK_HEADER },
  ],
  timeline: [
    { field: 'phase', pattern: /^(phase|stage)$/ },
    { field: 'phase', weak: true, pattern: /^(week|sprint|month|day window|period)$/ },
    { field: 'title', required: true, pattern: /^(milestone|milestones|milestone \/ deliverable|milestone\/deliverable|deliverable|task|step|activity|what|item)$/ },
    { field: 'owner', pattern: /^(owner|who|responsible|by|owner \/ who)$/ },
    { field: 'start', pattern: /^(start|starts|start date|from|begins|begin)$/ },
    { field: 'end', pattern: /^(end|ends|end date|due|due date|to|deadline|finish|target date)$/ },
    { field: 'status', pattern: /^(status|state|progress)$/ },
  ],
  inputs: [
    { field: 'title', required: true, pattern: /^(input|inputs|input needed.*|item|what we need.*|decision|decisions|request|asset|dependency|ask|needed|requirement)$/ },
    { field: 'why', pattern: /^(why|why it matters|purpose|reason|starting point.*|context|used for|what it unlocks)$/ },
    { field: 'neededBy', pattern: /^(needed by.*|due|due date|deadline|by when|needed on)$/ },
    { field: 'status', pattern: /^(status|state)$/ },
    { field: 'received', pattern: /^(received|received on|date received|your decision|decision made|answer|agreed)$/ },
    { field: 'owner', pattern: /^client owner$/ },
    { field: 'link', pattern: /^(link|link \/ location|location|where|url|upload to|folder|drive folder)$/ },
  ],
  changes: [
    { field: 'ref', pattern: /^(id|cr|ref|cr id|cr #|#)$/ },
    { field: 'title', required: true, pattern: /^(description|change|change request|request|what|summary|scope change)$/ },
    { field: 'raised', pattern: /^(date raised|raised on|raised|requested on|date)$/ },
    { field: 'affects', pattern: /^(affects|impact|area)$/ },
    { field: 'estimate', pattern: /^(estimate.*|cost|price|quote|amount|fee)$/ },
    { field: 'days', pattern: /^(est\.? days|days|effort|time|est\.? time)$/ },
    { field: 'status', pattern: /^(status|state|decision)$/ },
  ],
  launch: [
    { field: 'title', required: true, pattern: /^(check|checks|item|task|checkpoint|what|requirement)$/ },
    { field: 'done', pattern: /^(done|status|complete|completed|pass|passed|ok|checked|yes\/no)$/ },
  ],
  seo: [
    { field: 'page', required: true, pattern: /^(page|page name|name|page title)$/ },
    { field: 'url', pattern: /^(url|url slug|slug|link|path)$/ },
    { field: 'title', pattern: /^(meta title|title|seo title|title tag)$/ },
    { field: 'description', pattern: /^(meta description|description|meta desc|seo description)$/ },
  ],
  redirects: [
    { field: 'from', required: true, pattern: /^(old path|old url|from|source|old|old link|current url)$/ },
    { field: 'to', pattern: /^(new path|new url|to|destination|target|new|new link)$/ },
    { field: 'tested', pattern: /^(tested|verified|checked|works)$/ },
  ],
};

/**
 * Status columns that name a track rather than say "Status": "Copy", "Design",
 * "Dev: Desktop", "Status – Mobile". Anything else is a track only if its cells
 * read as statuses (see the reader).
 */
export function trackLabelFromHeader(raw: string): string | undefined {
  const header = normalizeHeader(raw);
  const prefixed = raw.replace(/[–—]/g, '-').match(/^\s*status\s*-\s*(.+)$/i);
  if (prefixed) return prefixed[1].trim();
  if (/^(copy|content|design|dev|development|desktop|mobile|tablet|qa|seo|dev: ?desktop|dev: ?mobile|dev - desktop|dev - mobile|dev \/ desktop|dev \/ mobile|forms \/ analytics|refine|final files|storyboard|concept \/ storyboard|illustration prep|optimised export|optimized export|implementation|mobile fallback|copy status|design status|dev status)$/.test(header)) {
    return raw.trim();
  }
  return undefined;
}
