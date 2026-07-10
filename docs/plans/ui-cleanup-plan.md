# UI Cleanup Plan — Lighten the App, Remove Control

> **Executor notes (read first)**
> - Line numbers below were captured on 2026-07-10 against a working tree with uncommitted changes. Treat them as pointers, not gospel — **grep for the quoted symbols/classes before editing**.
> - Work phase by phase, in order. Run `npx tsc --noEmit` and a dev-server smoke check after each phase. Commit per phase.
> - Guiding principle for every visual change: **one border per box, one surface per band, fewer things per row.** When in doubt, delete decoration rather than restyle it.
> - Do NOT touch: `src/lib/api-auth.ts`, `src/lib/slack.ts`, `src/lib/nag-bot.ts`, `SLACK_BOT_TOKEN`, the `requests`/`tasks` Firestore collections, `Project.reviewOwnerEmail`, `Project.assigneeEmails`, `updateProjectAssignees`. These are shared with features that stay.

---

## Diagnosis (why the UI feels bulky)

1. **Band-stacking.** The project detail screen stacks 4–5 bordered/shadowed bands (header → info block → 4-metric pulse strip → tab bar → sync panel) before any real content.
2. **Border-in-border-in-border.** `OperationsPulsePanel` and `ProjectDetailWorkStrip` are bordered+shadowed panels containing 4 more bordered mini-cards each, plus an animated 4-step strip.
3. **Badge overload.** `ProjectCard` renders up to 6 micro-badges (`text-[10px] h-[18px]`) in one row, then a tag-pill row, then a people row, then a 3-cell bordered signal grid.
4. **Decorative noise.** Animated shimmer lines (`work-sweep-line`), pulsing live dots, entrance animations, gradient card backgrounds, hover-lift shadows — a bespoke "ops/pulse" animation layer on top of shadcn.
5. **Redundant data surfaces.** The detail pulse strip repeats the exact counts already shown as badges on the tabs directly beneath it.
6. **Inconsistency.** Three different ways to draw "a panel with a header" (shadcn `Card`, hand-rolled `<section>`, custom `.project-ops-panel`); 4 near-duplicate metric-tile components; 2 link-row renderers; `ClickUpListLinkCard` is a hardcoded-dark slab that ignores the theme.
7. **shadcn `Card` defaults are generous** (`py-6 px-6 gap-6`) and every screen inherits that air.

The home page (`src/app/page.tsx`) is the clean baseline — plain shadcn cards, token-based. The goal is to bring the project-links module back to that language.

---

## Phase 1 — Remove the Control module entirely

### 1a. Delete these files/directories

| Path | What it is |
|---|---|
| `src/components/control/` (whole dir, incl. `ProjectControlCenter.tsx`) | Control tab UI |
| `src/lib/daily-control.ts` | Core engine |
| `src/lib/daily-control-utils.ts` | Helpers (only imported by the engine + its test) |
| `src/lib/daily-control-utils.test.ts` | Tests |
| `src/app/api/cron/daily-control/route.ts` | Cron endpoint |
| `src/app/api/projects/[projectId]/control/` (whole dir: `run/`, `today/`) | Control endpoints |
| `src/app/api/projects/[projectId]/slack/` (whole dir) | Slack import — only caller was ProjectControlCenter |
| `src/app/api/projects/[projectId]/client-update/` (whole dir) | Client-update draft — only caller was ProjectControlCenter |
| `docs/features/daily-control.md` | Feature doc |

### 1b. Edit these files

**`src/modules/project-links/ui/screens/ProjectDetailScreen.tsx`**
- Remove `import { ProjectControlCenter } ...` (~L29).
- Remove `'control'` from `PRIMARY_DESKTOP_TAB_VALUES` (~L42) and from the valid tab-values array for `?tab=` resolution (~L59).
- Remove the `{ value: 'control', ... }` entry from `tabOptions` (~L290) — this kills the "Set Up" pill.
- Remove the `<TabsContent value="control">` block (~L431–436).
- Update/remove the comment about the daily-review banner landing on Control (~L54).
- Default tab stays `'audit'` — verify deep links `?tab=control` fall back gracefully.

