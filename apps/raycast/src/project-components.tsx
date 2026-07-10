import {
  Action,
  ActionPanel,
  Color,
  Detail,
  Form,
  Icon,
  Image,
  List,
  Toast,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PROJECT_STATUSES,
  PROJECT_TAGS,
  STATUS_LABELS,
  TAG_LABELS,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  appUrl,
  addProjectLink,
  createTask,
  deleteProjectLink,
  fetchAssignees,
  fetchProject,
  fetchProjects,
  fetchTasks,
  patchProject,
  setProjectReviewed,
  startProjectScan,
  updateProjectLink,
} from "./api";
import type { ClickUpSyncResult, Project, ProjectLink, ProjectStatus, ProjectTag, Task, TaskCategory, TaskPriority } from "./types";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value?: string): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export function projectIcon(project: Project) {
  if (project.logoUrl) return { source: project.logoUrl, mask: Image.Mask.RoundedRectangle, fallback: Icon.Folder };
  return { source: Icon.Folder, tintColor: project.status === "current" ? Color.Green : Color.SecondaryText };
}

function taskIcon(task: Task) {
  if (task.status === "done") return { source: Icon.CheckCircle, tintColor: Color.Green };
  if (task.status === "blocked") return { source: Icon.ExclamationMark, tintColor: Color.Red };
  if (task.priority === "urgent") return { source: Icon.ExclamationMark, tintColor: Color.Orange };
  return { source: Icon.Circle, tintColor: Color.SecondaryText };
}

function syncMessage(sync?: ClickUpSyncResult): string {
  const first = sync?.results?.[0];
  if (!first) return "Task created";
  if (first.status === "synced") return "Task created and synced to ClickUp";
  if (first.reason === "list-not-bound") return "Task created. This project is not linked to a ClickUp list.";
  if (first.status === "failed") return `Task created. ClickUp sync failed: ${first.reason ?? "Unknown error"}`;
  return `Task created. ClickUp sync skipped: ${first.reason ?? sync?.skipped ?? "No reason"}`;
}

export function projectSubtitle(project: Project): string {
  const client = project.client ? `${project.client} · ` : "";
  const score = project.stats.averageAuditScore === null ? "No score" : `${project.stats.averageAuditScore}/100`;
  return `${client}${STATUS_LABELS[project.status]} · ${project.stats.manualLinks} links · ${project.stats.autoLinks} pages · ${score}`;
}

