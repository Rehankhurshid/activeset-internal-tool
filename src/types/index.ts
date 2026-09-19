import { WebflowConfig } from './webflow';

export interface ProjectLink {
  id: string;
  title: string;
  url: string;
  order: number;
  isDefault?: boolean;
  auditResult?: AuditResult;
  source?: 'manual' | 'auto';
  locale?: string; // e.g., "en", "de", "fr" - detected from sitemap hreflang
  pageType?: 'static' | 'collection' | 'unknown'; // Detected from Webflow or URL patterns
  /** Shown on the client portal as a deliverable. Manual links only; default false. */
  clientVisible?: boolean;
}

// --- FOLDER PAGE TYPES ---
// Simple mapping of folder paths to page types (CMS vs Static)
// e.g., { "/blog/*": "collection", "/features/*": "static" }
export type FolderPageTypes = Record<string, 'static' | 'collection'>;

// Change status classification based on hash comparison
export type ChangeStatus = 'NO_CHANGE' | 'TECH_CHANGE_ONLY' | 'CONTENT_CHANGED' | 'SCAN_FAILED';

// Audit result from widget scanning
export interface ContentSnapshot {
  title: string;
  h1: string;
  metaDescription: string;
  wordCount: number;
  headings: string[]; // All H1-H3 headings
}

export interface PreviousAuditSummary {
  lastRun: string;
  score: number;
  changeStatus?: ChangeStatus;
  title: string;
  h1: string;
  metaDescription: string;
  wordCount: number;
}

export interface AuditResult {
  score: number;
  summary: string;
  canDeploy: boolean;
  fullHash?: string;
  contentHash?: string;
  changeStatus?: ChangeStatus;
  lastRun: string; // ISO date string
  contentSnapshot?: ContentSnapshot;
  changedFields?: string[]; // e.g., ['title', 'h1', 'wordCount']
  fieldChanges?: FieldChange[]; // Detailed changes with before/after values
  diffSummary?: string; // Human readable summary of changes (e.g. "Title updated, Word count +20")
  diffPatch?: string;  // Unified diff string showing exact changes
  screenshot?: string; // DEPRECATED: Base64 encoded PNG screenshot (for backward compatibility)
  previousScreenshot?: string; // DEPRECATED: Base64 PNG of previous scan's screenshot
  screenshotUrl?: string; // URL to screenshot in Firebase Storage
  previousScreenshotUrl?: string; // URL to previous screenshot in Firebase Storage
  /**
   * The handful of numbers from the scan before this one, kept so anomaly
   * detection can compare without a snapshot of the whole project taken before
   * the scan started. See `src/lib/audit-previous.ts`.
   */
  previous?: PreviousAuditSummary;
  screenshotCapturedAt?: string; // ISO timestamp when screenshot was taken
  mobileScreenshot?: string; // Base64 PNG at 375px width
  tabletScreenshot?: string; // Base64 PNG at 768px width
  desktopScreenshot?: string; // Base64 PNG at 1280px width
  categories: {
    placeholders: {
      status: 'passed' | 'failed' | 'warning' | 'info';
      issues: { type: string; count: number }[];
      score: number;
    };
    spelling: {
      status: 'passed' | 'failed' | 'warning' | 'info';
      issues: { word: string; suggestion?: string }[];
      score: number;
    };
    readability: {
      status: 'passed' | 'failed' | 'warning' | 'info';
      score: number;
      fleschScore: number;
      wordCount: number;
      sentenceCount: number;
      label: string;
    };
    completeness: {
      status: 'passed' | 'failed' | 'warning' | 'info';
      issues: { check: string; detail: string }[];
      score: number;
    };
    seo: {
      status: 'passed' | 'failed' | 'warning' | 'info';
      issues: string[];
      title?: string;
      titleLength?: number;
      metaDescription?: string;
      metaDescriptionLength?: number;
      imagesWithoutAlt?: number;
      score: number;
    };
    technical: {
      status: 'passed' | 'failed' | 'warning' | 'info';
      issues: string[];
      score: number;
    };
    // New QA categories
    schema?: {
      status: 'passed' | 'failed' | 'warning' | 'info';
      hasSchema: boolean;
      schemaTypes: string[]; // e.g., ['Organization', 'WebPage', 'BreadcrumbList']
      issues: { type: string; message: string }[];
      rawSchemas?: object[]; // The parsed JSON-LD objects
      score: number;
    };
    links?: {
      status: 'passed' | 'failed' | 'warning' | 'info';
      totalLinks: number;
      internalLinks: number;
      externalLinks: number;
      brokenLinks: { href: string; status: number; text: string; error?: string }[];
      /**
       * Links the checker could not get an answer about — LinkedIn's 999
       * bot-block, a WAF 403, a 429 from a burst we caused. Kept apart from
       * `brokenLinks` so a page is never marked failing over a link that
       * works fine for a person, and so the UI can say "could not verify"
       * rather than making them silently disappear. Absent on audits from
       * before this existed.
       */
      unverifiableLinks?: { href: string; status: number; text: string; reason: string }[];
      checkedAt?: string; // ISO timestamp when links were last checked
      score: number;
    };
    /** What Jev made of the page. Absent until a scan runs with a key configured. */
    judgment?: PageJudgment;
    openGraph?: {
      status: 'passed' | 'failed' | 'warning' | 'info';
      hasOpenGraph: boolean;
      title?: string;
      description?: string;
      image?: string;
      url?: string;
      type?: string;
      issues: string[];
      score: number;
    };
    twitterCards?: {
      status: 'passed' | 'failed' | 'warning' | 'info';
      hasTwitterCards: boolean;
      card?: string;
      title?: string;
      description?: string;
      image?: string;
      issues: string[];
      score: number;
    };
    metaTags?: {
      status: 'passed' | 'failed' | 'warning' | 'info';
      canonicalUrl?: string;
      hasViewport: boolean;
      viewport?: string;
      language?: string;
      robots?: string;
      favicon?: string;
      issues: string[];
      score: number;
    };
    headingStructure?: {
      status: 'passed' | 'failed' | 'warning' | 'info';
      headings: { level: number; text: string }[];
      h1Count: number;
      issues: string[];
      score: number;
    };
    accessibility?: {
      status: 'passed' | 'failed' | 'warning' | 'info';
      score: number;
      issues: {
        type: 'alt-text' | 'form-label' | 'aria' | 'skip-link' | 'link-text' | 'heading-order';
        severity: 'error' | 'warning';
        element?: string;
        message: string;
      }[];
      ariaLandmarks: string[];
      hasSkipLink: boolean;
      formInputsWithoutLabels: number;
      linksWithGenericText: number;
    };
  };
  // Legacy fields for backward compatibility
  strengths?: string[];
  improvements?: string[];
}

