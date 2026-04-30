# Active Set — ClickUp Streamlining Playbook

A practical rollout plan for cleaning up the ClickUp workspace and wiring the new intake system. Scoped for **Copy / Design / Dev** teams across **One-Time**, **Maintenance**, and **Subscription** engagements.

---

## What got built (already in this repo)

| Capability | Where | Status |
|---|---|---|
| Public client intake URLs | `/intake/<token>` | ✅ Live |
| Per-project intake settings | `/modules/intake` → Configure | ✅ Live |
| Cross-client command center | `/modules/intake` → Overview | ✅ Live |
| AI brief parsing (bundled list → tasks) | Auto on submission | ✅ Live |
| ClickUp task auto-creation | When `intakeAutoCreate=true` | ✅ Live |
| Slack nag-bot for stale tasks | `/api/cron/nag-tasks` (existing) | ✅ Live |
| ClickUp two-way sync (webhook + cron) | Existing | ✅ Live |
| Tag typo cleanup (`client-dependecy` → `client dependency`) | 3 tasks fixed via API | ✅ Done |

---

## What still needs hands-on cleanup in ClickUp UI

These can't be done via API and require ~30 min of admin work in ClickUp's UI:

### 1. Unify status flow across all client lists
Current state: lists use a mix of `Open / in progress / in review / complete` and `Closed`. Different shapes prevent cross-client reporting.

**Target flow:** `Intake → Brief Approved → In Copy → In Design → In Dev → In QA → Client Review → Live → Closed` (+ parallel `Blocked`)

**How:** ClickApps → Statuses → "Apply to all lists in space" — rebuild once at the space level, then propagate.

### 2. Add space-level custom fields
- `Discipline` (multi-select): Copy · Design · Dev · QA · SEO · Animation · CMS
- `Engagement Type` (dropdown): One-Time · Maintenance · Subscription
- `Page/Component` (text)
- `Hours Estimated` (number) + `Hours Logged` (number)
- `Brief Status` (dropdown): Missing · In Review · Approved
- `Blocked Reason` (dropdown): Client Asset · Client Approval · Internal Dep · 3rd-Party API

### 3. Required-fields automation
Create one ClickUp Automation per space:
- Trigger: Task created
- Action: Block status change beyond `Intake` until `Discipline`, `Engagement Type`, `Hours Estimated`, `Brief Status` are set

### 4. Rename generic folder names
Folders called "List" / "Round 1" / "List 2" need real names. Convention:
`<Client> · <Engagement Type> · <YYYY-Q#>` — e.g. `Privado · Subscription · 2026-Q2`

Current offenders (from the workspace scan): Korowa, Beaver Health, Brain & Being, Dallas Chauffeur, Catalyst AI, Life Love & Good Days, Cannaries, Kalima Hub, Canopy, Thrive Mentorship, Cosmos, Nyuway, Diamond Acquisition, Kynect, Activeset Website, Reddy Ventures, Autexis.

### 5. List templates
Create three saved List Templates:

**One-Time Project** — phase-locked tasks with dependencies:
- Phase 0 — Brief & Sitemap (gate)
- Phase 1 — Copy (per page, depends on Phase 0)
- Phase 2 — Design (depends on Copy)
- Phase 3 — Dev (depends on Design)
- Phase 4 — QA + Client Review
- Phase 5 — Launch

**Maintenance** — single rolling list with month-tagged tasks for invoice rollups.

**Subscription** — monthly sprint lists, hour cap on parent list, carry-over tag.

---

## Rollout schedule

| Week | Owner | Action |
|---|---|---|
| Week 1 | Rehan | Apply unified status flow + custom fields at space level. Rename generic folders. |
| Week 1 | Rehan | Create the three List Templates. |
| Week 2 | Rehan | Pick 3 pilot clients (1 of each engagement type). Apply intake URL via `/modules/intake`. |
| Week 2 | Rehan | Email pilot clients the new intake URL with a short note. |
| Week 3 | Rehan | Retire 2-3 paid guest seats for pilot clients. Watch the dashboard. |
| Week 4 | Rehan | Roll out to remaining clients. Required-fields automations on. |

---

## Subscription billing & hours

The intake system stages tasks; the existing `Hours Estimated` field (after step 2 above) is what powers the subscription burn-down. Suggested:

- Set `Hours Estimated` on every intake-created task (operator step in triage)
- Use ClickUp's Time Tracking on the linked task → `Hours Logged`
- Build a ClickUp Dashboard widget per client: monthly burn vs. cap
- Soft alert at 80% of monthly cap; upsell email at 100%

---

## What to retire

- **Word-doc briefs** — replaced by the structured intake form. Briefs that arrive as docs should be pasted into the operator triage dialog.
- **Slack-as-task-tracker** — pasted Slack messages get parsed via the same Gemini pipeline.
- **Paid guest seats for review-only clients** — the public intake URL covers this.
- **`client-dependecy` tag** — typo'd version cleaned up; standardize on `client dependency`.

---

## Open follow-ups (worth scheduling)

| Item | Why | Cadence |
|---|---|---|
| Sweep remaining typo'd / inconsistent tags | Reporting cleanliness | Monthly, 15 min |
| Audit projects with no Discipline / no Hours Estimated | Catches drift from required-fields automation | Weekly |
| Review aging blocked tasks (>5 days) | Already surfaced in the dashboard | Weekly standup |
| Rotate intake tokens for ended client engagements | Security hygiene | Per offboarding |

---

## Key file references

- Public form: [`src/app/intake/[token]/page.tsx`](../src/app/intake/[token]/page.tsx)
- Form component: [`src/components/intake/IntakeForm.tsx`](../src/components/intake/IntakeForm.tsx)
- Public API: [`src/app/api/clickup/public-intake/route.ts`](../src/app/api/clickup/public-intake/route.ts)
- Settings API: [`src/app/api/clickup/intake-settings/route.ts`](../src/app/api/clickup/intake-settings/route.ts)
- Dashboard API: [`src/app/api/clickup/dashboard/route.ts`](../src/app/api/clickup/dashboard/route.ts)
- Operator screen: [`src/modules/intake/ui/screens/IntakeCommandCenterScreen.tsx`](../src/modules/intake/ui/screens/IntakeCommandCenterScreen.tsx)
- Token util: [`src/lib/intake-token.ts`](../src/lib/intake-token.ts)
- ClickUp helpers: [`src/lib/clickup.ts`](../src/lib/clickup.ts)

Feature deep-dive: [docs/features/intake.md](features/intake.md)