export function ProjectDetail({
  projectId,
  initialProject,
  onProjectChange,
}: {
  projectId: string;
  initialProject?: Project;
  onProjectChange?: (project: Project) => void;
}) {
  const { push } = useNavigation();
  const [project, setProject] = useState<Project | undefined>(initialProject);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(!initialProject);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [nextProject, nextTasks] = await Promise.all([fetchProject(projectId), fetchTasks(projectId)]);
      setProject(nextProject);
      setTasks(nextTasks);
      onProjectChange?.(nextProject);
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "Could not load project", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsLoading(false);
    }
  }, [onProjectChange, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const manualLinks = useMemo(() => project?.links.filter((link) => link.source !== "auto") ?? [], [project]);
  const openTasks = useMemo(() => tasks.filter((task) => task.status !== "done"), [tasks]);

  const setStatus = async (status: ProjectStatus) => {
    if (!project) return;
    const toast = await showToast({ style: Toast.Style.Animated, title: "Updating status" });
    try {
      const next = await patchProject(project.id, { status });
      setProject(next);
      onProjectChange?.(next);
      toast.style = Toast.Style.Success;
      toast.title = "Status updated";
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not update status";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  };

  const toggleTag = async (tag: ProjectTag) => {
    if (!project) return;
    const tags = project.tags.includes(tag) ? project.tags.filter((item) => item !== tag) : [...project.tags, tag];
    const next = await patchProject(project.id, { tags });
    setProject(next);
    onProjectChange?.(next);
  };

  const markReview = async (reviewed: boolean) => {
    if (!project) return;
    const next = await setProjectReviewed(project.id, reviewed);
    setProject(next);
    onProjectChange?.(next);
    await showToast({ style: Toast.Style.Success, title: reviewed ? "Project reviewed" : "Review undone" });
  };

  const runScan = async () => {
    if (!project) return;
    const toast = await showToast({ style: Toast.Style.Animated, title: "Starting scan" });
    try {
      const result = await startProjectScan(project.id);
      toast.style = Toast.Style.Success;
      toast.title = result.scanId ? "Scan started" : "No scan started";
      toast.message = result.message ?? (result.totalPages === 0 ? "No pages to scan" : undefined);
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not start scan";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  };

  if (!project && !isLoading) {
    return <Detail markdown="Project not found." />;
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Filter links and tasks..." navigationTitle={project?.name ?? "Project"}>
      {project ? (
        <List.Section title="Project" subtitle={projectSubtitle(project)}>
          <List.Item
            icon={projectIcon(project)}
            title={project.name}
            subtitle={project.client ?? "No client"}
            accessories={[
              { text: STATUS_LABELS[project.status] },
              { text: project.lastReviewDate === todayIso() ? "Reviewed Today" : "Needs Review", icon: project.lastReviewDate === todayIso() ? Icon.CheckCircle : Icon.Circle },
            ]}
            actions={
              <ActionPanel>
                <Action.Push title="Create Task" icon={Icon.PlusCircle} target={<CreateTaskForm initialProjectId={project.id} onCreated={refresh} />} />
                <Action.Push title="Add Link" icon={Icon.Link} target={<AddLinkForm project={project} onSaved={refresh} />} />
                <Action title="Start Audit Scan" icon={Icon.Play} onAction={runScan} />
                <Action.OpenInBrowser title="Open Web Dashboard" url={appUrl(`/modules/project-links/${project.id}`)} />
                <ActionPanel.Section title="Review">
                  {project.lastReviewDate === todayIso() ? (
                    <Action title="Undo Today's Review" icon={Icon.ArrowCounterClockwise} onAction={() => markReview(false)} />
                  ) : (
                    <Action title="Mark Reviewed Today" icon={Icon.CheckCircle} onAction={() => markReview(true)} />
                  )}
                </ActionPanel.Section>
                <ActionPanel.Submenu title="Set Status..." icon={Icon.Dot}>
                  {PROJECT_STATUSES.map((status) => (
                    <Action key={status} title={STATUS_LABELS[status]} onAction={() => setStatus(status)} />
                  ))}
                </ActionPanel.Submenu>
                <ActionPanel.Submenu title="Toggle Tag..." icon={Icon.Tag}>
                  {PROJECT_TAGS.map((tag) => (
                    <Action
                      key={tag}
                      title={`${project.tags.includes(tag) ? "Remove" : "Add"} ${TAG_LABELS[tag]}`}
                      onAction={() => toggleTag(tag)}
                    />
                  ))}
                </ActionPanel.Submenu>
                <Action.CopyToClipboard title="Copy Project ID" content={project.id} />
                <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={refresh} />
              </ActionPanel>
            }
          />
        </List.Section>
      ) : null}

      <List.Section title="Links" subtitle={`${manualLinks.length}`}>
        {manualLinks.map((link) => (
          <List.Item
            key={link.id}
            icon={Icon.Link}
            title={link.title}
            subtitle={link.url}
            actions={
              <ActionPanel>
                <Action.OpenInBrowser url={link.url} />
                <Action.CopyToClipboard title="Copy URL" content={link.url} />
                {project ? <Action.Push title="Edit Link" icon={Icon.Pencil} target={<EditLinkForm project={project} link={link} onSaved={refresh} />} /> : null}
                {project ? <Action title="Delete Link" icon={Icon.Trash} style={Action.Style.Destructive} onAction={async () => {
                  await deleteProjectLink(project.id, link.id);
                  await showToast({ style: Toast.Style.Success, title: "Link deleted" });
                  await refresh();
                }} /> : null}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      <List.Section title="Open Tasks" subtitle={`${openTasks.length}`}>
        {openTasks.map((task) => (
          <List.Item
            key={task.id}
            icon={taskIcon(task)}
            title={task.title}
            subtitle={task.description}
            accessories={[
              { text: task.priority },
              { text: task.status },
              ...(task.clickupTaskId ? [{ text: "ClickUp", icon: Icon.Link }] : []),
            ]}
            actions={
              <ActionPanel>
                {task.clickupUrl ? <Action.OpenInBrowser title="Open in ClickUp" url={task.clickupUrl} /> : null}
                {task.description ? <Action.CopyToClipboard title="Copy Description" content={task.description} /> : null}
                <Action.CopyToClipboard title="Copy Task ID" content={task.id} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}

export function CreateTaskForm({
  initialProjectId,
  onCreated,
}: {
  initialProjectId?: string;
  onCreated?: () => void | Promise<void>;
}) {
  const { pop } = useNavigation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [nextProjects, nextAssignees] = await Promise.all([
          fetchProjects(),
          fetchAssignees().catch(() => []),
        ]);
        if (!cancelled) {
          setProjects(nextProjects);
          setAssignees(nextAssignees);
        }
      } catch (error) {
        await showToast({ style: Toast.Style.Failure, title: "Could not load projects", message: error instanceof Error ? error.message : String(error) });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (values: {
    projectId: string;
    title: string;
    description?: string;
    category: TaskCategory;
    priority: TaskPriority;
    dueDate?: string;
    assignee?: string;
  }) => {
    const toast = await showToast({ style: Toast.Style.Animated, title: "Creating task" });
    try {
      const result = await createTask(values.projectId, {
        title: values.title,
        description: values.description,
        category: values.category,
        priority: values.priority,
        status: "todo",
        dueDate: values.dueDate,
        assignee: values.assignee === "__none__" ? undefined : values.assignee,
      });
      toast.style = Toast.Style.Success;
      toast.title = syncMessage(result.clickupSync);
      if (result.task.clickupUrl) {
        toast.message = result.task.clickupUrl;
      }
      await onCreated?.();
      pop();
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not create task";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  };

  return (
    <Form
      isLoading={isLoading}
      navigationTitle="Create Task"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Task" icon={Icon.PlusCircle} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="projectId" title="Project" defaultValue={initialProjectId}>
        {projects.map((project) => (
          <Form.Dropdown.Item key={project.id} value={project.id} title={project.name} />
        ))}
      </Form.Dropdown>
      <Form.TextField id="title" title="Title" placeholder="Fix hero spacing on mobile" />
      <Form.TextArea id="description" title="Description" placeholder="Optional context" />
      <Form.Dropdown id="category" title="Category" defaultValue="other">
        {TASK_CATEGORIES.map((category) => (
          <Form.Dropdown.Item key={category} value={category} title={category} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown id="priority" title="Priority" defaultValue="medium">
        {TASK_PRIORITIES.map((priority) => (
          <Form.Dropdown.Item key={priority} value={priority} title={TASK_PRIORITY_LABELS[priority]} />
        ))}
      </Form.Dropdown>
      <Form.TextField id="dueDate" title="Due Date" placeholder="YYYY-MM-DD" />
      <Form.Dropdown id="assignee" title="Assignee" defaultValue="__none__">
        <Form.Dropdown.Item value="__none__" title="Unassigned" />
        {assignees.map((email) => (
          <Form.Dropdown.Item key={email} value={email} title={email} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}

export function AddLinkForm({ project, onSaved }: { project: Project; onSaved?: () => void | Promise<void> }) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle="Add Link"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Add Link"
            icon={Icon.Link}
            onSubmit={async (values: { title: string; url: string }) => {
              await addProjectLink(project.id, values);
              await showToast({ style: Toast.Style.Success, title: "Link added" });
              await onSaved?.();
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="title" title="Title" placeholder="Staging" />
      <Form.TextField id="url" title="URL" placeholder="https://example.com" />
    </Form>
  );
}

export function EditLinkForm({
  project,
  link,
  onSaved,
}: {
  project: Project;
  link: ProjectLink;
  onSaved?: () => void | Promise<void>;
}) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle="Edit Link"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Link"
            icon={Icon.CheckCircle}
            onSubmit={async (values: { title: string; url: string }) => {
              await updateProjectLink(project.id, link.id, values);
              await showToast({ style: Toast.Style.Success, title: "Link updated" });
              await onSaved?.();
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="title" title="Title" defaultValue={link.title} />
      <Form.TextField id="url" title="URL" defaultValue={link.url} />
    </Form>
  );
}
