# Tasks And ClickUp Sync

The project Tasks tab manages local project tasks and can connect them to ClickUp at two levels:

- Project list binding stores `projects/{projectId}.clickupListId` and `clickupListName`.
- Per-task binding stores `tasks/{taskId}.clickupTaskId`, `clickupUrl`, and `clickupSyncedAt`.

## Local Task To ClickUp

When a project has a linked ClickUp list, creating a local task triggers `/api/clickup/sync-create` in the background. The Tasks tab also exposes:

- `Sync local` on the ClickUp list card to push existing unlinked local tasks into the linked list.
- Per-task `Create` in the ClickUp link dialog to create one ClickUp task and link it back.
- Per-task existing URL/id linking through `/api/clickup/link`.

`/api/clickup/sync-create` uses `clickupSyncInFlightAt` as a short-lived Firestore lock. Concurrent browser tabs, background auto-sync, and manual retries skip tasks with a fresh lock instead of creating duplicate ClickUp tasks. Locks older than two minutes are treated as stale so the UI can retry after a crashed request. Failed pushes store `clickupSyncError` and `clickupSyncFailedAt`; successful creates and manual links clear those fields.

## ClickUp To Local

Linking a ClickUp list bulk-imports its tasks and subtasks. Webhooks keep linked tasks updated. If a ClickUp task moves out of the linked list, the local task is kept but unlinked.

## Field Ownership

Linked tasks sync these fields between the dashboard and ClickUp:

- Title and description.
- Status and priority.
- Due date.
- Assignee, when the assignee email maps to a ClickUp workspace member.

Category, request source, and local ordering stay local to the dashboard.
