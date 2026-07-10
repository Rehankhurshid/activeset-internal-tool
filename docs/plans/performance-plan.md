# Performance Plan — Make the App Fast

> **Executor notes (read first)**
> - Line numbers were captured on 2026-07-10 at commit `052a5cc`. Grep for the quoted symbols before editing — don't trust line numbers blindly.
> - Work phase by phase, in order — phases are sorted by impact-per-risk, cheapest wins first. Run `npx tsc --noEmit` after each phase; run `npx next build` after bundle-affecting phases and record the chunk sizes. Commit per phase.
> - **Do not change any Firestore write paths' data semantics** except where a phase explicitly says so. The embed widget (`/embed`, `/view/[id]`), share links (`/share/project-links/[token]`), and the Raycast API (`/api/raycast/*`) all read the same data — verify they still work after each data-layer phase.
> - The app has a local-dev bypass mode (`isLocalProjectBypassEnabled()` in `database.ts`) — keep it working; it's how local dev runs without Firestore.

## Baseline (measure before starting, re-measure after each phase)

- Total client JS: **5.8 MB** in `.next/static/chunks` (measure: `du -sh .next/static/chunks` after `npx next build`).
- Dashboard load: full `projects` collection (47 docs, all fields incl. base64 logos) **+ one `getDocs` of the `link_audits` subcollection per project** → thousands of reads per page view, re-fired on any write by anyone.
- Detail route bundles ~8,000 lines of tab screens statically; only one tab renders.
- Every route is client-rendered behind an empty server shell; first paint waits for Firebase auth + Firestore SDK boot (~300 kB+ parsed on every page including login).

Success targets: dashboard Firestore reads per load drop from thousands to ~50; detail-route initial JS drops by well over half; first contentful paint no longer gated on Firebase auth resolution.

---

## Phase 1 — Kill the Firestore N+1 (biggest win, no UX change)

**1a. Dashboard: stop merging audit results entirely.**
`src/services/database.ts` — `subscribeToAllProjects` (~L983-1018) runs, inside its `onSnapshot` callback:
```ts
await Promise.all(projects.map(async (project) => {
  project.links = await mergeAuditResults(project.id, project.links);  // getDocs per project, per fire
}));
```
`ProjectCard` renders only `name/status/tags/manual links/logoUrl/assigneeEmails` — it never reads `link.auditResult`. Remove the `mergeAuditResults` fan-out from `subscribeToAllProjects` (delete the block, keep the rest of the callback). If any dashboard-path consumer turns out to reference `auditResult` (grep first: `DailyReviewBanner`, `ProjectCard`, `CardLinkItem`, dashboard screen), it only needs link *counts*, not audit content.
⚠️ `ProjectDetailScreen` uses `subscribeToProject`, not this — safe. But **check `ClientProjectsScreen` / `clients/[client]` route and `ProjectLinksPageScreen`** for other `subscribeToAllProjects` callers and confirm none render audit data.

**1b. Detail: make the audit merge incremental.**
`subscribeToProject` (~L1021-1054) re-runs a full `getDocs(link_audits)` on every project-doc snapshot — and every link edit bumps `updatedAt`, so each save re-reads N audit docs. Replace with two listeners composed in the same subscribe function:
- `onSnapshot(doc)` for the project document,
- `onSnapshot(collection link_audits)` using `snapshot.docChanges()` to maintain an in-memory `Map<linkId, AuditResult>` — only changed docs transfer after the initial read.
Merge the map into `project.links` before invoking the callback. Unsubscribe both in the returned cleanup.

**1c. Detail: subscribe to audit data lazily.**
Only the Audit tab needs `auditResult`. If 1b is done cleanly, this is optional; if 1b gets complicated, the simpler alternative: keep `subscribeToProject` audit-free and let `WebsiteAuditDashboardScreen` fetch/subscribe to `link_audits` itself when mounted. Pick ONE approach — do not do both.

**Verify:** open dashboard with Network tab → Firestore channel traffic should show ~47 doc reads and zero `link_audits` reads. Edit a project status from a second tab → the first tab receives one changed doc, not a full re-read storm.

## Phase 2 — Bundle quick wins