export type CreateProjectLinkInput = Omit<ProjectLink, 'id'>;
export type UpdateProjectLinkInput = Partial<Pick<ProjectLink, 'title' | 'url' | 'order' | 'auditResult'>>;

// --- CHANGE LOG TYPES ---

// Individual field change with before/after values
export interface FieldChange {
  field: string;  // 'h1', 'title', 'images', 'links', 'metaDescription', 'wordCount', 'headings', 'bodyText'
  oldValue: string | number | string[] | ImageInfo[] | LinkInfo[] | null;
  newValue: string | number | string[] | ImageInfo[] | LinkInfo[] | null;
  changeType: 'added' | 'removed' | 'modified';
}

// Image info for tracking
export interface ImageInfo {
  src: string;
  alt: string;
  inMainContent: boolean;
}

// Link info for tracking
export interface LinkInfo {
  href: string;
  text: string;
  isExternal: boolean;
}

// Broken link info for link checking
export interface BrokenLinkInfo {
  href: string;
  text: string;
  status: number;
  error?: string;
}

// Schema markup info
export interface SchemaMarkupInfo {
  type: string;
  properties: Record<string, unknown>;
  isValid: boolean;
  issues: string[];
}

// Section info for tracking (legacy)
export interface SectionInfo {
  selector: string;
  headingText: string;
  wordCount: number;
  textPreview: string;
}

// Content block for card/block tracking (improved)
export interface ContentBlock {
  id: string;           // Hash for matching
  heading: string;      // The main heading text (e.g., "Decaf")
  tag?: string;         // Tag/category text (e.g., "Development")
  html: string;         // Raw HTML snippet for preview
  selector: string;     // CSS selector used to find this block
  index: number;        // Position in the page (for ordering)
}

// Text element for granular DOM diff
export interface TextElement {
  selector: string;     // CSS selector used
  text: string;         // Text content
  html: string;         // Raw HTML snippet
}

// Block change for diff display
export interface BlockChange {
  type: 'added' | 'removed' | 'modified';
  before?: ContentBlock;
  after?: ContentBlock;
  changeLabel?: string;  // e.g., "Decaf → Decaf (Web)"
}

// Text element change for inline diff
export interface TextChange {
  type: 'added' | 'removed' | 'modified';
  selector: string;
  beforeText?: string;
  afterText?: string;
  beforeHtml?: string;
  afterHtml?: string;
}

// Extended content snapshot with images/links/sections
export interface ExtendedContentSnapshot extends ContentSnapshot {
  images: ImageInfo[];
  links: LinkInfo[];
  sections: SectionInfo[];
  blocks?: ContentBlock[];  // Individual cards/blocks for diff display
  textElements?: TextElement[];  // Text elements for granular DOM diff
  bodyTextHash: string;
  bodyTextPreview?: string; // First 500 chars of body text for change comparison
  headingsWithTags?: Array<{ tag: string, text: string }>; // Headings with H1/H2/H3 tags
}

// Change log entry (stored in Firestore content_changes collection)
export interface ChangeLogEntry {
  id: string;
  projectId: string;
  linkId: string;
  url: string;
  timestamp: string;
  changeType: 'FIRST_SCAN' | 'CONTENT_CHANGED' | 'TECH_CHANGE_ONLY';
  fieldChanges: FieldChange[];
  summary: string;
  contentSnapshot: ExtendedContentSnapshot;
  fullHash: string;
  contentHash: string;
  auditScore?: number;
}

// Query options for change log
export interface ChangeLogQueryOptions {
  linkId?: string;
  projectId?: string;
  startDate?: string;
  endDate?: string;
  changeType?: ChangeLogEntry['changeType'];
  limit?: number;
}

// --- PROJECT STATUS & TAG TYPES ---

