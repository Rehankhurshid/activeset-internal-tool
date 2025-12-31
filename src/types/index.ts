export interface ProjectLink {
  id: string;
  title: string;
  url: string;
  order: number;
  isDefault?: boolean;
  auditResult?: AuditResult;
  source?: 'manual' | 'auto';
}

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
      score: number;
    };
    technical: {
      status: 'passed' | 'failed' | 'warning' | 'info';
      issues: string[];
      score: number;
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

// Section info for tracking
export interface SectionInfo {
  selector: string;
  headingText: string;
  wordCount: number;
  textPreview: string;
}

// Extended content snapshot with images/links/sections
export interface ExtendedContentSnapshot extends ContentSnapshot {
  images: ImageInfo[];
  links: LinkInfo[];
  sections: SectionInfo[];
  bodyTextHash: string;
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