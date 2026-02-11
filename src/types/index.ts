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
      checkedAt?: string; // ISO timestamp when links were last checked
      score: number;
    };
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

export interface Project {
  id: string;
  name: string;
  links: ProjectLink[];
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  webflowConfig?: WebflowConfig;
  sitemapUrl?: string; // For daily scheduled scans
  folderPageTypes?: FolderPageTypes; // Simple folder → CMS/Static mapping
  // Locale data extracted from sitemap hreflang
  detectedLocales?: string[]; // Canonical list of locales, e.g., ["en", "da", "es-ar", "pt-br"]
  pathToLocaleMap?: Record<string, string>; // Path prefix to locale mapping, e.g., { "/es": "es-ar", "/pt": "pt-br" }
}

export type CreateProjectInput = Pick<Project, 'name' | 'userId'>;
export type UpdateProjectInput = Partial<Pick<Project, 'name'>>;

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

// Individual checklist item
export interface ChecklistItem {
  id: string;
  title: string;
  emoji?: string;            // From the SOP (e.g., "🐸", "📑")
  status: ChecklistItemStatus;
  notes?: string;            // Free-text notes per item
  assignee?: string;         // Assigned team member email
  completedAt?: string;      // ISO date
  completedBy?: string;      // User email who completed it
  order: number;
}

// Section of the checklist (e.g., "Step 1: Project Planning & Kickoff")
export interface ChecklistSection {
  id: string;
  title: string;
  emoji?: string;            // Section emoji (e.g., "📁", "🧱")
  items: ChecklistItem[];
  order: number;
}

// Full project checklist
export interface ProjectChecklist {
  id: string;                // Firestore doc ID
  projectId: string;         // Reference to project
  templateId: string;        // e.g., "webflow_migration_v1"
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
}

// SOP template definition (for the template selector)
export interface SOPTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;              // Emoji icon
  sections: SOPTemplateSection[];
}