export type ProjectStatus = 'current' | 'paused' | 'closed' | 'paid';

export type ProjectTag =
  | 'retainer'
  | 'one_time'
  | 'subscription'
  | 'maintenance'
  | 'consulting';

export const PROJECT_TAG_LABELS: Record<ProjectTag, string> = {
  retainer: 'Retainer',
  one_time: 'One Time',
  subscription: 'Subscription',
  maintenance: 'Maintenance',
  consulting: 'Consulting',
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  current: 'Current',
  paused: 'Paused',
  closed: 'Closed',
  paid: 'Paid',
};

/**
 * How a project is billed. Drives the task → line-item → invoice flow:
 * `adhoc` projects surface per-task billable hours and a "generate invoice
 * from tasks" action. Missing/legacy docs are treated as `fixed`.
 */
export type BillingType = 'fixed' | 'retainer' | 'adhoc';

export const BILLING_TYPE_LABELS: Record<BillingType, string> = {
  fixed: 'Fixed price',
  retainer: 'Retainer',
  adhoc: 'Ad-hoc / hourly',
};

export function normalizeBillingType(raw: unknown): BillingType {
  if (raw === 'adhoc' || raw === 'retainer' || raw === 'fixed') return raw;
  return 'fixed';
}

/** Legacy docs may still carry status: 'past' — read it as 'paid'. */
export function normalizeProjectStatus(raw: unknown): ProjectStatus {
  if (raw === 'closed' || raw === 'paid' || raw === 'current' || raw === 'paused') return raw;
  if (raw === 'past') return 'paid';
  return 'current';
}

export interface SlackSourceMetadata {
  channelId: string;
  messageTs: string;
  threadTs?: string;
  userId?: string;
  username?: string;
  permalink?: string;
}

/**
 * Snapshot of the daily Webflow ↔ sitemap drift check. Compares the live list
 * of Webflow static pages against the URLs in the project's configured sitemap.
 * Useful for reverse-proxy projects where the sitemap is hand-maintained and can
 * fall out of sync with what's actually published in Webflow.
 */
export interface WebflowSitemapDiff {
  checkedAt: string;              // ISO timestamp of the last check
  sitemapUrl: string;            // sitemap that was compared against
  // NOTE: these lists are RAW (before the ignore list is applied). Ignored paths
  // are filtered out at render time (UI) and before notifying (cron), so that
  // un-ignoring a path resurfaces it without needing to re-run the check.
  missingFromSitemap: string[];  // normalized paths in Webflow (static) but not in the sitemap
  missingFromWebflow: string[];  // normalized paths in the sitemap (static) but not in Webflow
  webflowStaticCount: number;    // total static Webflow pages considered
  sitemapStaticCount: number;    // total static sitemap URLs considered
  error?: string;                // set when the check could not run (e.g. sitemap fetch failed)
}

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  tags: ProjectTag[];
  links: ProjectLink[];
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  client?: string; // Optional client/company name used to group projects together
  /** Client portal settings (the private client-facing page). The portal token
   *  itself is never stored here — it lives in the admin-only
   *  `client_portal_tokens` collection, hashed. */
  clientPortal?: ClientPortalSettings;
  /** Client-facing status the team maintains, plus counters the portal beacon
   *  writes through firebase-admin. Counter writes never touch `updatedAt`. */
  clientFacing?: ClientFacingState;
  // --- Billing ---
  /** How the project is billed. Missing = 'fixed'. `adhoc` unlocks the
   *  per-task billable hours + "generate invoice from tasks" flow. */
  billingType?: BillingType;
  /** Default hourly rate applied to billable tasks (per-task override wins). */
  hourlyRate?: number;
  /** ISO 4217 currency for ad-hoc invoices, e.g. 'USD' / 'INR'. Default 'USD'. */
  billingCurrency?: string;
  /** Email used for the Refrens invoice `billedTo`. The billedTo name reuses
   *  `client` (falling back to the project name). */
  billingContactEmail?: string;
  /** Country for the Refrens invoice `billedTo` — Refrens requires it. */
  billingCountry?: string;
  /** Optional logo for the project — either a remote URL or a small data URL. */
  logoUrl?: string;
  /** Optional link to a proposal — drives "Import from proposal" on the
   *  Invoices tab. Set via the project header's proposal picker. */
  proposalId?: string;
  webflowConfig?: WebflowConfig;
  sitemapUrl?: string; // For daily scheduled scans
  folderPageTypes?: FolderPageTypes; // Simple folder → CMS/Static mapping
  /** Normalized paths (e.g. "/style-guide") the user has chosen to exclude from
   *  the Webflow↔sitemap drift check. Applies to both directions. */
  sitemapIgnorePaths?: string[];
  /** Last Webflow↔sitemap drift snapshot. Written by the on-demand endpoint and
   *  the daily cron; rendered in the Webflow dashboard's "Sitemap Sync" tab. */
  webflowSitemapDiff?: WebflowSitemapDiff;
  // Locale data extracted from sitemap hreflang
  detectedLocales?: string[]; // Canonical list of locales, e.g., ["en", "da", "es-ar", "pt-br"]
  pathToLocaleMap?: Record<string, string>; // Path prefix to locale mapping, e.g., { "/es": "es-ar", "/pt": "pt-br" }
  // Public sharing for audit dashboard
  publicAuditShareToken?: string;
  publicAuditShareEnabled?: boolean;
  publicAuditShareUpdatedAt?: string;
  // Embedded widget display flags
  disableAuditBadge?: boolean; // Hide the floating score badge on the right
  disableDropdown?: boolean; // Hide the bottom-right project-links dropdown
  enableSpellcheck?: boolean; // Toggle the embedded spellcheck/audit overlay
  // Persisted bulk image-scan job so progress survives page refresh.
  imageScanJob?: ImageScanJob;
  /** ClickUp list bound to this project. New tasks created in this list auto-import as
   *  pre-linked Tasks; updates flow in via webhook the same way per-task linking does. */
  clickupListId?: string;
  clickupListName?: string;
  /** Internal owner responsible for the daily project review. */
  reviewOwnerEmail?: string;
  /** Team members attached to the project for visible ownership across dashboards. */
  assigneeEmails?: string[];
  /** Website delivery: chosen stack, site-wide checklist answers, kickoff state.
   *  Pages themselves live in the `pages` subcollection, not here. */
  delivery?: ProjectDeliveryState;
  // --- Daily review tracking ---
  /** UTC date (YYYY-MM-DD) of the most recent review. Primary "is it reviewed today" check. */
  lastReviewDate?: string;
  /** ISO timestamp of the most recent review. For tooltips / "X mins ago". */
  lastReviewedAt?: string;
  /** Email of whoever last marked the review. */
  lastReviewedBy?: string;
  /** Consecutive days with at least one review. Resets if a day is skipped. */
  reviewStreak?: number;
}

