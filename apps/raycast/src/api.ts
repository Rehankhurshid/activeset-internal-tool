import { getPreferenceValues } from "@raycast/api";
import type {
  ClickUpSyncResult,
  Project,
  ProjectLink,
  ProjectStatus,
  ProjectTag,
  ScanJob,
  Task,
  TaskCategory,
  TaskPriority,
  TaskStatus,
} from "./types";

interface Preferences {
  baseUrl: string;
  apiToken: string;
  userEmail?: string;
}

interface ApiResponse<T> {
  ok?: boolean;
  error?: string;
  [key: string]: unknown;
}

export const TAG_LABELS: Record<ProjectTag, string> = {
  retainer: "Retainer",
  one_time: "One Time",
  subscription: "Subscription",
  maintenance: "Maintenance",
  consulting: "Consulting",
};

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  current: "Current",
  closed: "Closed",
  paid: "Paid",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  blocked: "Blocked",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const PROJECT_TAGS = Object.keys(TAG_LABELS) as ProjectTag[];
export const PROJECT_STATUSES = Object.keys(STATUS_LABELS) as ProjectStatus[];
export const TASK_STATUSES = Object.keys(TASK_STATUS_LABELS) as TaskStatus[];
export const TASK_PRIORITIES = Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[];
export const TASK_CATEGORIES: TaskCategory[] = ["fix", "feature", "copy", "design", "bug", "content", "other"];

function preferences(): Preferences {
  const prefs = getPreferenceValues<Preferences>();
  return {
    ...prefs,
    baseUrl: prefs.baseUrl.replace(/\/$/, ""),
  };
}

export function appUrl(path: string): string {
  const { baseUrl } = preferences();
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { apiToken, userEmail } = preferences();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiToken}`);
  headers.set("Accept", "application/json");
  if (userEmail) headers.set("x-activeset-user-email", userEmail);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(appUrl(path), { ...init, headers });
  const data = (await response.json().catch(() => ({}))) as ApiResponse<T>;
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data as T;
}

export async function verifyConnection(): Promise<void> {
  await request("/api/raycast/me");
}

export async function fetchProjects(options: { includeLinks?: boolean } = {}): Promise<Project[]> {
  const suffix = options.includeLinks ? "?includeLinks=true" : "";
  const data = await request<{ projects: Project[] }>(`/api/raycast/projects${suffix}`);
  return data.projects ?? [];
}

export async function fetchProject(projectId: string): Promise<Project> {
  const data = await request<{ project: Project }>(`/api/raycast/projects/${encodeURIComponent(projectId)}`);
  return data.project;
}

export async function createProject(name: string): Promise<Project> {
  const data = await request<{ project: Project }>("/api/raycast/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return data.project;
}

export async function patchProject(projectId: string, patch: Partial<Pick<Project, "name" | "client" | "status" | "tags" | "sitemapUrl">>): Promise<Project> {
  const data = await request<{ project: Project }>(`/api/raycast/projects/${encodeURIComponent(projectId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return data.project;
}

export async function setProjectReviewed(projectId: string, reviewed: boolean): Promise<Project> {
  const data = await request<{ project: Project }>(`/api/raycast/projects/${encodeURIComponent(projectId)}/review`, {
    method: "POST",
    body: JSON.stringify({ reviewed }),
  });
  return data.project;
}

export async function addProjectLink(projectId: string, input: { title: string; url: string }): Promise<ProjectLink> {
  const data = await request<{ link: ProjectLink }>(`/api/raycast/projects/${encodeURIComponent(projectId)}/links`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.link;
}

export async function updateProjectLink(projectId: string, linkId: string, input: { title?: string; url?: string }): Promise<ProjectLink> {
  const data = await request<{ link: ProjectLink }>(
    `/api/raycast/projects/${encodeURIComponent(projectId)}/links/${encodeURIComponent(linkId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
  return data.link;
}

export async function deleteProjectLink(projectId: string, linkId: string): Promise<void> {
  await request(`/api/raycast/projects/${encodeURIComponent(projectId)}/links/${encodeURIComponent(linkId)}`, {
    method: "DELETE",
  });
}

export async function fetchTasks(projectId: string): Promise<Task[]> {
  const data = await request<{ tasks: Task[] }>(`/api/raycast/projects/${encodeURIComponent(projectId)}/tasks`);
  return data.tasks ?? [];
}

export async function createTask(
  projectId: string,
  input: {
    title: string;
    description?: string;
    category?: TaskCategory;
    priority?: TaskPriority;
    status?: TaskStatus;
    dueDate?: string;
    assignee?: string;
  },
): Promise<{ task: Task; clickupSync?: ClickUpSyncResult }> {
  const data = await request<{ task: Task; clickupSync?: ClickUpSyncResult }>(
    `/api/raycast/projects/${encodeURIComponent(projectId)}/tasks`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return data;
}

export async function fetchAssignees(): Promise<string[]> {
  const data = await request<{ emails: string[] }>("/api/raycast/assignees");
  return data.emails ?? [];
}

export async function startProjectScan(projectId: string): Promise<{ scanId?: string | null; message?: string; totalPages?: number }> {
  return request(`/api/raycast/projects/${encodeURIComponent(projectId)}/scans`, {
    method: "POST",
    body: JSON.stringify({ options: { captureScreenshots: true } }),
  });
}

export async function fetchRunningScans(): Promise<ScanJob[]> {
  const data = await request<{ scans: ScanJob[] }>("/api/raycast/scans/running");
  return data.scans ?? [];
}