**2a. Lazy-load the detail tabs.** `src/modules/project-links/ui/screens/ProjectDetailScreen.tsx` (~L9-33) statically imports: `WebsiteAuditDashboardScreen` (3,652 lines), `ImageLibrary` (1,655), `WebflowPagesDashboard` (1,110), `ProjectTimelineOverview` (799), `ChecklistOverview` (609), `InvoicesTab` (452), `TasksTab` (215). Convert every tab screen EXCEPT the default (`audit`) to `next/dynamic` with `{ ssr: false, loading: () => <Skeleton className="h-40 w-full" /> }`. Keep `WebsiteAuditDashboardScreen` eager only if Phase 5 hasn't landed; once it has, lazy-load that too.

**2b. Remove dead weight from package.json:**
- `recharts` — zero imports anywhere. Remove.
- Verify then remove whichever of `@google/generative-ai` / `@google/genai` is unused (grep both; the repo has two Gemini SDKs).
- Check `react-dnd` + `react-dnd-html5-backend` vs `@dnd-kit/*` — two DnD stacks; grep usage of each, remove the unused one (likely `react-dnd`; do NOT remove one that is used).
- Check `nspell` + `dictionary-en` import sites — if they're imported by client components (spellcheck overlay), move that work to an API route; if server-only already, leave.
- Run `npm install` after edits and confirm `npx next build` passes.

