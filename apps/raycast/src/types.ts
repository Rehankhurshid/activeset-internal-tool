export type ProjectStatus = "current" | "closed" | "paid";
export type ProjectTag = "retainer" | "one_time" | "subscription" | "maintenance" | "consulting";
export type TaskStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done" | "blocked";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskCategory = "fix" | "feature" | "copy" | "design" | "bug" | "content" | "other";

export interface ProjectLink {
  id: string;
  title: string;
  url: string;
  order: number;
  isDefault?: boolean;
  source?: "manual" | "auto";
  auditResult?: {
    score?: number;
    canDeploy?: boolean;
    changeStatus?: "NO_CHANGE" | "TECH_CHANGE_ONLY" | "CONTENT_CHANGED" | "SCAN_FAILED";
    lastRun?: string;
    summary?: string;
  };
}

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  tags: ProjectTag[];
  client?: string;
  logoUrl?: string;
  sitemapUrl?: string;
  clickupListId?: string;
  clickupListName?: string;
  webflowConfig?: {
    siteId?: string;
    siteName?: string;
    customDomain?: string;
    hasApiToken?: boolean;
  };
  lastReviewDate?: string;
  lastReviewedAt?: string;
  lastReviewedBy?: string;
  reviewStreak?: number;
  createdAt?: string;
  updatedAt?: string;
  links: ProjectLink[];
  stats: {
    manualLinks: number;
    autoLinks: number;
    scannedPages: number;
    averageAuditScore: number | null;
    blockers: number;
    contentChanges: number;
    failedScans: number;
    openTasks?: number;
  };
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  category: TaskCategory;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  tags?: string[];
  source: "manual" | "paste" | "slack" | "email" | "clickup";
  assignee?: string;
  clickupTaskId?: string;
  clickupUrl?: string;
  clickupSyncError?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

export interface ClickUpSyncResult {
  ok: boolean;
  skipped?: string;
  results?: Array<{
    taskId: string;
    status: "synced" | "skipped" | "failed";
    reason?: string;
    clickupTaskId?: string;
    clickupUrl?: string;
  }>;
}

export interface ScanJob {
  scanId: string;
  projectId: string;
  projectName?: string;
  status: string;
  current: number;
  total: number;
  percentage: number;
  currentUrl?: string;
  startedAt?: string;
  scanCollections?: boolean;
  captureScreenshots?: boolean;
}
