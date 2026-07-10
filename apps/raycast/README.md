# ActiveSet Projects Raycast Extension

Private Raycast extension for the Projects Dashboard.

## Setup

1. Set `RAYCAST_API_TOKEN` on the web app deployment.
2. Run `npm install` in this folder.
3. Run `npm run dev` to load the extension in Raycast.
4. In Raycast preferences, set:
   - `Base URL`: the deployed web app URL, for example `https://app.activeset.co`
   - `API Token`: the same value as `RAYCAST_API_TOKEN`
   - `User Email`: optional ActiveSet email used for task attribution

## Commands

- `Manage Projects`: browse projects, review them, edit status/tags, manage links, start scans, and create tasks.
- `Create Task`: quick task capture with project, priority, category, due date, assignee, and tags.
- `Open Project Link`: jump directly to manual project links.
- `Running Scans`: inspect active scan jobs.

Task creation calls the web app Raycast API, writes to Firestore, then reuses the existing ClickUp create-sync orchestration so bound projects create the matching ClickUp task.
