---
module: proposal
title: Proposals and Retainer Agreements
keywords: [proposal, proposals, contract, contracts, agreement, retainer agreement, e-signature, esign, sign, signature, counter-sign, agency signature, share link, public view, /view, shared_proposals, proposal_views, proposal_comments, proposal_history, templates, comments, history, versions, PDF, generate-pdf, download PDF, puppeteer, AI draft, AI wizard, New Proposal Wizard, proposal-draft, proposal-block, Gemini, AI Gateway, Ollama, markdown compose, From Markdown, Compose Agreement from Markdown, contract:create, create-contract, agreement.md, payment terms, payment template, lock-in, Lost Deals, Active Proposals, Template Management, About Us, Terms, Titles, Agencies, Services, Deliverables, Team Access, module access, open graph image, view tracking, viewCount]
entry_points: [/modules/proposal, /modules/proposal/settings, /view/[id]]
code_roots: [src/app/modules/proposal, src/modules/proposal, src/app/view/[id], src/app/api/proposals, src/app/api/ai/proposal-draft, src/app/api/ai/proposal-block, src/app/api/generate-pdf, src/lib/proposal-ai, scripts/create-contract.ts]
last_verified: 2026-09-23 @ a00f91e
---
# Proposals and Retainer Agreements

> The Proposals module is where the ActiveSet team writes client-facing sales proposals (overview, about us, pricing, timeline, terms, signatures) and, since the contract work, legal retainer agreements (the same record with `documentType: 'contract'`). Team members open it from the "Proposals" nav item (`/modules/proposal`, gated by the `proposal` module grant). They create a proposal with the AI wizard, from pasted markdown, from a saved template or blank, then share a public link (`/view/<id>`). The client reads it there without logging in, the visit is counted, and the client e-signs. The agency can counter-sign from inside the app. Comments and field-level edit history exist for the team only. The CLI `npm run contract:create` creates agreements from a markdown file without opening the UI.

## Where to find things (quick lookup)

| I want to… | Go to |
|---|---|
| Change the module shell (dashboard, editor or viewer switching, create/save/delete/share handlers) | [ProposalModuleScreen.tsx](../../src/modules/proposal/ui/screens/ProposalModuleScreen.tsx), default export `ProposalPage` |
| Change the proposal data shape | [Proposal.ts](../../src/app/modules/proposal/types/Proposal.ts): `Proposal`, `ContractData`, `SignatureAudit`, `ProposalComment`, `ProposalEdit` |
| Change how proposals are saved, shared or deleted | [ProposalService.ts](../../src/app/modules/proposal/services/ProposalService.ts): `createProposal`, `updateProposal`, `deleteProposal`, `createShareLink` |
| Change the public client signing | [sign/route.ts](../../src/app/api/proposals/[id]/sign/route.ts), `POST` |
| Change the agency counter-signature | `ProposalService.signAsAgency` plus [AgencySignatureDialog.tsx](../../src/app/modules/proposal/components/AgencySignatureDialog.tsx) |
| Change the signature capture UI (drawn or typed, script fonts) | [SignatureSection.tsx](../../src/app/modules/proposal/components/SignatureSection.tsx) |
| Change the public page, its metadata or its 60 s cache | [view/[id]/page.tsx](../../src/app/view/[id]/page.tsx), `getPublicProposalCached` |
| Change the link-preview image | [opengraph-image.tsx](../../src/app/view/[id]/opengraph-image.tsx) |
| Change view counting or bot filtering | [view/route.ts](../../src/app/api/proposals/[id]/view/route.ts) + [TrackProposalView.tsx](../../src/app/modules/proposal/components/TrackProposalView.tsx) |
| Change the "views" popover on a dashboard card | [ProposalViewsPopover.tsx](../../src/app/modules/proposal/components/ProposalViewsPopover.tsx) → shared [ViewsPopover.tsx](../../src/components/views/ViewsPopover.tsx) → [views/route.ts](../../src/app/api/proposals/[id]/views/route.ts) |
| Change the AI full-draft prompt | [proposal-draft/route.ts](../../src/app/api/ai/proposal-draft/route.ts) |
| Change AI per-block regeneration (timeline, pricing, client description, deliverable) | [proposal-block/route.ts](../../src/app/api/ai/proposal-block/route.ts) |
| Change the allowed titles, service keys or pricing names the AI may return | [schemas.ts](../../src/lib/proposal-ai/schemas.ts): `ALLOWED_*`, `normalizeDraft` |
| Change how the client website is scraped for AI context | [site-context.ts](../../src/lib/proposal-ai/site-context.ts): `fetchSiteContext` |
| Switch the AI to local Ollama | [aiClient.ts](../../src/app/modules/proposal/services/aiClient.ts) (`NEXT_PUBLIC_AI_SOURCE=ollama`) |
| Change the AI wizard UI | [NewProposalWizard.tsx](../../src/app/modules/proposal/components/NewProposalWizard.tsx) |
| Change the proposal editor (sections, pricing, timeline, hero image, resources) | [ProposalEditor.tsx](../../src/app/modules/proposal/components/ProposalEditor.tsx) (about 2.8k lines) |
| Change contract clauses, defaults or the Term/lock-in text | [contractTemplate.ts](../../src/app/modules/proposal/lib/contractTemplate.ts): `STANDARD_CLAUSES`, `generateTermClauseBody`, `buildBlankContract` |
| Change the contract editor or viewer | [ContractEditor.tsx](../../src/app/modules/proposal/components/ContractEditor.tsx), [ContractViewer.tsx](../../src/app/modules/proposal/components/ContractViewer.tsx) |
| Change the markdown format for proposals or agreements | [markdownProposal.ts](../../src/app/modules/proposal/utils/markdownProposal.ts), [markdownContract.ts](../../src/app/modules/proposal/utils/markdownContract.ts) |
| Change PDF output | [generate-pdf/route.ts](../../src/app/api/generate-pdf/route.ts) → `ScreenshotService.capturePdf` in [ScreenshotService.ts](../../src/services/ScreenshotService.ts) |
| Change payment terms (the invoice plan) | [PaymentTermsCard.tsx](../../src/app/modules/proposal/components/PaymentTermsCard.tsx) + [payment-templates.ts](../../src/lib/payment-templates.ts) |
| Change the "signed" email | [send-notification/route.ts](../../src/app/api/send-notification/route.ts) |
| Edit the About Us, Terms, Titles, Agencies, Services or Deliverables presets | [settings/page.tsx](../../src/app/modules/proposal/settings/page.tsx) + [useConfigurations.ts](../../src/hooks/useConfigurations.ts) |
| Create an agreement from the CLI | [create-contract.ts](../../scripts/create-contract.ts) (`npm run contract:*`) |