export interface ImageScanJob {
  status: 'running' | 'completed' | 'failed';
  startedAt: string; // ISO
  lastUpdatedAt: string; // ISO — used to detect stale jobs
  total: number;
  completed: number;
  currentUrl?: string;
  resolvedCount: number;
  failedCount: number;
  /** Vercel Workflow run ID — set when a durable workflow is driving the scan. */
  runId?: string;
}

export interface WebsiteTextCheckTarget {
  id: string;
  title: string;
  url: string;
}

export interface WebsiteTextCheckMatch {
  id: string;
  title: string;
  url: string;
  occurrences: number;
  snippets: string[];
  titleTag?: string;
}

export interface WebsiteTextCheckError {
  id: string;
  title: string;
  url: string;
  message: string;
}

export interface WebsiteTextCheckResponse {
  query: string;
  normalizedQuery: string;
  totalPages: number;
  scannedPages: number;
  matchedPages: number;
  durationMs: number;
  matches: WebsiteTextCheckMatch[];
  errors: WebsiteTextCheckError[];
}

export type CreateProjectInput = Pick<Project, 'name' | 'userId'>;
export type UpdateProjectInput = Partial<Pick<Project, 'name' | 'status' | 'tags' | 'assigneeEmails'>>;

export interface User {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
}

export interface WidgetConfig {
  projectId?: string;
  initialLinks?: Omit<ProjectLink, 'id' | 'order'>[];
  theme?: 'dark' | 'light';
  allowReordering?: boolean;
  showModal?: boolean;
  mode?: 'qa' | 'links' | 'checklist';
}

// Error types
export interface AppErrorInfo {
  code?: string;
  userMessage?: string;
  context?: string;
}

// Component prop types
export interface BaseComponentProps {
  className?: string;
  children?: React.ReactNode;
}

// Async operation result
export type AsyncOperationResult<T> = {
  success: true;
  data: T;
} | {
  success: false;
  error: string;
};

// Database operation types
export type DatabaseOperation = 'create' | 'read' | 'update' | 'delete';

export interface DatabaseOperationContext {
  operation: DatabaseOperation;
  resource: string;
  resourceId?: string;
}

// --- CHECKLIST / SOP TYPES ---

// Checklist item status
export type ChecklistItemStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';

/**
 * What Jev made of a page, stored on the audit beside the mechanical checks.
 *
 * Probabilities rather than verdicts, deliberately: the thresholds that turn
 * them into pass or fail live in one reviewable place and can be moved without
 * rescanning anything. Every field is optional, because a judgment that was
 * never asked for is a different thing from one that came back negative.
 */
export interface PageJudgment {
  checkedAt: string;
  /** Probability the title describes this page rather than being boilerplate. */
  titleDescribesPage?: number;
  /** Probability the meta description matches what the page actually says. */
  metaDescriptionAccurate?: number;
  /** Probability the copy is finished, rather than still carrying filler. */
  copyIsFinal?: number;
  /**
   * Per image, one of two questions depending on whether it has alt text at all.
   *
   * An empty alt is *correct* on a decorative image — a divider, a texture, an
   * icon beside a label that already says the word — and wrong on one that
   * carries meaning. Flagging every empty alt is what makes an accessibility
   * report something people stop opening.
   */
  altText?: {
    src: string;
    alt: string;
    /** Empty alt: probability the image is decorative, so empty is right. */
    decorative?: number;
    /** Non-empty alt: probability the text is useful to someone who cannot see it. */
    meaningful?: number;
  }[];
  /**
   * Per broken link: would a visitor plausibly click it? Forty broken links with
   * no order of attack is a list nobody works through.
   */
  brokenLinks?: { href: string; text: string; matters: number }[];
  /** Probability the declared schema type matches what the page actually is. */
  schemaTypeFits?: number;
  /** Spell-checker flags Jev agreed were real mistakes, not brand names. */
  realSpellingIssues?: { word: string; suggestion?: string }[];
  /** How many flags were put to it, so "none real" differs from "none asked". */
  spellingCandidatesChecked?: number;
}

