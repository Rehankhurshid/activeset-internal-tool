import { Action, ActionPanel, Icon, List, Toast, showToast } from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import { appUrl, fetchProjects } from "./api";
import { ProjectDetail } from "./project-components";
import type { Project, ProjectLink } from "./types";

interface LinkRow {
  project: Project;
  link: ProjectLink;
}

export default function Command() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = async () => {
    setIsLoading(true);
    try {
      setProjects(await fetchProjects({ includeLinks: true }));
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "Could not load links", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const rows = useMemo<LinkRow[]>(
    () =>
      projects.flatMap((project) =>
        project.links
          .filter((link) => link.source !== "auto")
          .map((link) => ({ project, link })),
      ),
    [projects],
  );

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search project links...">
      {rows.map(({ project, link }) => (
        <List.Item
          key={`${project.id}:${link.id}`}
          icon={Icon.Link}
          title={link.title}
          subtitle={project.name}
          accessories={[{ text: link.url }]}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser url={link.url} />
              <Action.CopyToClipboard title="Copy URL" content={link.url} />
              <Action.Push title="Open Project" icon={Icon.Sidebar} target={<ProjectDetail projectId={project.id} initialProject={project} />} />
              <Action.OpenInBrowser title="Open Web Dashboard" url={appUrl(`/modules/project-links/${project.id}?tab=links`)} />
              <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={refresh} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
