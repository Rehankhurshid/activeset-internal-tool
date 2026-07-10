import { Action, ActionPanel, Color, Detail, Icon, List, Toast, showToast } from "@raycast/api";
import { useEffect, useState } from "react";
import { appUrl, fetchRunningScans } from "./api";
import type { ScanJob } from "./types";

function scanIcon(scan: ScanJob) {
  if (scan.status === "completed") return { source: Icon.CheckCircle, tintColor: Color.Green };
  if (scan.status === "failed" || scan.status === "cancelled") return { source: Icon.XMarkCircle, tintColor: Color.Red };
  return { source: Icon.CircleProgress, tintColor: Color.Blue };
}

function scanMarkdown(scan: ScanJob): string {
  return [
    `# ${scan.projectName ?? scan.projectId}`,
    "",
    `- Status: ${scan.status}`,
    `- Progress: ${scan.current}/${scan.total} (${scan.percentage}%)`,
    `- Current URL: ${scan.currentUrl ?? "None"}`,
    `- Started: ${scan.startedAt ?? "Unknown"}`,
    `- Screenshots: ${scan.captureScreenshots ? "Yes" : "No"}`,
    `- Collections: ${scan.scanCollections ? "Included" : "Skipped"}`,
  ].join("\n");
}

export default function Command() {
  const [scans, setScans] = useState<ScanJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = async () => {
    setIsLoading(true);
    try {
      setScans(await fetchRunningScans());
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "Could not load scans", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (!isLoading && scans.length === 0) {
    return (
      <Detail
        markdown="No project scans are currently running."
        actions={
          <ActionPanel>
            <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={refresh} />
          </ActionPanel>
        }
      />
    );
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search running scans...">
      {scans.map((scan) => (
        <List.Item
          key={scan.scanId}
          icon={scanIcon(scan)}
          title={scan.projectName ?? scan.projectId}
          subtitle={scan.currentUrl ?? scan.status}
          accessories={[{ text: `${scan.percentage}%` }, { text: `${scan.current}/${scan.total}` }]}
          actions={
            <ActionPanel>
              <Action.Push title="Show Details" icon={Icon.Text} target={<Detail markdown={scanMarkdown(scan)} />} />
              <Action.OpenInBrowser title="Open Web Dashboard" url={appUrl(`/modules/project-links/${scan.projectId}`)} />
              <Action.CopyToClipboard title="Copy Scan ID" content={scan.scanId} />
              <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={refresh} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
