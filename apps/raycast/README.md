# ActiveSet Projects Raycast Extension

Private Raycast extension for the Projects Dashboard. Talks to the production
app at `https://app.activeset.co` via the `/api/raycast/*` API.

## Commands

- `Manage Projects`: browse projects, review them, edit status/tags, manage links, start scans, and create tasks.
- `Create Task`: quick task capture with project, priority, category, due date, assignee, and tags.
- `Open Project Link`: jump directly to manual project links.
- `Running Scans`: inspect active scan jobs.

Task creation calls the web app Raycast API, writes to Firestore, then reuses
the existing ClickUp create-sync orchestration so bound projects create the
matching ClickUp task.

## Publishing to the team (owner, one-time per release)

1. `cd apps/raycast && npm install`
2. `npx ray login` (authenticates with your Raycast account)
3. `npx ray publish` — publish under the ActiveSet Raycast organization so it
   stays private to the team. Raycast will prompt to set the `owner` field in
   `package.json` on first publish; commit that change.

## Teammate setup (after the extension is in the team store)

1. Install "ActiveSet Projects" from the Raycast team store.
2. On first run, fill in the extension preferences:
   - **App Base URL**: `https://app.activeset.co` (pre-filled)
   - **Raycast API Token**: shared team token — get it from Rehan via the
     password manager. Never paste it in Slack/email.
   - **User Email**: your `@activeset.co` email (used for task attribution
     and review updates).

## Local development

1. Set `RAYCAST_API_TOKEN` in the web app's `.env.local` (any value; must
   match what you enter in Raycast preferences).
2. `npm install && npm run dev` in this folder to load the extension in
   dev mode, pointing Base URL at `http://localhost:3000`.