**`src/components/projects/DailyReviewBanner.tsx`** (component stays — it belongs to the review flow)
- `focusedControlHref` (~L102) points to `?tab=control` — repoint to `?tab=tasks` and rename the button from "Open Control" to "Open Tasks" (~L179–195, incl. `aria-label`).

**`src/modules/project-links/infrastructure/project-links.repository.ts`**
- Remove `updateProjectControlSettings` from the interface (~L14–20) and its binding (~L34–35).

**`src/services/database.ts`**
- Remove the `updateProjectControlSettings` method (~L602–646).

**`src/types/index.ts`**
- Remove `DailyControlQaUrlSource` (~L326), `ClientUpdatePreferences` (~L328), `SlackSourceMetadata` (~L335) — verify no other importers first (grep each name).
- In the `Project` interface, remove the "Daily control loop configuration" block (~L378–390): `slackChannelIds`, `qaUrlSource`, `qaUrls`, `clientUpdatePreferences`. **KEEP `reviewOwnerEmail`** — used by `ProjectPeoplePicker`, `ProjectCard`, `ProjectDetailScreen`.
- Remove all `DailyControl*` types (~L847–955): `DailyControlSnapshotStatus`, `DailyControlSeverity`, `DailyControlSignal`, `DailyControlTaskRef`, `DailyControlChecklistGap`, `DailyControlTimelineRisk`, `DailyControlQaResult`, `DailyControlSummary`, `DailyControlClientUpdateDraft`, `DailyControlSnapshot`.

**`src/lib/constants.ts`**
- Remove `DAILY_CONTROL_SNAPSHOTS: 'daily_control_snapshots'` from `COLLECTIONS` (~L12).

**`firestore.rules`**
- Remove the `match /daily_control_snapshots/{id}` block (~L85–90). Deploy rules after merge.

**`vercel.json`**
- Remove the cron entry `{ "path": "/api/cron/daily-control", "schedule": "30 3 * * 1-5" }`.

**Docs:** remove Control mentions from `docs/features/README.md`, `docs/features/project-links.md`, and `.claude/CLAUDE.md` if present.

**Env:** `DAILY_CONTROL_TIME_ZONE` becomes unused — remove from `.env*` and Vercel env. Do **not** remove `SLACK_BOT_TOKEN` (used by nag-bot).

### 1c. Verify
- `grep -ri "daily.control\|ProjectControlCenter\|updateProjectControlSettings\|slackChannelIds\|qaUrlSource" src/` returns nothing.
- `npx tsc --noEmit` clean. App builds; project detail opens with Audit as default tab; `?tab=control` doesn't crash.
- (Data cleanup, manual/optional: the `daily_control_snapshots` Firestore collection can be deleted from the console.)

---

## Phase 2 — Design-system foundation (do before restyling screens)

Everything here is in `src/app/globals.css` and `src/components/ui/card.tsx`.

1. **Tighten the Card primitive.** In `card.tsx`, change the default from `gap-6 ... py-6` + `px-6` to `gap-4 ... py-4` + `px-4` (or add a `size="compact"` variant and use it module-wide — pick ONE approach and apply consistently). This single change removes most of the dead air everywhere.
2. **Delete the bespoke animation layer** in `globals.css` `@layer utilities` (~L298–391): `work-live-dot`, `work-sweep-line`, `work-activity-step`, `project-work-card`, `project-ops-panel` entrance animations. Remove every usage site (grep each class name). Subtle `transition-colors` on hover is the only motion cards need.
3. **Tokenize the tone palette.** The same 5-tone status color system (emerald/cyan/amber/violet/rose) is re-declared in ≥5 components (`TAG_FILTER_COLORS`, `TAG_COLORS`, `STATUS_BADGE_STYLES`, `OpsMetric`/`DetailPulseMetric`/`SyncMetric` tone maps). Create ONE shared module `src/lib/ui-tones.ts` exporting a `tone → className` map (badge variant + text/bg pairs), and replace all local copies.
4. **Radius discipline:** replace `rounded-2xl` (8 usages) and stray `rounded-xl` with the token scale (`rounded-lg` for cards, `rounded-md` for chips). Grep and sweep.