**2c. Fonts: FOIT → swap.** `src/app/layout.tsx` (~L10, L17): both fonts use `display: "block"` (comment says it's for PDF capture). Change to `"swap"`. If PDF capture genuinely breaks, scope `block` to the capture route only — but verify first; it probably doesn't matter since capture uses Puppeteer with its own waits.

**2d. Memoization on the dashboard hot path:**
- `export const ProjectCard = React.memo(ProjectCard)` (`src/components/projects/ProjectCard.tsx:70`).
- `ProjectLinksDashboardScreen.tsx`: wrap `handleDeleteProject` (~L82) in `useCallback`; fold the 9 un-memoized full-array count passes (~L148-168: `maintenanceCount` … `unassignedCurrentCount`) into ONE `useMemo` reduce over `projects`.
- Inside `ProjectCard`: `useMemo` for `detectWebsiteUrl(project)` (~L55-63) and the `manualLinks` filter (~L134-140), keyed on `project.links`.

**Verify:** `npx next build`; record `du -sh .next/static/chunks` and diff vs baseline. Typing in the dashboard search box should no longer re-render all 47 cards (verify with React DevTools profiler or by console.count in ProjectCard render during dev).

## Phase 3 — Subscription hygiene on the detail screen

**3a. De-duplicate parent/child listeners.** Currently BOTH the parent screen and the open tab subscribe to the same data:
- Tasks: `ProjectDetailScreen.tsx:62` (`useProjectTasks`) AND `TasksTab.tsx:32`.
- Timeline: `ProjectDetailScreen.tsx:63` AND `ProjectTimelineOverview.tsx:82`.
- Checklists: `ProjectDetailScreen.tsx:77-81` AND `ChecklistOverview.tsx:92`.
Fix: the parent keeps ownership (it needs counts for tab badges) and passes data down as props to `TasksTab` / `ProjectTimelineOverview` / `ChecklistOverview`; those components accept optional props and only self-subscribe when not provided (they're used elsewhere too — check callers of each before changing signatures).

**3b. Don't subscribe for badges the user hasn't earned.** The 3 parent subscriptions exist only to render tab-count chips. After 3a, additionally defer each subscription until either (a) its tab is opened, or (b) an idle callback ~2s after mount — so first paint of the detail screen costs 1 listener (project doc), not 4. Keep the badge blank until data arrives (Phase 4 of the UI cleanup already made absent badges the norm).

**3c. One scan-status source.** Two pollers hit `/api/scan-bulk/running-all` concurrently on the detail page: `ScanActivityIndicator.tsx:62` (global nav, 15s/3s) and `WebsiteAuditDashboardScreen.tsx:610-644` (2s interval while scanning). Create a tiny shared module (module-level cache + subscriber set, same pattern as `useAssignees`) that both consume; single interval, visibility-aware.
Also: **delete `ProjectScanBadge.tsx`** (zero usages, contains a per-instance 3s poller that becomes 47 pollers if anyone re-adds it to a card) — or add a loud comment forbidding per-card use.

## Phase 4 — Data-shape fixes (writes change here; be careful)

**4a. Logos out of the documents.** `ProjectLogoDialog.tsx` (~L67, L153-175) stores 128px PNG **base64 data-URLs on the project doc**; all 47 ride along in every dashboard snapshot fire (0.5–2 MB per fire). Fix forward-path first: upload to Firebase Storage (`getStorage` is available via the firebase SDK; bucket env var already configured) and store the download URL. Then a one-time migration script (Node, firebase-admin, run manually via `npx tsx scripts/migrate-logos.ts`) that finds `logoUrl` starting with `data:`, uploads to Storage, replaces with URL. Keep rendering `<img src>` compatible with both forms during transition (it already is — it's just a string).

**4b. Strip legacy inline `auditResult`.** New writes already store audits in the `link_audits` subcollection and strip the inline copy (`database.ts:748-775`), but legacy project docs still carry inline `auditResult` blobs (merge fallback at `database.ts:304-311` proves it). Write `scripts/strip-inline-audits.ts` (firebase-admin): for each project doc whose `links[]` contain `auditResult`, copy them into `link_audits` (skip if a doc already exists there) then strip the field from the project doc. After migration, delete the inline fallback branch in `mergeAuditResults`.

**4c. Scope the dashboard query.** After 4a/4b shrink the docs, add server-side filtering to `subscribeToAllProjects`: the dashboard's default buckets only need `status in ['current','paused']` + tagged; closed/paid projects load on demand when those filter tabs are clicked (separate one-shot `getDocs`). Requires a small composite index — add to `firestore.indexes.json` and deploy. ⚠️ Check every `subscribeToAllProjects` caller (DailyReviewBanner filters client-side for current+tagged — fine; the By Client view may need all).

## Phase 5 — Server-render the shells (architectural; biggest first-paint win)

Current state: every route `page.tsx` is `'use client'`; server sends an empty shell; nothing paints until Firebase JS boots and auth round-trips (`useAuth` starts `loading:true`, home page returns a skeleton until `onAuthStateChanged` fires — `src/app/page.tsx:24-33`, `auth-access/ui/hooks/useAuth.ts:104-146`).

**5a. Unblock first paint from auth.** Don't blank whole pages on `authLoading`. Render the static frame (nav bar, page title, layout) immediately; gate only user-specific content on auth. Start with `src/app/page.tsx` and `ProjectLinksDashboardScreen` — the `if (loading) return <Skeleton/>` full-page gates become per-section placeholders.

**5b. Server-fetch initial dashboard data.** Make `src/app/modules/project-links/page.tsx` a server component that calls a new server-side loader (firebase-admin, same projection as Phase 4c) and passes `initialProjects` into the client screen. Client screen renders `initialProjects` instantly, then swaps in the live subscription when it connects. This removes the "spinner → data pops in" sequence. Session identity for the server fetch: this app is a trusted internal tool with rules `allow read: if true` on projects; the server loader doesn't need per-user filtering. If auth-gating server-side is desired later, use the Firebase session-cookie pattern — out of scope now.
Same pattern for `[id]/page.tsx` (server-load the project doc → pass as `initialProject`).

**5c. Keep Firestore SDK off auth-only pages.** `src/lib/firebase.ts` calls `getFirestore(app)` at module top-level and is imported via the root `AuthProvider` chain, so every route pays for `firebase/firestore`. Split: `firebase-auth.ts` (app + auth only, imported by AuthProvider) and lazy `getDb()` that dynamically imports `firebase/firestore` on first use by the services layer. Verify no circular imports; `database.ts` is the main consumer.

⚠️ This phase is the riskiest. Land 5a first (pure client change), then 5b for the dashboard only, verify in production, then extend. If time-boxed, 5a alone removes most of the perceived slowness.

## Phase 6 — Images & polish

- **Favicons:** `CardLinkItem.tsx:76` and `LinkItem.tsx:121,193` hit `https://www.google.com/s2/favicons?...` per link per card — dozens of external requests. Proxy through the existing `/api/favicon` route with `Cache-Control: public, max-age=604800`, or at minimum add `loading="lazy" decoding="async"` and accept the external calls.
- **Logos:** after 4a (Storage URLs), switch `ProjectCard` logo to `next/image` with explicit size (44px).
- Add `date-fns` to `optimizePackageImports` in `next.config.ts` (already lists lucide-react + radix icons).
- `src/components/ui/collapsible.tsx` imports the `radix-ui` mega-barrel — switch to `@radix-ui/react-collapsible` and drop the `radix-ui` dep.

---

## Verification checklist (end of run)

- [ ] `npx tsc --noEmit` and `npx next build` pass; ESLint clean on touched files.
- [ ] Record `du -sh .next/static/chunks` per phase; final total substantially below 5.8 MB baseline and detail-route entry chunk cut by more than half (2a).
- [ ] Dashboard network audit: initial load ≈ 47 project doc reads, **zero** `link_audits` reads; editing one project in tab B delivers one changed doc to tab A.
- [ ] Detail screen: exactly one Firestore listener at first paint (project doc); tasks/timeline/checklist listeners attach lazily; no duplicate listeners with a tab open (inspect via `firestore` debug logging or listener counters in dev).
- [ ] First paint on / and /modules/project-links shows the page frame before Firebase auth resolves (throttle CPU 4x + Slow 3G in DevTools to confirm).
- [ ] Embed widget (`/embed?...`), public share route, and Raycast API still function (Raycast smoke: `curl -H "Authorization: Bearer $RAYCAST_API_TOKEN" https://app.activeset.co/api/raycast/projects`).
- [ ] Migration scripts (4a/4b) run against production only AFTER a Firestore export/backup; verify a handful of projects manually afterward.
- [ ] Lighthouse (mobile, production URL) before/after: record Performance score, LCP, TBT in this file's appendix.

## Explicitly out of scope

- Proposal module, Webflow dashboards, SEO engine internals (they're already dynamic-imported or off the hot path).
- Rewriting the audit scan pipeline (server-side costs are a separate concern).
- Firestore security-rules tightening (`allow read/write: if true` on most collections is a real issue, but it's a security task, not a performance one — flag it separately).

## Appendix — measurements

| Checkpoint | Client JS total | Dashboard reads/load | Notes |
|---|---|---|---|
| Baseline (052a5cc) | 5.8 MB | ~47 + all link_audits (1000s) | |
| After Phase 1 (14efd02) | 5.8 MB | ~47 doc reads, 0 link_audits | N+1 removed; no bundle change |
| After Phase 2 (build) | 5.4 MB | — | dead deps + 6 tabs code-split out of route entry |
| After Phase 3/5a/6-cfg | 5.4 MB | — | detail first paint: 1 listener not 4 |

## Status (as of 2026-07-10)

**Deployed to production** (app.activeset.co, verified 200 + Raycast API intact):
- Phase 1 — Firestore N+1 eliminated (the big win).
- Phase 2 — tabs code-split, dead deps removed, fonts swap, dashboard memoized.
- Phase 3 — detail badge subscriptions deferred, orphaned scan badge deleted.
- Phase 5a — nav frame renders during auth/projects loading (no blank spinner).
- Phase 6 (partial) — date-fns in optimizePackageImports.

**Prepared but NOT executed — needs owner sign-off (touches production data / architecture):**
- Phase 4a/4b — logo-to-Storage + strip-legacy-inline-audit migrations. These
  rewrite live Firestore documents and MUST be preceded by a Firestore export.
  Do not run unattended. Forward-path code (new logos to Storage) also pending.
- Phase 4c — scope the dashboard query by status. Low payoff at ~47 total
  projects and real regression risk (Closed/Paid filter views would need a
  separate fetch). Recommend skipping unless the project count grows large.
- Phase 5b/5c — server-render initial data via firebase-admin + split the
  Firestore SDK off auth-only pages. Architectural; higher regression risk;
  land behind a checkpoint after 5a proves out in production.
- Phase 6 (rest) — favicon proxy + next/image logos (the logo part depends on
  4a's Storage URLs, since next/image can't optimize base64 data-URLs).

**Separate security task (not performance):** Firestore rules are
`allow read, write: if true` on most collections. Now that the app is shared
with the team, this should be tightened — flagged for its own effort.