## User-facing pages

| URL | File | What it shows | Access |
|---|---|---|---|
| `/modules/proposal` | [page.tsx](../../src/app/modules/proposal/page.tsx) → [ProposalModuleScreen.tsx](../../src/modules/proposal/ui/screens/ProposalModuleScreen.tsx) | A single client-side screen that switches between three views (`ViewType`). **Dashboard** has "Active Proposals" and "Lost Deals" tabs, stats cards, templates and a New menu (wizard, contract, from markdown, agreement from markdown, from template). **Editor** is `ProposalEditor` or `ContractEditor`. **Viewer** is `ProposalViewer` or `ContractViewer`, with comments, history and the agency counter-sign. The `?share=<id>` query param opens that shared proposal straight in the viewer | Signed-in `@activeset.co` user **and** `useModuleAccess('proposal')`. Otherwise it shows a sign-in or "Access Denied" screen |
| `/modules/proposal/settings` | [settings/page.tsx](../../src/app/modules/proposal/settings/page.tsx) | "Template Management" tabs: About Us, Terms, Titles, Agencies, Services, Deliverables, plus Team Access for admins only. The editors live in `src/app/modules/settings/components/*` | **No auth or module gate on the page itself.** Only the Team Access tab checks `isAdmin`. Linked from the Dashboard gear icon |
| `/view/[id]` | [view/[id]/page.tsx](../../src/app/view/[id]/page.tsx) | Public client view of `shared_proposals/{id}`. It renders `ContractViewer` or `ProposalViewer` with `isPublic`, plus `TrackProposalView`. The page is server-rendered with `unstable_cache` (revalidates every 60 s) and `generateMetadata` for OG and Twitter tags | Anyone with the link. No auth |
| `/view/[id]/opengraph-image` | [opengraph-image.tsx](../../src/app/view/[id]/opengraph-image.tsx) | A 1200×630 PNG (Satori `ImageResponse`) with the client name, title, agency and up to 4 services. Fonts come from jsDelivr fontsource | Public |

## API routes

