import { Action, ActionPanel, Form, Icon, List, Toast, showToast, useNavigation } from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import {
  PROJECT_STATUSES,
  PROJECT_TAGS,
  STATUS_LABELS,
  TAG_LABELS,
  appUrl,
  createProject,
  fetchProjects,
  patchProject,
  setProjectReviewed,
  startProjectScan,
} from "./api";
import { CreateTaskForm, ProjectDetail, projectIcon, projectSubtitle } from "./project-components";
import type { Project, ProjectStatus, ProjectTag } from "./types";

type Filter = "all" | "maintenance" | "active" | "closed" | "paid" | "needs_review";

const MAINTENANCE_TAGS: ProjectTag[] = ["retainer", "maintenance", "subscription"];
const ACTIVE_TAGS: ProjectTag[] = ["one_time", "consulting"];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function matchesFilter(project: Project, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "needs_review") return project.status === "current" && project.tags.length > 0 && project.lastReviewDate !== todayIso();
  if (filter === "closed" || filter === "paid") return project.status === filter;
  if (project.status !== "current") return false;
  const tags = filter === "maintenance" ? MAINTENANCE_TAGS : ACTIVE_TAGS;
  return tags.some((tag) => project.tags.includes(tag));
}

function projectAccessories(project: Project) {
  return [
    ...(project.webflowConfig ? [{ text: "WF" }] : []),
    ...(project.clickupListId ? [{ text: "CU" }] : []),
    { text: STATUS_LABELS[project.status] },
    {
      text: project.lastReviewDate === todayIso() ? "Reviewed" : "Review",
      icon: project.lastReviewDate === todayIso() ? Icon.CheckCircle : Icon.Circle,
    },
  ];
}

export default function Command() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<Filter>("maintenance");
  const [isLoading, setIsLoading] = useState(true);

  const refresh = async () => {
    setIsLoading(true);
    try {
      setProjects(await fetchProjects());
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "Could not load projects", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const filteredProjects = useMemo(() => projects.filter((project) => matchesFilter(project, filter)), [filter, projects]);

  const upsertProject = (next: Project) => {
    setProjects((current) => current.map((project) => (project.id === next.id ? next : project)));
  };

  const setStatus = async (project: Project, status: ProjectStatus) => {
    const next = await patchProject(project.id, { status });
    upsertProject(next);
    await showToast({ style: Toast.Style.Success, title: "Status updated" });
  };

  const toggleTag = async (project: Project, tag: ProjectTag) => {
    const tags = project.tags.includes(tag) ? project.tags.filter((item) => item !== tag) : [...project.tags, tag];
    const next = await patchProject(project.id, { tags });
    upsertProject(next);
    await showToast({ style: Toast.Style.Success, title: "Tags updated" });
  };

  const markReview = async (project: Project, reviewed: boolean) => {
    const next = await setProjectReviewed(project.id, reviewed);
    upsertProject(next);
    await showToast({ style: Toast.Style.Success, title: reviewed ? "Project reviewed" : "Review undone" });
  };

  const runScan = async (project: Project) => {
    const toast = await showToast({ style: Toast.Style.Animated, title: "Starting scan" });
    try {
      const result = await startProjectScan(project.id);
      toast.style = Toast.Style.Success;
      toast.title = result.scanId ? "Scan started" : "No scan started";
      toast.message = result.message;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not start scan";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  };

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search projects..."
      searchBarAccessory={
        <List.Dropdown tooltip="Filter" value={filter} onChange={(value) => setFilter(value as Filter)}>
          <List.Dropdown.Item title="Maintenance" value="maintenance" />
          <List.Dropdown.Item title="Active" value="active" />
          <List.Dropdown.Item title="Needs Review" value="needs_review" />
          <List.Dropdown.Item title="All" value="all" />
          <List.Dropdown.Item title="Closed" value="closed" />
          <List.Dropdown.Item title="Paid" value="paid" />
        </List.Dropdown>
      }
    >
      {filteredProjects.map((project) => (
        <List.Item
          key={project.id}
          icon={projectIcon(project)}
          title={project.name}
          subtitle={projectSubtitle(project)}
          accessories={projectAccessories(project)}
          actions={
            <ActionPanel>
              <Action.Push title="Open Project" icon={Icon.Sidebar} target={<ProjectDetail projectId={project.id} initialProject={project} onProjectChange={upsertProject} />} />
              <Action.Push title="Create Task" icon={Icon.PlusCircle} target={<CreateTaskForm initialProjectId={project.id} onCreated={refresh} />} />
              <Action.OpenInBrowser title="Open Web Dashboard" url={appUrl(`/modules/project-links/${project.id}`)} />
              <Action title="Start Audit Scan" icon={Icon.Play} onAction={() => runScan(project)} />
              <ActionPanel.Section title="Review">
                {project.lastReviewDate === todayIso() ? (
                  <Action title="Undo Today's Review" icon={Icon.ArrowCounterClockwise} onAction={() => markReview(project, false)} />
                ) : (
                  <Action title="Mark Reviewed Today" icon={Icon.CheckCircle} onAction={() => markReview(project, true)} />
                )}
              </ActionPanel.Section>
              <ActionPanel.Submenu title="Set Status..." icon={Icon.Dot}>
                {PROJECT_STATUSES.map((status) => (
                  <Action key={status} title={STATUS_LABELS[status]} onAction={() => setStatus(project, status)} />
                ))}
              </ActionPanel.Submenu>
              <ActionPanel.Submenu title="Toggle Tag..." icon={Icon.Tag}>
                {PROJECT_TAGS.map((tag) => (
                  <Action key={tag} title={`${project.tags.includes(tag) ? "Remove" : "Add"} ${TAG_LABELS[tag]}`} onAction={() => toggleTag(project, tag)} />
                ))}
              </ActionPanel.Submenu>
              <Action.Push title="New Project" icon={Icon.Plus} target={<CreateProjectForm onCreated={(created) => {
                setProjects((current) => [created, ...current]);
              }} />} />
              <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={refresh} />
              <Action.CopyToClipboard title="Copy Project ID" content={project.id} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function CreateProjectForm({ onCreated }: { onCreated: (project: Project) => void }) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle="New Project"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Create Project"
            icon={Icon.PlusCircle}
            onSubmit={async (values: { name: string }) => {
              const project = await createProject(values.name);
              await showToast({ style: Toast.Style.Success, title: "Project created" });
              onCreated(project);
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Name" placeholder="Client Website" />
    </Form>
  );
}