---

## Phase 3 — Dashboard screen (`ProjectLinksDashboardScreen.tsx`)

1. **Delete `OperationsPulsePanel` + `OpsMetric` + the Build/QA/Review/Ship strip** (in-file components, ~L518–618). If the 4 counts matter, render them as a single line of plain text under the page title (`text-sm text-muted-foreground`, e.g. "12 active · 4 in QA · 2 in review · 34 shipped") — no borders, no tiles, no animation.
2. **Collapse the toolbar to one row:** search input + status filter + New Project button. 
   - Replace the hand-rolled 6-button segmented control (~L339–367) with a shadcn `Select` or a `Tabs`/`TabsList` pill group — one primitive, small size.
   - Move tag filter chips behind the existing `Filter` icon as a `Popover`/`DropdownMenu` — chips only appear inline when a filter is active.
   - Delete the two stat `Badge`s (Projects / Links counts) or fold them into the plain-text line from step 1.
3. **Page header:** drop the pulsing live-dot; `h1` down to `text-xl` fixed (no responsive escalation to 3xl).
4. Keep `DailyReviewBanner` as-is (already repointed in Phase 1).
5. **Split the file:** extract the toolbar/filters into `src/modules/project-links/ui/components/DashboardToolbar.tsx`. Target: screen file under ~300 lines.

---

## Phase 4 — Project detail screen (`ProjectDetailScreen.tsx`)

1. **Delete `ProjectDetailWorkStrip` + `DetailPulseMetric`** (~L548–632). The tab badges already show these counts — pure duplication.
2. **Compact the header:** project name to `text-xl` fixed; merge the name/client/people rows into a tighter block (`space-y-1`); Share/Embed collapse into one dropdown or icon buttons.
3. **Tab bar:**
   - After Control removal there are 4 primary tabs (Audit, Links, Tasks, Webflow) + More. Keep that split.
   - `TabStatBadge`: keep counts but simplify — drop the dashed "unset" tone variant; if a feature isn't configured, show no badge at all (absence is lighter than a dashed "Not Set" pill).
   - The "More" button (~L643–700) hand-copies `TabsTrigger`'s class string. Extract the shared classes into a small `const` or wrap `TabsTrigger` with `asChild` so the two can't drift.
   - Keep the mobile `Sheet` selector, but it should map over the same `tabOptions` source (verify it already does; remove any duplication).
4. **Links tab wrapper:** replace the hand-rolled `<section className="rounded-lg border bg-card">` (~L439–465) with the shadcn `Card` (now compact per Phase 2), or better — drop the wrapper entirely and let `LinkList` sit directly in the panel with a simple `h2`.
5. **Remove the dead `useEffect`** with the empty body (~L77–82).
6. **Split the file:** extract `DesktopTabSelector`, `MobileTabSelector`, `TabStatBadge` into `src/modules/project-links/ui/components/ProjectTabs.tsx`. Target: screen file under ~400 lines.

---

## Phase 5 — ProjectCard (`src/components/projects/ProjectCard.tsx`) — the biggest win

Restructure each card to **3 visual rows maximum**:

1. **Row 1 — identity:** favicon/logo, project name, single status indicator (small colored dot + status word, NOT a bordered badge), overflow `⋯` menu. 
   - Delete from the inline badge row: the "· N links" text, `ChecklistProgressBadge`, `ProjectScanBadge`, `WF` badge, `CU` badge, `ProjectReviewToggle` pill. Review toggle moves into the `⋯` dropdown; the rest is information the detail screen owns.