| Method | Path | File | Auth | Purpose |
|---|---|---|---|---|
| POST | `/api/proposals/[id]/sign` | [sign/route.ts](../../src/app/api/proposals/[id]/sign/route.ts) | **None** (anyone with the id). Uses firebase-admin | Public client e-signature. It validates an image data URL (≤2 MB) and returns 409 if the proposal is already locked or signed. It builds a `SignatureAudit` (method, Vercel geo headers, salted IP hash, UA, browser, OS), then writes the full doc to **both** `shared_proposals` and `proposals` with `status: 'approved'`, `isLocked: true` and `lockedReason: 'signed'`. It also appends a `proposal_history` entry and fires `/api/send-notification` without waiting for it |
| POST | `/api/proposals/[id]/view` | [view/route.ts](../../src/app/api/proposals/[id]/view/route.ts) | **None**. Uses firebase-admin | Records one public view. Bot user agents are skipped (`BOT_UA_PATTERN`). It adds a `proposal_views` row, then merge-writes `viewCount` (increment), `lastViewedAt`, `firstViewedAt`, `lastViewCountry` and `lastViewCity` onto both proposal docs |
| GET | `/api/proposals/[id]/views?limit=N` | [views/route.ts](../../src/app/api/proposals/[id]/views/route.ts) | Firebase ID token via `requireCaller` (any `@activeset.co` user; **no** `proposal` module check) | Lists recent views for the popover. The default limit is 20 and the maximum is 100. Results are sorted in memory |
| POST | `/api/ai/proposal-draft` | [proposal-draft/route.ts](../../src/app/api/ai/proposal-draft/route.ts) | **None** | Takes meeting notes and an optional website, budget and deadline, and returns a full structured draft (`generateObject` + `proposalDraftSchema` → `normalizeDraft`). `maxDuration` is 60 |
| POST | `/api/ai/proposal-block` | [proposal-block/route.ts](../../src/app/api/ai/proposal-block/route.ts) | **None** | Regenerates one block: `timeline`, `pricing`, `clientDescription` or `finalDeliverable`. The site is fetched only for `clientDescription` |
| GET | `/api/generate-pdf?proposalId=` | [generate-pdf/route.ts](../../src/app/api/generate-pdf/route.ts) | **None** | Puppeteer renders `${NEXT_PUBLIC_APP_URL or host}/view/<id>?pdf=1` to an A4 PDF and returns it as an attachment. `maxDuration` is 300 |
| POST | `/api/send-notification` | [send-notification/route.ts](../../src/app/api/send-notification/route.ts) | **None** | Handles only `type: 'proposal-signed'`. It sends the "Proposal Signed" email through Gmail SMTP (nodemailer) to `agencyEmail`, or to `NOTIFY_EMAIL` if that is empty. Returns `success:false` without failing if the Gmail env vars are missing |

None of these routes are covered by middleware or a proxy (the repo has no `middleware.ts` or `proxy.ts`).

## Code map

### Module dir: `src/modules/proposal`
- [index.ts](../../src/modules/proposal/index.ts): re-exports `ProposalModuleScreen`.
- [ProposalModuleScreen.tsx](../../src/modules/proposal/ui/screens/ProposalModuleScreen.tsx): all orchestration state (`currentView`, `selectedProposal`, `editingTemplate`, dialogs). It loads proposals and templates once auth and access resolve. `handleSaveProposal` calls update if the record has an id, otherwise create. `shareProposal` copies `/view/<id>` to the clipboard first (to keep the user-gesture context) and then calls `createShareLink`. `handleCreateContract` calls `buildBlankContract({ agencyName: 'ActiveSet' })`.

### Route entry: `src/app/modules/proposal`
- [page.tsx](../../src/app/modules/proposal/page.tsx): a thin client wrapper that renders `ProposalModuleScreen`.
- [settings/page.tsx](../../src/app/modules/proposal/settings/page.tsx): the Template Management tabs (see Configuration).

### Components: `src/app/modules/proposal/components`
- `Dashboard.tsx`: list, sort and the Active/Lost tabs, the New dropdown, templates, and the settings link.
- `ProposalCard.tsx`: one card with the status menu (`onStatusChange`), share, edit, delete and the views popover. For contracts it also shows a "Locked until" lock-in badge (`computeLockInEnd`).
- `StatisticsCards.tsx`, `EmptyState.tsx`, `LoadingScreen.tsx`: presentational.
- `NewProposalWizard.tsx`: an AI wizard. It collects the agency (from `configurations/agencies`), client, website, budget, deadline and notes. It calls `generateProposalDraft`, shows progress in `TerminalLoader.tsx`, then `buildProposalFromAI(...)` maps the result onto a `Proposal` using service snippets, About Us and Terms from `useConfigurations`.
- `ProposalEditor.tsx`: the proposal editor. It contains sections (hero image, overview with details, about us, pricing with hourly items, timeline with dates and dependencies, resources, payment terms, terms, signatures), drag-sortable pricing and timeline (dnd-kit), per-block AI (`generateBlockAI` → `generateProposalBlock`), markdown export and import (`serializeProposalToMarkdown`, `mergeParsedIntoProposal`), `HistoryPanel`, `LivePreview` and save-as-template. Local presets are kept in `localStorage['proposal_presets']`. Inputs are disabled when `isLocked` or the client has signed.
- `ContractEditor.tsx`: the agreement editor. It covers the parties, effective date, retainer (amount, currency, billing cycle including hourly), lock-in months, governing law and jurisdiction, and clauses. The `term` clause body is regenerated by `generateTermClauseBody` while `generated !== false`. It also has markdown export and import.
- `ProposalViewer.tsx`: the proposal render used both in the app and on the public page (`isPublic`). It handles PDF download (`downloadProposalPDF`), comments (`commentService.subscribeToComments`), the client signature via `SignatureSection`, the agency counter-sign via `AgencySignatureDialog` (app only), and a mobile "Sign Proposal Now" CTA (public only).
- `ContractViewer.tsx`: the equivalent for `documentType: 'contract'`. It shows execution state from both `signedAt` fields.
- `SignatureSection.tsx`: drawn signatures (`react-signature-canvas`) or typed ones (script fonts from `@fontsource/*`), plus the signed-state rendering with audit details. When `!isPublic` it shows only "Awaiting Client Signature".
- `AgencySignatureDialog.tsx`: draw a signature, or pick one saved on a `configurations/agencies` profile (`signatureData`).
- `CommentSidebar.tsx`, `CommentThread.tsx`: section-scoped threaded comments with resolve and reopen. They are rendered only when `!isPublic`.
- `HistoryPanel.tsx`: the last 50 `proposal_history` entries with field diffs.
- `LivePreview.tsx`: the editor's preview pane.
- `RichTextEditor.tsx`: a Lexical rich-text editor.
- `ComposeMarkdownDialog.tsx`: a generic dialog. `PROPOSAL_COMPOSE_SPEC` and `CONTRACT_COMPOSE_SPEC` bind it to the two markdown parsers.
- `PaymentTermsCard.tsx`: picks a `PaymentTemplate` plus total, currency and start date and stores it as `data.paymentTerms`.
- `ProposalViewsPopover.tsx`: a thin wrapper over the shared `ViewsPopover`.
- `TrackProposalView.tsx`: fires the view beacon once per browser session. It skips signed-in users.

