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
export interface AuditResult {
  score: number;
  summary: string;
  canDeploy: boolean;
  fullHash?: string;
  contentHash?: string;
  changeStatus?: ChangeStatus;
  lastRun: string; // ISO date string
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