/**
 * Signals the page audit already computes, which a checklist item can name so
 * it answers itself instead of asking a person for something a crawler knows.
 *
 * The first eight are measurements: a title exists, a link resolves. The last
 * four are judgments, and they are the ones that catch a page passing every
 * mechanical check with `alt="image1"` and lorem ipsum in the third section.
 */
export type AutoCheckId =
  | 'page_title'
  | 'meta_description'
  | 'single_h1'
  | 'image_alt'
  | 'open_graph'
  | 'links_resolve'
  | 'schema'
  | 'spelling'
  | 'title_describes_page'
  | 'meta_description_accurate'
  | 'alt_text_meaningful'
  | 'copy_is_final';

/**
 * Which stage of a website build a checklist section belongs to.
 *
 * Purely a view hint: the Delivery tab's Kickoff and Launch stages render the
 * sections tagged for them, so the team sees the relevant slice where they are
 * working. The Checklist tab still shows every section, and both tick the same
 * underlying item. Untagged sections appear only on the Checklist tab, which is
 * what every existing template does.
 */
export type ChecklistStage = 'kickoff' | 'launch';

/**
 * The one thing about a delivery stage the app hardcodes.
 *
 * Every checklist section is a stage, in its own order, so an SOP's shape is the
 * project's shape and a new SOP needs no code. A role marks the few stages where
 * the app does more than show a list: the build grid lives in one, the client
 * approves at one, readiness is decided at one. Several sections may share a
 * role, and most have none.
 */
export type StageRole = 'kickoff' | 'pages' | 'client_review' | 'launch';

/** One client sign-off on one stage. Append-only; the team clears it, not the client. */
export interface StageApproval {
  /** `${checklistId}:${sectionId}` — the stage's key in the delivery arc. */
  stageKey: string;
  /** Kept alongside the key so the record still reads if the section is renamed. */
  stageTitle: string;
  approvedAt: string;
  /** Whatever the client typed when approving, if anything. */
  note?: string;
}

/** One labelled link on a task: the tool, the reference, the example. */
export interface ChecklistItemLink {
  label: string;
  url: string;
}

/**
 * Something worth writing down when a step is done.
 *
 * "The kickoff call happened" is a tick. *When* it happened and *where the
 * recording is* are the things anyone actually needs three weeks later, and a
 * tick cannot hold them. The values live on the item, beside the tick, rather
 * than in a note somebody has to remember to write.
 */
export interface ChecklistItemField {
  /** Stable key for the value map. */
  id: string;
  label: string;
  type: 'date' | 'url' | 'text' | 'emails';
  placeholder?: string;
  /** Flagged as missing when the step is ticked without it. Never blocks the tick. */
  expected?: boolean;
}

/**
 * A message to copy and send, so the step does not begin with writing one.
 *
 * Most steps that wait on a client wait because nobody has asked yet, and
 * "asking" means composing the same message again. `options` are the choices to
 * put to them, e.g. weekly or every two weeks.
 */
export interface ChecklistItemTemplate {
  /** What the button says, e.g. "Copy the message for the client". */
  label?: string;
  body: string;
  /** Offered as alternatives to paste in; the first is the recommendation. */
  options?: string[];
}

// Individual checklist item
export interface ChecklistItem {
  id: string;
  title: string;
  emoji?: string;            // From the SOP (e.g., "🐸", "📑")
  status: ChecklistItemStatus;
  notes?: string;            // Free-text notes per item
  referenceLink?: string;    // External link
  hoverImage?: string;       // Image URL to show on hover
  assignee?: string;         // Assigned team member email
  completedAt?: string;      // ISO date
  completedBy?: string;      // User email who completed it
  order: number;
  /** When set, the latest page scans can answer this item. Optional: hand-written
   *  items are untouched, and a person's status always wins. */
  autoCheck?: AutoCheckId;
  /**
   * What to actually do, in a few lines. Shown inline under the title rather
   * than behind a hover, because guidance nobody can see is guidance nobody
   * follows — which is why the shipped SOP kept its URLs inside item titles.
   */
  howTo?: string;
  /** The tools and references that do the job, each labelled so you know what you are opening. */
  links?: ChecklistItemLink[];
  /** Must be settled before this stage can close, and before the next one opens. */
  blocking?: boolean;
  /** ISO date. What makes an item capable of being overdue. */
  dueDate?: string;
  /** What to record when doing this step. */
  fields?: ChecklistItemField[];
  /** What was recorded, keyed by field id. Lives on the project, never on the template. */
  values?: Record<string, string>;
  /** A message to copy and send. */
  template?: ChecklistItemTemplate;
}