### Services: `src/app/modules/proposal/services` (all use the client Firebase SDK)
- [ProposalService.ts](../../src/app/modules/proposal/services/ProposalService.ts): exports the `proposalService` singleton. It has `getProposals` (all, `createdAt desc`), `getProposalById`, `createProposal`, `updateProposal` (merge-writes only the caller's fields, then diffs with `detectDetailedChanges` → `historyService.recordDetailedUpdate`), `deleteProposal`, `createShareLink`, `getSharedProposal`/`getPublicProposal`, `signProposal` (client-SDK signing, now only used on the non-public branch, see Gotchas), `signAsAgency` and the private `sendSignatureNotification`.
- [HistoryService.ts](../../src/app/modules/proposal/services/HistoryService.ts): `historyService`, which covers `proposal_history`: `getHistory`, `recordEdit`, `recordCreation`, `recordDetailedUpdate`, `recordSigned`, plus `recordSectionUpdate`, `recordPricingChange` and `recordStatusChange`, which have no callers.
- [CommentService.ts](../../src/app/modules/proposal/services/CommentService.ts): `commentService`, which covers `proposal_comments`: `getComments`, `subscribeToComments` (onSnapshot), `addComment`, `replyToComment`, `resolveComment`, `reopenComment`, `deleteComment`, `buildCommentThreads`, `getCommentCount`, and `getCommentsBySection` (no callers).
- [TemplateService.ts](../../src/app/modules/proposal/services/TemplateService.ts): `templateService`, which covers the `templates` collection: `getTemplates`, `saveTemplate`, `updateTemplate`, `deleteTemplate`, `getTemplateById`.
- [aiClient.ts](../../src/app/modules/proposal/services/aiClient.ts): `generateProposalDraft` and `generateProposalBlock`. These call the gateway by default (the two `/api/ai/*` routes) or go to Ollama directly from the browser when `NEXT_PUBLIC_AI_SOURCE=ollama`.

### lib and utils
- [contractTemplate.ts](../../src/app/modules/proposal/lib/contractTemplate.ts): `formatMoney`, `formatContractDate`, `billingNoun`, `computeLockInEnd`, `generateTermClauseBody`, `buildContractClauses`, `blankContractData`, `buildBlankContract` and `STANDARD_CLAUSE_HEADINGS`.
- [proposalResources.ts](../../src/app/modules/proposal/lib/proposalResources.ts): `detectResourceKind` (audit, website, figma, staging, repo, doc, other from the URL) and `RESOURCE_KIND_META`.
- [markdownProposal.ts](../../src/app/modules/proposal/utils/markdownProposal.ts): `PROPOSAL_MARKDOWN_TEMPLATE`, `AI_FORMAT_INSTRUCTIONS`, `parseProposalMarkdown`, `serializeProposalToMarkdown`, `mergeParsedIntoProposal`.
- [markdownContract.ts](../../src/app/modules/proposal/utils/markdownContract.ts): `CONTRACT_MARKDOWN_TEMPLATE`, `CONTRACT_AI_FORMAT_INSTRUCTIONS`, `parseContractMarkdown`, `serializeContractToMarkdown`, `mergeParsedIntoContract`, `markdownToClauseHtml`, `clauseHtmlToMarkdown`, `decodeHtmlEntities`. This file is shared with the CLI.
- [pdfGenerator.ts](../../src/app/modules/proposal/utils/pdfGenerator.ts): `downloadProposalPDF(id, filename)` fetches `/api/generate-pdf` and triggers a blob download.
- [proposalUtils.ts](../../src/app/modules/proposal/utils/proposalUtils.ts): `getStatusColor`, `copyToClipboard`, `convertBulletsToHtmlLists`.
- [src/lib/proposal-ai/schemas.ts](../../src/lib/proposal-ai/schemas.ts): Zod schemas that are deliberately loose, plus `normalizeDraft`, which clamps and filters to the `ALLOWED_*` lists.
- [src/lib/proposal-ai/site-context.ts](../../src/lib/proposal-ai/site-context.ts): a server-side fetch of the client site (10 s timeout, no JS rendering) that pulls out the title, meta, headings and body excerpt.
- [src/lib/payment-templates.ts](../../src/lib/payment-templates.ts): `PaymentTemplate` and `expandToSlots`. It is shared with the Invoices module: a proposal's `data.paymentTerms` expands into exactly the same invoice slots that "Apply template" would create.

### Types
- [Proposal.ts](../../src/app/modules/proposal/types/Proposal.ts): the single source of types for this module. The timeline and invoices modules also import it.

### Hooks used
- [useConfigurations.ts](../../src/hooks/useConfigurations.ts): live `onSnapshot` on the six `configurations` docs.
- `useModuleAccess` and `useAuth` from `@/modules/auth-access`, which is documented with the platform and auth area.

## Data model

All top-level collections. `id` is `crypto.randomUUID()` and doubles as the public share token.

| Path | One doc is | Key fields (type) | Written by | Read by |
|---|---|---|---|---|
| `proposals/{id}` | A proposal or agreement (team copy) | `Proposal` in [Proposal.ts](../../src/app/modules/proposal/types/Proposal.ts): `documentType?` ('proposal' by default, or 'contract'), `title`, `clientName`, `agencyName`, `heroImage?` (URL or **data URL**), `status` (`draft/sent/approved/rejected/lost`), `createdBy`, `createdAt`/`updatedAt` (ISO strings), `isLocked`/`lockedAt`/`lockedReason`, view counters (`viewCount`, `firstViewedAt`, `lastViewedAt`, `lastViewCountry`, `lastViewCity`), and `data.{overview, overviewDetails, aboutUs, pricing, paymentTerms?, timeline.phases, terms, resources?, signatures.{agency,client}, contract?}` | Client SDK (`ProposalService`); admin SDK (`sign`, `view` routes, CLI) | Client SDK (dashboard, editor, Invoices `LinkProposalDialog`, Timeline import) |
| `shared_proposals/{id}` | Public mirror of the same doc, plus `sharedAt` | Same as above | Written **on every create and update** by `ProposalService` (client SDK), by `sign`/`view` (admin), and by the CLI | `/view/[id]` (admin first, then a client-SDK fallback), OG image (client SDK), public viewer re-fetch after signing |
| `proposal_views/{autoId}` | One counted public open | `proposalId`, `viewedAt`, `ipHash?`, `userAgent?`, `referrer?`, `country?`, `city?` (`ProposalView`) | `view` route (admin) | `views` route (admin) |
| `proposal_comments/{id}` | One comment or reply | `ProposalComment`: `proposalId`, `sectionId` (`ProposalSectionId`), `authorType` ('agency' or 'client'), `parentId?`, `resolved*` | `CommentService` (client SDK) | `CommentService` |
| `proposal_history/{id}` | One edit event | `ProposalEdit`: `proposalId`, `timestamp`, `editorName/Email`, `sectionChanged`, `changeType` (`create/update/status_change/signed`), `summary`, `changes?: FieldChange[]` (values truncated to 100 chars, HTML stripped) | `HistoryService` (client) and the `sign` route (admin) | `HistoryPanel` |
| `templates/{id}` | A saved proposal template | `ProposalTemplate`: `name`, `createdAt`, `data` (a full `Proposal['data']`) | `TemplateService` | Dashboard |
| `configurations/{titles,agencies,services,about_us,terms,deliverables}` | A preset list. The Settings module owns the collection generally | All use `items`. `titles` is `string[]`; `agencies` is `AgencyProfile[]` (`id, name, email, signatureData?`, with legacy string entries migrated on read); `services` is a key→snippet map (`serviceSnippets`); `about_us`, `terms` and `deliverables` are `ConfigurationItem[]` (`id, label, text`) | Settings editors (client SDK) | `useConfigurations` |
| `access_control/module_access` | Module grants | `modules.proposal: string[]` (emails, `"*"` means everyone) | Admin via Team Access | `useModuleAccess('proposal')`; server `hasModuleAccess` (not used by proposal routes) |

`ContractData` (in `data.contract`) holds the `client`/`agency` `ContractParty` (`legalName, address, signatoryName, signatoryTitle, email`), `effectiveDate`, `retainer {amount, currency, billingCycle}` (`BillingCycle` = `monthly|quarterly|annually|hourly`), `lockInMonths`, `governingLawCountry`, `jurisdictionCity` and `clauses: ContractClause[]` (`id, heading, body HTML, generated?`). A contract counts as fully executed only once both `signatures.agency.signedAt` and `signatures.client.signedAt` are set.

Storage: none. Hero images and signatures are stored inline as data URLs on the Firestore doc.

**firestore.rules** ([firestore.rules](../../firestore.rules), around lines 210-249):
- `proposals` and `templates`: read and write if `isActiveSetUser()` (email ends `@activeset.co`).
- `shared_proposals`: `allow read: if true` (this covers get **and list**); write only for team members.
- `proposal_views`: `if false`, so only the admin SDK can touch it.
- `proposal_comments`: public read. Create is allowed for team members or when `authorType == 'client'`. Update and delete are team-only.
- `proposal_history`: team read. Create is allowed for team members or when `changeType == 'signed'`.
- `configurations`: `allow read, write: if true` (line 207).

**firestore.indexes.json** composites: `proposal_views (proposalId ASC, viewedAt DESC)`, `proposal_comments (proposalId ASC, createdAt ASC)`, `proposal_history (proposalId ASC, timestamp DESC)`. `getCommentsBySection` (proposalId + sectionId + createdAt) has no index but also has no callers.

## Background jobs

None. There is no cron, worker job or webhook for proposals. The only asynchronous work is the unawaited `fetch('/api/send-notification')` after signing.

## Configuration

| Env var | Required? | Used in |
|---|---|---|
| `PROPOSAL_AI_MODEL` | No (default `google/gemini-2.5-flash`) | `proposal-draft`, `proposal-block` routes (also `api/tasks/parse-request`) |
| `VERCEL_OIDC_TOKEN` | Yes for AI on the gateway path. The `ai` SDK reads it, not repo code, so it is not grep-able as `process.env`. It is present in `.env.local` and `.env.vercel-production` | AI Gateway auth |
| `NEXT_PUBLIC_AI_SOURCE` | No (`gateway`; set `ollama` for local) | [aiClient.ts](../../src/app/modules/proposal/services/aiClient.ts) |
| `NEXT_PUBLIC_OLLAMA_BASE_URL`, `NEXT_PUBLIC_OLLAMA_MODEL` | No (`http://127.0.0.1:11434`, `gemma4:e4b`) | aiClient Ollama fallback |
| `PROPOSAL_VIEW_IP_SALT` | No (hard-coded fallback salt) | IP hashing in the `sign` and `view` routes (also reused by the client-portal view route) |
| `NEXT_PUBLIC_APP_URL` | No (falls back to the request host) | `generate-pdf` base URL; the CLI's printed share link (default `https://app.activeset.co`) |
| `NEXT_PUBLIC_BASE_URL` | No | `send-notification` link in the email (fallback is a stale Railway URL); `ProposalService.sendSignatureNotification` when there is no `window` |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `NOTIFY_EMAIL` | Needed for the signed email. Without them the email is skipped quietly | `send-notification` |
| `FIREBASE_SERVICE_ACCOUNT_KEY`, `FIREBASE_PROJECT_ID` or `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes for the admin routes and the CLI | [firebase-admin.ts](../../src/lib/firebase-admin.ts). Without them `sign` and `view` return 503 |
| `CONTRACT_AUTHOR` | No | CLI default for `--author` |
| `PUPPETEER_EXECUTABLE_PATH` | No (local, non-Vercel) | [ScreenshotService.ts](../../src/services/ScreenshotService.ts) |

**Gemini note:** proposal AI does **not** use `GEMINI_API_KEY`. It goes through the Vercel AI Gateway with the model id string `google/gemini-2.5-flash`.

**Module access:** `proposal` is in `RESTRICTED_MODULES` ([AccessControlService.ts](../../src/services/AccessControlService.ts)). If `access_control/module_access` is missing, only `ADMIN_EMAILS` (rehan@, salman@) get access. The nav item is hidden without the grant ([nav-items.tsx](../../src/components/shell/nav-items.tsx), `hideWithoutAccess: true`).

**Proposal presets:** these live in the `configurations` docs listed above and are edited on `/modules/proposal/settings`. The generic Settings module doc covers the editor components.

**next.config.ts:** `serverExternalPackages` includes puppeteer, puppeteer-core and `@sparticuz/chromium`. `outputFileTracingIncludes['/api/generate-pdf/**/*']` forces the Chromium binary into the function bundle.

## External services

| Service | Where | How |
|---|---|---|
| Vercel AI Gateway → Google Gemini 2.5 Flash | `proposal-draft` and `proposal-block` routes | `generateObject({ model: 'google/gemini-2.5-flash', schema, temperature: 0.3 })` from the `ai` package, authenticated by OIDC token |
| Ollama (optional, local) | [aiClient.ts](../../src/app/modules/proposal/services/aiClient.ts) | A direct call from the browser to `/api/generate` with `format: 'json'` |
| Client websites | [site-context.ts](../../src/lib/proposal-ai/site-context.ts) | Plain `fetch` with UA `ActiveSetBot/1.0` and a 10 s timeout |
| Headless Chromium | [ScreenshotService.ts](../../src/services/ScreenshotService.ts) `capturePdf` | `puppeteer-core` + `@sparticuz/chromium` on Vercel; full `puppeteer` locally |
| Gmail SMTP | [send-notification/route.ts](../../src/app/api/send-notification/route.ts) | `nodemailer` with an app password |
| jsDelivr fontsource | [opengraph-image.tsx](../../src/app/view/[id]/opengraph-image.tsx) | TTF fonts fetched with `force-cache` |
| Vercel geo headers | `sign` and `view` routes | `x-vercel-ip-country`, `x-vercel-ip-city` |

## Key flows

1. **Create with the AI wizard.** Dashboard "New" opens `NewProposalWizard`. `generateProposalDraft` ([aiClient.ts](../../src/app/modules/proposal/services/aiClient.ts)) POSTs to `/api/ai/proposal-draft`. That route calls `fetchSiteContext` on the website, `generateObject` with `proposalDraftSchema`, then `normalizeDraft`. Back in the wizard, `buildProposalFromAI` merges the result with the `configurations` snippets and the draft opens in `ProposalEditor`. Nothing is persisted until the user clicks Save. Save calls `handleSaveProposal` → `proposalService.createProposal`, which writes `proposals/{uuid}` **and** `shared_proposals/{uuid}` and records a `create` history entry.
2. **Edit and save.** `ProposalEditor` or `ContractEditor` calls `onSave` → `proposalService.updateProposal(id, fullProposal)`. That reads the current doc, throws if `isLocked`, and `setDoc(merge:true)` writes the caller's fields plus `updatedAt` to both collections. `detectDetailedChanges` then produces a single `proposal_history` "update" entry.
3. **Share and track.** The card's Share action runs `shareProposal`, which copies `${origin}/view/<id>` to the clipboard, then calls `createShareLink`, which re-copies the full `proposals` doc over `shared_proposals` (not a merge). When a client opens `/view/<id>`, `getPublicProposalCached` (admin SDK, 60 s cache) renders the viewer. `TrackProposalView` waits for Firebase auth (up to 1.5 s): if nobody is signed in, it sends POST `/api/proposals/<id>/view` once per session. The route writes a `proposal_views` row and increments `viewCount`. The team sees the counters on `ProposalCard` and opens `ProposalViewsPopover`, which calls GET `/views` with a bearer token.
4. **Client e-signature.** On `/view/<id>`, `SignatureSection` (drawn or typed) calls `onSign`, which POSTs `/api/proposals/<id>/sign` with `{signatureData, method}`. The route validates, returns 409 if already signed, builds the `SignatureAudit`, and overwrites the full doc in both collections with `status:'approved'` and `isLocked:true`. It adds a `proposal_history` 'signed' row and fires `/api/send-notification` → Gmail to the agency signer's email. The viewer then re-reads `shared_proposals` with the client SDK.
5. **Agency counter-sign.** In the app viewer, `AgencySignatureDialog` (draw, or reuse a saved agency signature) calls `proposalService.signAsAgency`, which deep-merges `data.signatures.agency.{signatureData, signedAt, signatureAudit:{method:'drawn'}}` into both docs. This is **allowed on locked docs**. For contracts, both `signedAt` fields together mean "fully executed".
6. **Agreement from markdown (UI or CLI).** In the UI, "Compose Agreement from Markdown" opens `ComposeMarkdownDialog` with `CONTRACT_COMPOSE_SPEC` → `parseContractMarkdown`, and the draft opens in `ContractEditor`. From the CLI: `npm run --silent contract:template > agreement.md`, edit the file, then `npm run contract:create -- --file agreement.md --author "Name <email>"`. [create-contract.ts](../../scripts/create-contract.ts) parses the file, prints a summary, and writes `proposals` + `shared_proposals` via firebase-admin. `--update <id>` merges into an existing unlocked agreement, `--dry-run` skips writes, `contract:instructions` prints an AI prompt, and `contract:export <id>` dumps an agreement back to markdown. The CLI writes no `proposal_history` row.
7. **PDF.** The viewer "Download PDF" button calls `downloadProposalPDF`, which GETs `/api/generate-pdf?proposalId=`. `capturePdf` loads the **public** `/view/<id>?pdf=1` (so the PDF is of the `shared_proposals` copy, subject to the 60 s cache) and returns an A4 attachment.

## Gotchas and invariants

- **Every proposal is public from the moment it is created.** `createProposal` and `updateProposal` write `shared_proposals` too ([ProposalService.ts:82](../../src/app/modules/proposal/services/ProposalService.ts), `:144`), so drafts are readable at `/view/<id>`. The rules also allow unauthenticated **list** on `shared_proposals` ([firestore.rules:219](../../firestore.rules)), which means anyone with the web API key can enumerate every proposal, including pricing.
- **Locking is enforced only in the client code, not in rules.** `updateProposal` refuses when `isLocked` ([ProposalService.ts:116](../../src/app/modules/proposal/services/ProposalService.ts)) and the editor disables inputs (`ProposalEditor.tsx:146`), but Firestore rules let any team member write a locked doc. The sign route refuses a second signature ([sign/route.ts:110](../../src/app/api/proposals/[id]/sign/route.ts)).
- **Analytics counters belong to the view route.** `updateProposal` writes only the caller's fields with `merge:true` so it doesn't overwrite `viewCount` and the other counters ([ProposalService.ts:128-147](../../src/app/modules/proposal/services/ProposalService.ts)). `createShareLink`, `signProposal` and the sign route, however, **overwrite the whole doc** from a snapshot, so a view recorded between that read and the write is lost.
- **Firestore rejects `undefined`.** Every client write goes through `stripUndefinedDeep` (`ProposalService.ts:10`, mirrored in the CLI). A side effect combined with `merge:true`: setting an optional field to `undefined` (for example turning off payment terms, `PaymentTermsCard.tsx:164`) removes the key from the payload, so the old value **stays in Firestore** on existing proposals.
- **The public page is cached for 60 s** (`unstable_cache`, [view/[id]/page.tsx:94](../../src/app/view/[id]/page.tsx)). A reload right after signing or editing can show the old version. The viewer re-fetches with the client SDK after signing to hide this.
- **Views from team members are not counted**, but only if Firebase auth restores within 1.5 s ([TrackProposalView.tsx:51](../../src/app/modules/proposal/components/TrackProposalView.tsx)). Crawlers and link unfurlers are filtered by UA ([view/route.ts:42](../../src/app/api/proposals/[id]/view/route.ts)). There is one beacon per browser session (`sessionStorage`).
- **The `/views` route deliberately has no `orderBy`.** It sorts in memory ([views/route.ts:32](../../src/app/api/proposals/[id]/views/route.ts)). A comment says the service account could not deploy the composite index, even though `firestore.indexes.json` now declares it.
- **History "editor" is the agency signer, not the signed-in user.** `updateProposal` sets `editorName` and `editorEmail` from `data.signatures.agency` ([ProposalService.ts:152](../../src/app/modules/proposal/services/ProposalService.ts)).
- **Unauthenticated server routes.** `/api/ai/proposal-draft`, `/api/ai/proposal-block` (both spend AI Gateway credit, and `fetchSiteContext` will fetch any URL it is given), `/api/generate-pdf` (launches Chromium, `maxDuration` 300) and `/api/send-notification` (sends email to any `agencyEmail` in the body) all accept anonymous calls.
- **The settings page is ungated** and `configurations` is world-writable in the rules, so anyone who knows the URL can edit About Us, Terms and agency presets.
- **`views` checks only `@activeset.co`**, not the `proposal` module grant, so team members without Proposals access can still list views.
- **Hero images and signatures are data URLs inside the doc.** A large uploaded hero image (`ProposalEditor.tsx:474-482`, no resize) can push the doc toward Firestore's 1 MiB limit, and it is copied to `shared_proposals` as well. The sign route caps signatures at 2 MB.
- **The AI schemas are deliberately loose** ([schemas.ts](../../src/lib/proposal-ai/schemas.ts) header comment). Validation happens in `normalizeDraft`, so do not tighten the Zod enums: Gemini Flash then returns "No object generated".
- **`documentType` missing means 'proposal'.** Every older record relies on this default. Contract routing checks `=== 'contract'` in `ProposalModuleScreen` and `/view/[id]`.
- **Payment terms feed Invoices.** `data.paymentTerms` is read by the Invoices module (`LinkProposalDialog` links a project to a proposal) and expanded with `expandToSlots`. Changing `PaymentTemplate` breaks both.
- **CLI output hygiene.** firebase-admin is imported lazily (`requireDb`, [create-contract.ts:144](../../scripts/create-contract.ts)) so that `template` and `instructions` stdout stays clean. Run `contract:template` with `npm run --silent`, otherwise the npm banner ends up in the file. The untracked repo-root `agreement.md` is an example of exactly that: it is the starter template with the `> project-links-widget@0.1.0 contract:template` banner left at the top.

## Tests

- [tests/firestore.rules.test.ts](../../tests/firestore.rules.test.ts) covers `proposals`/`templates` (team only) and `shared_proposals` (public read, team-only write). Run it with `npm run test:rules` (Firestore emulator).
- There are no unit tests for the proposal services, markdown parsers, AI normalizers or API routes. `npm test` does not touch this module.

## Related docs

- [docs/features/proposal.md](../features/proposal.md) is **partially stale**. What is wrong:
  - It names the AI endpoints `/api/ai-gen` and `/api/ai-gen-block`, which do not exist; they are `/api/ai/proposal-draft` and `/api/ai/proposal-block`.
  - It says `GEMINI_API_KEY` is required; the proposal AI actually uses the AI Gateway with `PROPOSAL_AI_MODEL`.
  - It names the templates collection `proposal_templates`; the real collection is `templates`.
  - Its PDF section describes Docker/Railway, system fonts and `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD`; the actual deployment is Vercel with `@sparticuz/chromium`.
  - "Signing a Proposal (Client)" shows `proposalService.signProposal`; the public flow actually uses `POST /api/proposals/[id]/sign`.
  - "Known Limitations: Single Signature" is out of date: the agency counter-sign exists.
  - "Authentication bypassed on localhost" is not true for this module.
  - It does not mention `proposal_views`, view tracking, the OG image, `SignatureAudit`, the contract fields or `documentType`.

  The editor, markdown, contract CLI and comment/history descriptions are broadly accurate.
- [docs/features/settings.md](../features/settings.md) covers the settings editors and Team Access. Partially stale: it lists `RESTRICTED_MODULES` as `['proposal','project-links']`; the code also has `'invoices'`.
- [docs/features/client-portal.md](../features/client-portal.md) is accurate on the point relevant here: the client portal reuses the shared `ViewsPopover` and the `PROPOSAL_VIEW_IP_SALT` env var.