2. **Row 2 — links:** keep `CardLinkItem` list (cap at 3 + expander) but strip each row: no bordered/shadowed favicon chip, no blurred/bordered hover action bar — favicon as plain `img`, actions as ghost icon buttons on hover, row height `min-h-9`.
3. **Row 3 — footer:** tags (max 2 pills + "+N") and `ProjectPeoplePicker` avatars on one line. Delete the separate tag row and the "Open Project" footer button — make the whole card header clickable to open the project instead.
4. **Delete the 3-cell `WorkSignal` grid** (~L484, component ~L606–629) entirely.
5. **Delete decoration:** accent stripe / `work-sweep-line` (~L226), pulsing dot, gradient `from-card via-card to-card/80` background (plain `bg-card`), `hover:-translate-y-0.5 hover:shadow-xl` (replace with `hover:border-foreground/20 transition-colors`).
6. **Split the file:** `CardLinkItem` to its own file. Target: under ~350 lines.

---

## Phase 6 — Tasks tab theme + density

1. **`ClickUpListLinkCard.tsx` — fix the black slab.** Replace all hardcoded `bg-neutral-950 / border-neutral-800 / text-neutral-100`, the radial-gradient header, and the custom `shadow-[0_18px_70px_-55px_...]` (~L162, ~L211) with theme tokens (`bg-card`, `border-border`, `text-foreground`, standard `Card`). It must look native in both light and dark mode. Replace its `SyncMetric` tiles (~L330) with the shared tone/metric approach from Phase 2.
2. **`TasksTab.tsx`:** 5 `SummaryCard`s with `text-2xl font-bold` values (~L107–113, ~L209) → one compact stat row: single bordered container, 5 columns separated by `divide-x`, values `text-lg font-semibold`, labels `text-xs text-muted-foreground`. Or plain inline text stats — no individual cards.

---

## Phase 7 — Consolidation & consistency sweep

1. **One metric tile.** After Phases 3–6 the `OpsMetric`/`DetailPulseMetric`/`WorkSignal` copies are gone; if any metric tile survives (e.g. in ClickUp card), it must be a single shared `StatTile` component using `ui-tones.ts`.
2. **One link row.** `CardLinkItem` (ProjectCard) vs `LinkItem.tsx` (Links tab) — keep `LinkItem` as the canonical component with a `variant="compact"` for cards, delete the other. (If the merge is risky, defer — but leave a TODO and keep styling identical.)
3. **One panel construct.** Grep for `className="rounded-lg border bg-card` hand-rolled sections and `.project-ops-panel` remnants — everything becomes shadcn `Card` or a plain unwrapped section.
4. **Micro-badge sweep:** grep `text-[10px]` — remaining occurrences move to `text-xs` with the standard `Badge` size; kill custom `h-[18px]` heights.
5. Confirm the module screens now visually match the home page (`src/app/page.tsx`) language: flat token-based cards, no gradients, no shimmer.

---

## Verification checklist (end of run)

- [ ] `npx tsc --noEmit` and `npm run build` pass.
- [ ] `grep -ri "daily.control\|ProjectControlCenter\|slackChannelIds" src/` → 0 hits.
- [ ] Grep 0 hits: `work-sweep-line`, `work-live-dot`, `project-ops-panel`, `bg-neutral-950` (in components), `rounded-2xl`.
- [ ] Dashboard: one-row toolbar, no pulse panel, cards show ≤3 rows each.
- [ ] Project detail: header → tabs → content, no metric strip between; tabs are Audit / Links / Tasks / Webflow / More; `?tab=control` falls back to Audit.
- [ ] Tasks tab renders consistently in **light mode** (no black slab).
- [ ] Mobile: tab Sheet lists 8 tabs (no Control); cards readable at 375px.
- [ ] Dark mode unaffected throughout.
- [ ] Vercel cron list no longer contains `daily-control`; Firestore rules deployed without the snapshots block.

## Explicitly out of scope (don't touch in this pass)

- `WebsiteAuditDashboardScreen.tsx` (3,652 lines), `ImageLibrary.tsx`, `WebflowPagesDashboard.tsx`, proposal module — splitting/restyling these is a separate effort. Only their *container* (tab panel) changes here.
- Any data-model or sync-logic changes beyond the Control removal.
- `AppNavigation` shell — already clean.
