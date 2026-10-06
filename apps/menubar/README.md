# ActiveSet Bar (macOS menu bar)

A native menu bar app for jumping to any project, project tab or project link
in a couple of keystrokes. It reads the same `/api/raycast/projects` facade as
the Raycast extension, so it needs the shared `RAYCAST_API_TOKEN`.

## Build and install

Needs macOS 14+ and the Xcode command line tools (`swift`).

```bash
apps/menubar/build.sh --install
```

That builds `ActiveSet Bar.app`, copies it to `~/Applications` and launches it.
On first open it shows Settings: paste the token (the same one the Raycast
extension uses) and your email. It adds itself as a login item on first launch
(macOS shows a "Login Item Added" notice); turn **Open at login** off in
Settings if you don't want that.

## Using it

- Click the grid icon in the menu bar, press **⌃⌥A** anywhere, or open the app
  again from Spotlight/Raycast.
- Type to search across projects, project tabs (Delivery, Checklist, Timeline,
  Client, Tasks, Audit, Webflow…), the Webflow Designer and staging/live site,
  and every link saved on a project. `dream check` → DreamTeam › Checklist.
- **↑↓** (or ⌃N/⌃P) move, **↩** opens in the browser, **→**/**Tab** steps into a
  project, **⌘↩** copies the URL, **esc**/**←**/**⌫** step back, **⌘R**
  refreshes, **⌘,** settings. Right-click the icon for Refresh/Settings/Quit.
- **⌘1–⌘9** open the first nine tabs of the selected project directly.
- Each project row shows the stage the client's page is on (`Web Design · 2/5 ·
  33%`) and badges for client status, open asks, overdue and open tasks.
- The pane on the right shows the selected project: the client page stage,
  checklist progress and the next steps, the next Timeline milestone, open
  tasks, client page views, the project sheet, the team and the last review.
- Open tasks (they open in ClickUp when linked) and the next checklist steps
  are results too, as is the project sheet.
- Inside a project the filter also searches the site's scanned pages.
- With no query, the five most recently opened projects sit on top; paid, past
  and closed projects are hidden until you search.

## How it works

- `Sources/ActiveSetBar/Model.swift`: API call, settings, disk cache. The
  per-project `summary` comes from `src/lib/raycast-summary.ts` on the server;
  until that is deployed the rows fall back to client and tag.
- `Sources/ActiveSetBar/Store.swift`: builds and ranks the list (tabs, site
  and links per project; the tab list mirrors `ProjectDetailScreen.tsx`).
- `Sources/ActiveSetBar/Views.swift`: the SwiftUI panel and settings.
- `Sources/ActiveSetBar/main.swift`: status item, the borderless panel (it
  takes keys without stealing focus from the app you were in), keyboard
  routing and the Carbon hotkey (no Accessibility permission needed).

Projects are cached in `~/Library/Application Support/ActiveSetBar/projects.json`
so the panel opens instantly; it refreshes in the background when the cache is
older than two minutes. The token is kept in `token` in the same folder (mode
0600), not the Keychain: the app is ad-hoc signed, so every rebuild would ask
for the login password again.