// Section of the checklist (e.g., "Step 1: Project Planning & Kickoff")
export interface ChecklistSection {
  id: string;
  title: string;
  emoji?: string;            // Section emoji (e.g., "📁", "🧱")
  items: ChecklistItem[];
  order: number;
  /**
   * @deprecated Superseded by `role`. Still read, so existing projects keep
   * working: `kickoff` and `launch` map onto the roles of the same name.
   */
  stage?: ChecklistStage;
  /**
   * What the Delivery tab does at this stage beyond listing its items. Most
   * sections have no role — they are an ordinary step in the arc.
   */
  role?: StageRole;
}

// Full project checklist
export interface ProjectChecklist {
  id: string;                // Firestore doc ID
  projectId: string;         // Reference to project
  templateId: string;        // e.g., "webflow_migration_v1"
  /**
   * Every template this checklist was built from, in order.
   *
   * A checklist can merge several, and `templateId` records only the first — so
   * without this the sections that came from the second template match nothing
   * when improvements are offered back, and are skipped in silence. Absent on
   * checklists created before this existed; read `templateIds ?? [templateId]`.
   */
  templateIds?: string[];
  templateName: string;      // e.g., "Website Migration to Webflow"
  sections: ChecklistSection[];
  createdAt: Date;
  updatedAt: Date;
}

// SOP template item (no id — IDs are generated at instantiation)
export type SOPTemplateItem = Omit<ChecklistItem, 'id'>;

// SOP template section (no id on section or items)
export interface SOPTemplateSection {
  title: string;
  emoji?: string;
  items: SOPTemplateItem[];
  order: number;
  /** @deprecated Superseded by `role`; still read so old templates keep working. */
  stage?: ChecklistStage;
  /** Carried onto every checklist made from this template. */
  role?: StageRole;
}

// SOP template definition (for the template selector)
export interface SOPTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;              // Emoji icon
  sections: SOPTemplateSection[];
  isBuiltIn?: boolean;       // true for static templates (read-only)
  createdAt?: Date;
  updatedAt?: Date;
}

// --- PROJECT TIMELINE TYPES ---

export type TimelineItemStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked';

export type TimelineColor =
  | 'blue'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'violet'
  | 'slate';

export const TIMELINE_STATUS_LABELS: Record<TimelineItemStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
  blocked: 'Blocked',
};

export const TIMELINE_COLORS: TimelineColor[] = [
  'blue',
  'emerald',
  'amber',
  'rose',
  'violet',
  'slate',
];

export interface TimelinePhase {
  id: string;
  title: string;
  color?: TimelineColor;
  order: number;
  collapsed?: boolean;
}

export interface TimelineMilestone {
  id: string;
  title: string;
  phaseId?: string;              // optional group
  status: TimelineItemStatus;
  startDate: string;             // ISO YYYY-MM-DD (matches DatePicker)
  endDate: string;               // ISO YYYY-MM-DD (inclusive)
  color?: TimelineColor;         // falls back to phase color
  assignee?: string;             // email
  notes?: string;
  /** Rendered on the client portal (title, dates, status only). Default false. */
  clientVisible?: boolean;
  order: number;
  createdAt?: string;            // ISO
  updatedAt?: string;            // ISO
}

export interface ProjectTimeline {
  id: string;                    // Firestore doc ID (equals projectId)
  projectId: string;
  phases: TimelinePhase[];
  milestones: TimelineMilestone[];
  createdAt: Date;
  updatedAt: Date;
}

// Template definitions (for seeding a blank timeline)
export type TimelineTemplatePhase = Omit<TimelinePhase, 'id' | 'order'> & {
  order: number;
};

export type TimelineTemplateMilestone = Omit<
  TimelineMilestone,
  'id' | 'order' | 'phaseId' | 'createdAt' | 'updatedAt'
> & {
  order: number;
  phaseIndex?: number;    // index into template.phases
  startOffsetDays: number; // days from timeline start
  durationDays: number;    // length in days
};

export interface TimelineTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  phases: TimelineTemplatePhase[];
  milestones: TimelineTemplateMilestone[];
  isBuiltIn?: boolean;       // true for static templates (read-only)
  createdAt?: Date;
  updatedAt?: Date;
}

// --- TASK & REQUEST TYPES ---
// Tasks are discrete trackable work items, one per row in the Tasks tab.
// Requests are the original incoming blobs (Slack/email/paste) that may have
// been parsed by AI into one or more tasks. A task may have a requestId
// linking it back to its source bundle, or be created standalone.

export type TaskCategory =
  | 'fix'
  | 'feature'
  | 'copy'
  | 'design'
  | 'bug'
  | 'content'
  | 'other';

export type TaskStatus =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'in_review'
  | 'done'
  | 'blocked';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type TaskSource = 'manual' | 'paste' | 'slack' | 'email' | 'clickup';

/** How a billable ad-hoc task is priced: by the hour or a flat fee. */
export type TaskBillingMode = 'hourly' | 'fixed';

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  fix: 'Fix',
  feature: 'Feature',
  copy: 'Copy',
  design: 'Design',
  bug: 'Bug',
  content: 'Content',
  other: 'Other',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
  blocked: 'Blocked',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export const TASK_CATEGORIES: TaskCategory[] = ['fix', 'feature', 'copy', 'design', 'bug', 'content', 'other'];
export const TASK_STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked'];
export const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

export interface Task {
  id: string;
  projectId: string;
  /** Optional link back to the Request blob this task was parsed from. */
  requestId?: string;
  title: string;
  description?: string;
  category: TaskCategory;
  status: TaskStatus;
  priority: TaskPriority;
  /** ISO date string (YYYY-MM-DD) — matches the existing DatePicker convention. */
  dueDate?: string;
  tags?: string[];
  source: TaskSource;
  /** Optional URL back to the originating Slack message / email thread. */
  sourceLink?: string;
  /** Structured Slack source metadata when this task came from Slack. */
  slack?: SlackSourceMetadata;
  /** Import or parse dedupe key, usually channelId:messageTs for Slack. */
  dedupeKey?: string;
  /** Page or asset URL this task is about, when detected. */
  pageUrl?: string;
  /** Lightweight QA state attached to the task. */
  qaStatus?: 'not_run' | 'passed' | 'failed' | 'needs_review';
  /** True when the task blocks release or client progress. */
  isBlocker?: boolean;
  /** True when ActiveSet is waiting on client input. */
  needsClientInput?: boolean;
  /** 0-1 confidence for AI/deterministic extraction. */
  confidence?: number;
  /** Email of the assigned team member. */
  assignee?: string;
  /** Manual order within a status bucket (for future kanban / drag-drop). */
  order: number;
  // --- Ad-hoc billing (only meaningful on `adhoc` projects) ---
  /** Marks the task as a billable line item. */
  billable?: boolean;
  /** How this billable task is priced. Defaults to 'hourly'. */
  billingMode?: TaskBillingMode;
  /** Hours worked (hourly mode), used as the line item quantity. Defaults to 1. */
  billedHours?: number;
  /** Per-task hourly rate override (hourly mode). Falls back to the project's `hourlyRate`. */
  billedRate?: number;
  /** Flat price for the task (fixed mode). Used as the line item amount. */
  billedAmount?: number;
  /** Set once the task has been rolled into an invoice. Points at the
   *  `project_invoices` mirror row. Locks the task's billing fields. */
  invoiceId?: string;
  /** Human-facing invoice number for display on the task, when known. */
  invoiceNumber?: string;
  /** ISO timestamp the task was invoiced. */
  invoicedAt?: Date;
  /** ClickUp task ID when this task is linked to a ClickUp task. Sync source of truth. */
  clickupTaskId?: string;
  /** ClickUp task ID of the parent task when this is a subtask in ClickUp. */
  parentClickupTaskId?: string;
  /** Direct link to the ClickUp task (https://app.clickup.com/t/...). */
  clickupUrl?: string;
  /** ISO timestamp of the most recent successful ClickUp → app sync. */
  clickupSyncedAt?: Date;
  /** Last error message when an outbound (app → ClickUp) push failed. Cleared on success. */
  clickupSyncError?: string;
  /** Timestamp of the last failed outbound push. Cleared on success. */
  clickupSyncFailedAt?: Date;
  /** Timestamp while a local task is being created in ClickUp. Prevents duplicate pushes. */
  clickupSyncInFlightAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  createdBy: string;
}

/** Fields mirrored from ClickUp during inbound sync once a task is linked. */
export const CLICKUP_SYNCED_FIELDS = [
  'title',
  'description',
  'status',
  'priority',
  'dueDate',
] as const;

export type CreateTaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'completedAt' | 'order'> & {
  order?: number;
};

export type UpdateTaskInput = Partial<
  Pick<
    Task,
    | 'title'
    | 'description'
    | 'category'
    | 'status'
    | 'priority'
    | 'dueDate'
    | 'tags'
    | 'sourceLink'
    | 'slack'
    | 'dedupeKey'
    | 'pageUrl'
    | 'qaStatus'
    | 'isBlocker'
    | 'needsClientInput'
    | 'confidence'
    | 'assignee'
    | 'order'
    | 'source'
    | 'billable'
    | 'billingMode'
    | 'billedHours'
    | 'billedRate'
    | 'billedAmount'
    | 'clickupTaskId'
    | 'parentClickupTaskId'
    | 'clickupUrl'
    | 'clickupSyncedAt'
    | 'clickupSyncError'
    | 'clickupSyncFailedAt'
    | 'clickupSyncInFlightAt'
  >
>;

export type RequestSource = 'paste' | 'slack' | 'email';
export type RequestStatus = 'new' | 'parsed' | 'archived';

export interface ProjectRequest {
  id: string;
  projectId: string;
  rawText: string;
  source: RequestSource;
  /** Optional sender name/email if known (e.g. who sent the Slack message). */
  sender?: string;
  /** Optional source link back to Slack/email/feedback system. */
  sourceLink?: string;
  /** Structured Slack source metadata when this request came from Slack. */
  slack?: SlackSourceMetadata;
  /** Import dedupe key, usually channelId:messageTs for Slack. */
  dedupeKey?: string;
  /** Page or asset URL detected from the request. */
  pageUrl?: string;
  /** Whether deterministic filtering thinks this request should become work. */
  isActionable?: boolean;
  /** True when the message indicates client input is needed. */
  needsClientInput?: boolean;
  /** True when the message indicates release/client progress is blocked. */
  isBlocker?: boolean;
  /** 0-1 confidence for AI/deterministic extraction. */
  confidence?: number;
  /** When the request was received (ISO). */
  receivedAt: Date;
  /** When AI parsing finished (ISO). */
  parsedAt?: Date;
  status: RequestStatus;
  /** IDs of tasks generated from this request. */
  taskIds: string[];
  createdBy: string;
}

/** AI-parsed task suggestion returned from /api/tasks/parse-request. */
export interface ParsedTaskSuggestion {
  title: string;
  description?: string;
  category: TaskCategory;
  priority: TaskPriority;
}

// --- WEBSITE DELIVERY ---
// The page-level model lives in src/modules/delivery; these two shapes sit on
// the project document itself, so they live here with the rest of Project and
// the module re-exports them.

/** Technologies a site is built on. Adding one is a stack definition, not a code path. */
export type StackId = 'webflow' | 'astro-sanity' | 'next-storyblok';

/** A person's answer to a launch checklist item. */
export type CheckStatus = 'pending' | 'passed' | 'failed' | 'not_required';

/** Site-wide delivery state. Pages live in the `pages` subcollection. */
export interface ProjectDeliveryState {
  stackId?: StackId;
  /**
   * This project's per-page QC questions, seeded from the stack the first time
   * the Launch stage opens and editable afterwards. Stored per project because
   * no two builds ask exactly the same things.
   *
   * Kickoff and the site-wide launch list are NOT here — those are sections of
   * the project's checklist, tagged with a stage.
   */
  // Deliberately the same shape as the delivery module's `StackCheck`, field
  // for field: `pageChecksFor` hands these straight to `resolveCheck`, so a
  // second name for the scan signal would silently lose it.
  pageChecks?: { id: string; title: string; group: string; order: number; auto?: AutoCheckId; note?: string }[];
  /**
   * Stages the client has signed off, keyed by the stage's own key.
   *
   * Written only by the portal route, from a link the client was given. It is a
   * record of what they said, never a status the team sets on their behalf, and
   * it deliberately does not tick any internal item: an unauthenticated action
   * must not complete our own work for us.
   */
  approvals?: StageApproval[];
  /** How often the team and client sync; drives the "no call recently" nudge. */
  callCadence?: 'weekly' | 'biweekly' | 'none';
  lastSyncCallAt?: string;
  /** The generated Google Sheet, once sheet sync exists. */
  trackerSheetId?: string;
  trackerSheetUrl?: string;
  trackerSyncedAt?: string;
}

// --- CLIENT PORTAL / CLIENT-FACING TYPES ---

/**
 * Status the team sets for the client's eyes. Deliberately separate from the
 * internal/commercial `ProjectStatus` (current/paused/closed/paid).
 */
export type ClientStatus = 'on_track' | 'needs_client' | 'blocked' | 'paused' | 'delivered';

export const CLIENT_STATUSES: ClientStatus[] = ['on_track', 'needs_client', 'blocked', 'paused', 'delivered'];

/** Internal wording (dashboard chips, editors). */
export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  on_track: 'On track',
  needs_client: 'Waiting on client',
  blocked: 'Blocked',
  paused: 'Paused',
  delivered: 'Delivered',
};

/** Softer wording shown to the client on the portal. */
export const CLIENT_STATUS_PORTAL_LABELS: Record<ClientStatus, string> = {
  on_track: 'On track',
  needs_client: 'Waiting on you',
  blocked: 'On hold',
  paused: 'Paused',
  delivered: 'Delivered',
};

export function normalizeClientStatus(raw: unknown): ClientStatus {
  return (CLIENT_STATUSES as string[]).includes(raw as string) ? (raw as ClientStatus) : 'on_track';
}

/** Per-project portal settings. Written by the team through the client SDK. */
export interface ClientPortalSettings {
  /** Master switch. The token is only honoured while this is strictly `true`. */
  enabled: boolean;
  /** ISO timestamp of the last issue/rotate, for the Client tab. */
  tokenIssuedAt?: string;
  /** sha256 of the live token. Server-managed; a link only resolves when the
   *  token record it names is active. Firestore rules keep the client SDK
   *  from changing it. */
  activeTokenHash?: string;
  /** Overrides `Project.client` as the name in the portal header. */
  brandName?: string;
  /** Overrides `Project.logoUrl` in the portal header. */
  brandLogoUrl?: string;
  /** One short welcome line under the project name. */
  welcome?: string;
  /** Client contacts (informational until per-contact tokens exist). */
  contactEmails?: string[];
}

/**
 * Client-facing state. `status`, `statusNote`, `currentPhaseId`, `lastUpdateAt`
 * and `lastUpdateBy` are written by the team (client SDK, bumps `updatedAt`).
 * The view counters are written only by firebase-admin from the portal beacon
 * with a merge that never touches `updatedAt`, so client opens do not reshuffle
 * the updatedAt-sorted project lists.
 */
export interface ClientFacingState {
  status?: ClientStatus;
  /** One line the client sees under the status chip. */
  statusNote?: string;
  /** Phase id from project_timelines/{projectId}.phases[]; drives the stepper. */
  currentPhaseId?: string;
  /** ISO timestamp of the last "Mark updated" / status edit. */
  lastUpdateAt?: string;
  lastUpdateBy?: string;
  /** Open asks awaiting the client, mirrored from tasks flagged needsClientInput. */
  openRequestCount?: number;
  viewCount?: number;
  lastViewedAt?: string;
  lastViewCountry?: string;
  lastViewCity?: string;
}


