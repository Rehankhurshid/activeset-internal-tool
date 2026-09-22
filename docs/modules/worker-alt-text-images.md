---
module: worker-alt-text-images
title: Worker machine, alt text and image pipeline
keywords: [worker, worker machine, Goliath, GPU box, Windows, NSSM, worker_jobs, workers, job queue, heartbeat, claim, Ollama, qwen2.5vl, vision model, alt text, ALT, alt_suggestions, classifier, taxonomy, portrait, decorative, needsReview, held for review, PROMPT_VERSION, cache, image_budget, Weight tab, 2x retina, oversized, undersized, image_apply, optimise, Optimise everything, Designer copy, ActiveSet · optimised, library_group, Images screen, image_index, optimiseSettled, alt_apply, webflow_alt, Bunny, backup, originals, Free the GPU, Run checks, Pause, cms-alt, npm run worker, npm run alt, Live, Not published yet]
entry_points: [/modules/project-links/[id] (Audit tab → Alt text, Weight), /modules/project-links/[id]?tab=webflow (sidebar → Images)]
code_roots: [scripts/worker.ts, src/lib/worker/, src/lib/alt-text/, src/lib/image-budget/, src/lib/backup/, src/modules/site-monitoring/infrastructure/, src/components/webflow/WebflowImagesDashboard.tsx]
last_verified: 2026-09-23 @ a00f91e
---
# Worker machine, alt text and image pipeline

> An always-on PC (currently "Goliath", a Windows box with an RTX 3070 Ti) runs `npm run worker run`, polls the Firestore `worker_jobs` collection, and does the work that does not fit a Vercel function: drafting ALT text with a local Ollama vision model, measuring how wide every image is actually displayed in headless Chrome, re-encoding/resizing images, archiving originals to Bunny storage, and writing ALT / repointed image URLs back to Webflow. The team queues jobs straight from the browser (client-SDK Firestore write, no API route) on three screens: the project Audit tab's **Alt text** and **Weight** tabs, and the Webflow tab's **Images** screen (one section per group, "Optimise everything"). The Weight tab also hosts the **worker panel** (online/offline, pause, model, Restart/Update/Run checks/Clear cache/Free the GPU). The same alt-text library also runs from a terminal (`npm run alt …`), and there is an older, separate CSV CLI (`npm run cms-alt`, `packages/cms-alt`).

## Where to find things (quick lookup)

| I want to… | Go to |
|---|---|
| Add a new job kind | `WorkerJobKind` in [queue.ts](../../src/lib/worker/queue.ts) **and** [worker.repository.ts](../../src/modules/site-monitoring/infrastructure/worker.repository.ts) (duplicated union), a handler in [src/lib/worker/handlers/](../../src/lib/worker/handlers/), a branch in `handle()` + the `kinds` default list in [scripts/worker.ts](../../scripts/worker.ts) |
| Change how a job is claimed / reclaimed | `claimNextJob`, `CLAIM_TIMEOUT_MS` in [queue.ts](../../src/lib/worker/queue.ts) |
| Change the poll loop, pause handling, exit-for-restart | `loop()` in [scripts/worker.ts](../../scripts/worker.ts) |
| Add a remote-control action | `WorkerAction`/`WORKER_ACTIONS`/`ACTION_LABEL` in [worker-control.ts](../../src/modules/site-monitoring/domain/worker-control.ts) + `performCommand` switch in [control-admin.ts](../../src/lib/worker/control-admin.ts) |
| Add an allowed vision model | `KNOWN_MODELS` in [worker-control.ts](../../src/modules/site-monitoring/domain/worker-control.ts); VRAM advice in `recommendModel` in [scripts/worker.ts](../../scripts/worker.ts) |
| Change the ALT prompt / categories / rules | `KIND_RULES`, `systemPrompt`, `userPrompt`, **bump `PROMPT_VERSION`** in [taxonomy.ts](../../src/lib/alt-text/taxonomy.ts) |
| Change deterministic ALT repairs | `validateJudgment`, `altForRecordPortrait` in [validate.ts](../../src/lib/alt-text/validate.ts) |
| Change the "no model needed" rules (spacer pixel, flat colour, hairline) | `precheck` in [prepare.ts](../../src/lib/alt-text/prepare.ts) |
| Change how one image is drafted (cache, consensus, verify, review holds) | `generateAltText` in [generate.ts](../../src/lib/alt-text/generate.ts) |
| Change the Ollama client / keep-alive / GPU unload | [ollama.ts](../../src/lib/alt-text/ollama.ts) (`resolveOllama`, `generateJson`, `listLoadedModels`, `unloadModel`) |
| Change what page context an image gets | `extractImageContexts` in [context.ts](../../src/lib/alt-text/context.ts) |
| Change the encoder (lossless vs q90, AVIF, animation skip) | `encodeAtWidth` in [handlers/image-budget.ts](../../src/lib/worker/handlers/image-budget.ts) |
| Change the 2× retina maths / thresholds | [domain/image-budget.ts](../../src/modules/site-monitoring/domain/image-budget.ts) (`PIXEL_DENSITY`, `OVERSIZE_TOLERANCE`, `UNDERSIZE_AT`, `MIN_SAVING_*`, `assessImageWeight`) |
| Change how pages are measured in Chrome | `measurePage`, `DEFAULT_VIEWPORTS` in [measure.ts](../../src/lib/image-budget/measure.ts); browser discovery in [browser.ts](../../src/lib/image-budget/browser.ts) |
| Change "skip already-done images" | `optimiseSettled` in [domain/image-index.ts](../../src/modules/site-monitoring/domain/image-index.ts); writes in [image-index-admin.ts](../../src/lib/image-index-admin.ts) |
| Change what one-click Optimise does per group | `runLibraryGroup`, `isConfident` in [handlers/library-group.ts](../../src/lib/worker/handlers/library-group.ts) |
| Change bulk ALT write-back to Webflow | `runAltApply` in [handlers/alt-apply.ts](../../src/lib/worker/handlers/alt-apply.ts) |
| Change swap/repoint/backup of CMS images | `runImageApply`, `carryAltAcross` in [handlers/image-apply.ts](../../src/lib/worker/handlers/image-apply.ts) |
| Change Bunny archive paths / probe | `backupPath`, `putToBunny`, `probeBunny` in [bunny.ts](../../src/lib/backup/bunny.ts) |
| Change the Images screen (groups, rows, Save, Live badge) | [WebflowImagesDashboard.tsx](../../src/components/webflow/WebflowImagesDashboard.tsx) + [useLibraryOptimise.ts](../../src/modules/site-monitoring/ui/hooks/useLibraryOptimise.ts) |
| Change the worker panel | [WorkerPanel.tsx](../../src/modules/site-monitoring/ui/components/audit/WorkerPanel.tsx), [useWorkerControl.ts](../../src/modules/site-monitoring/ui/hooks/useWorkerControl.ts) |
| Change Audit-tab queue buttons | `worker.enqueue(...)` calls in [WebsiteAuditDashboardScreen.tsx](../../src/modules/site-monitoring/ui/screens/WebsiteAuditDashboardScreen.tsx) (Alt text + Weight `TabsContent`) |
| Run the classifier from a terminal | [scripts/alt-text.ts](../../scripts/alt-text.ts) (`npm run alt doctor / page / site / image / project / cache / eval`) |
| Load env in a new script that touches firebase-admin | `import '@/lib/load-env'` **first** — [load-env.ts](../../src/lib/load-env.ts) |

## User-facing pages

| URL | File | What it shows | Access |
|---|---|---|---|
| `/modules/project-links/[id]` → Audit tab → **Alt text** | [AltTextTab.tsx](../../src/modules/site-monitoring/ui/components/audit/AltTextTab.tsx) (rendered by [WebsiteAuditDashboardScreen.tsx](../../src/modules/site-monitoring/ui/screens/WebsiteAuditDashboardScreen.tsx)) | Open alt findings from scans; drafts from `alt_suggestions` fill the boxes; "Draft on `<worker>`" queues `alt_text`; bulk apply queues `alt_apply` (only when the project has a Webflow API token) | Signed-in team with project access. Worker hooks disabled when `isReadOnly` |
| `/modules/project-links/[id]` → Audit tab → **Weight** | [WeightTab.tsx](../../src/modules/site-monitoring/ui/components/audit/WeightTab.tsx) + [WorkerPanel.tsx](../../src/modules/site-monitoring/ui/components/audit/WorkerPanel.tsx) | `image_budget` findings grouped CMS / asset-or-Designer / not classified; "Measure sizes" queues `image_budget {limit:40}`; "Optimise all N" queues `image_apply`; worker roster + controls | Same |
| `/modules/project-links/[id]?tab=webflow` → sidebar **Images** | [WebflowImagesDashboard.tsx](../../src/components/webflow/WebflowImagesDashboard.tsx) (inside [WebflowPagesDashboard.tsx](../../src/components/webflow/WebflowPagesDashboard.tsx)) | One section per group (General assets, then each CMS collection); per-group **Optimise**, top **Optimise everything**, optional publish; row checkboxes → ALT + images / ALT only / images only; per-row draft, index state ("Optimised · −1.2 MB", "Already optimal", "Copy ready for Designer", "Failed — retried next run"), **Live / Not published yet / Item not published**; inline Save → `alt_apply` with `overrides` | Requires `webflowConfig` on the project |
| `/share/project-links/[token]` | [SharedProjectTabs.tsx](../../src/app/share/project-links/[token]/SharedProjectTabs.tsx) | Audit screen with `isReadOnly` — no worker subscriptions, no queue buttons | Share-token viewers |

Note: the project tab labelled **Image Library** (`?tab=images`, `ImageLibrary`) is a different, older feature and does not use the worker.

## API routes

No API route queues worker jobs or reads worker status — both go directly through the Firestore client SDK ([worker.repository.ts](../../src/modules/site-monitoring/infrastructure/worker.repository.ts)), gated by `firestore.rules`. The Images screen reads Webflow through these routes (owned by the Webflow module doc; listed here because this screen depends on them):

| Method | Path | File | Auth | Purpose |
|---|---|---|---|---|
| GET | `/api/webflow/cms/live` | [route.ts](../../src/app/api/webflow/cms/live/route.ts) | Firebase ID token + project access (`resolveWebflowToken` → `requireProjectAccess`), token from project | Published ALT/URL per CMS image entry from `api-cdn.webflow.com/v2/collections/{id}/items/live`; drives the Live badge (added a00f91e) |
| GET | `/api/webflow/cms/discover` | [route.ts](../../src/app/api/webflow/cms/discover/route.ts) | same | List collections with image fields |
| GET | `/api/webflow/cms/count-alt` | [route.ts](../../src/app/api/webflow/cms/count-alt/route.ts) | same | Missing-ALT counts per collection |
| GET | `/api/webflow/cms/items` | [route.ts](../../src/app/api/webflow/cms/items/route.ts) | same | Staged CMS image entries for a collection |
| GET | `/api/webflow/assets` | [route.ts](../../src/app/api/webflow/assets/route.ts) | same | Site asset list (`useWebflowAssets`) |

## Code map

### Worker entry point and CLIs (`scripts/`)
- [scripts/worker.ts](../../scripts/worker.ts) — commander CLI `npm run worker <doctor|run|once|enqueue>`. `readHardware` (nvidia-smi), `recommendModel` (≥20 GB VRAM → `qwen2.5vl:32b`, else `qwen2.5vl:7b`), `handle(job)` dispatch by `kind`, `buildDoctorReport` (text sent back for "Run checks"), `loop()` (reads desired state → `reportWorkerAlive` → claims one command → else claims a job unless paused → `completeJob`/`failJob`; exits code 75 on restart/update). `enqueue` only accepts `alt_text|image_budget|alt_apply|webflow_alt`.
- [scripts/alt-text.ts](../../scripts/alt-text.ts) — `npm run alt`: `doctor`, `image`, `page`, `site`, `project <projectId>` (same logic as the `alt_text` job, writes `alt_suggestions`; `--dry-run`, `--pages`), `cache --clear`, `eval <file>`. Common flags `--model --host --consensus --verify --no-cache --limit --json/--csv/--markdown`.
- [scripts/cms-alt.ts](../../scripts/cms-alt.ts) — `npm run cms-alt <scan|export|generate|compress|import|publish|run>`: older CSV pipeline using `src/lib/cms/*` and its own Ollama caller `src/lib/cms/ai-alt.ts` (default `gemma3:4b`). Does **not** use `src/lib/alt-text`, the queue, the index or Bunny. `compress` re-encodes at unchanged dimensions.
- [packages/cms-alt/](../../packages/cms-alt/) — the same CSV pipeline as a separately published npm package `@activeset/cms-alt` (v0.6.0, own copies of the code in `src/`). No app code imports it.

### `src/lib/worker/`
- [queue.ts](../../src/lib/worker/queue.ts) — admin-SDK queue: `enqueueJob` (used by CLI), `claimNextJob(workerId, kinds?)` (reads ≤10 queued + ≤10 running, oldest `createdAt` first, transaction claim; a running job whose `heartbeatAt` is older than `CLAIM_TIMEOUT_MS` = 5 min is reclaimable), `heartbeat(jobId, progress, fraction, current)` (also `currentSrc`/`currentPhase`), `completeJob`, `failJob` (error truncated to 2000 chars), `reportWorkerAlive` (merges into `workers/{id}`).
- [control-admin.ts](../../src/lib/worker/control-admin.ts) — worker side of remote control: `readDesiredState` (re-validated), `claimNextCommand` (rejects unknown actions in-transaction), `finishCommand` (output ≤4000 chars), `performCommand` (`doctor`, `restart`, `release_gpu` via `unloadModel`, `clear_cache`, `update` = refuse dirty tree → `git pull --ff-only` → `npm install` → exit).
- [handlers/alt-text.ts](../../src/lib/worker/handlers/alt-text.ts) — `runAltTextForProject` (job `alt_text`).
- [handlers/webflow-alt.ts](../../src/lib/worker/handlers/webflow-alt.ts) — `runWebflowAlt` (job `webflow_alt`).
- [handlers/alt-apply.ts](../../src/lib/worker/handlers/alt-apply.ts) — `runAltApply` (job `alt_apply`, also called by `library_group`).
- [handlers/image-budget.ts](../../src/lib/worker/handlers/image-budget.ts) — `runImageBudget` (job `image_budget`), `encodeAtWidth` (shared encoder), `StoredWeightFinding` type, `describeResult`.
- [handlers/image-apply.ts](../../src/lib/worker/handlers/image-apply.ts) — `runImageApply` (job `image_apply`, also called by `library_group`), `carryAltAcross`.
- [handlers/library-group.ts](../../src/lib/worker/handlers/library-group.ts) — `runLibraryGroup` (job `library_group`), `isConfident`, `groupKey`.

### `src/lib/alt-text/` (Ollama classifier; Node-only except `types.ts`)
- [index.ts](../../src/lib/alt-text/index.ts) — barrel.
- [types.ts](../../src/lib/alt-text/types.ts) — `AltKind` (10 kinds), `Certainty`, `ImageContext` (incl. `subject` = trusted CMS item name), `ImageFacts`, `RawJudgment`, `AltSuggestion`. Client-safe.
- [taxonomy.ts](../../src/lib/alt-text/taxonomy.ts) — `KIND_RULES`, `MAX_ALT_CHARS = 125`, `PROMPT_VERSION = 6`, `EMPTY_ALT_KINDS`, `ALWAYS_REVIEW_KINDS` (`chart`, `portrait`), `systemPrompt`, `userPrompt`, `judgmentSchema`, `fileNameOf`.
- [prepare.ts](../../src/lib/alt-text/prepare.ts) — `fetchImageBytes` (http, data:, file paths), `precheck`, `prepareImage` (sha256, sharp stats, shrink to `DEFAULT_MAX_DIM = 1024`, flatten on white, JPEG base64).
- [context.ts](../../src/lib/alt-text/context.ts) — `fetchPage`, `extractImageContexts` (cheerio; heading/caption/link/region/classes per image).
- [ollama.ts](../../src/lib/alt-text/ollama.ts) — `DEFAULT_HOST = http://127.0.0.1:11434`, `DEFAULT_MODEL = qwen2.5vl:7b`, `resolveOllama`, `checkOllama`, `generateJson` (schema-constrained `/api/generate`, one retry on transport error only), `listLoadedModels` (`/api/ps`), `unloadModel` (`keep_alive: 0`).
- [generate.ts](../../src/lib/alt-text/generate.ts) — `generateAltText` (cache → precheck → N samples → `validateJudgment` → record-portrait trim → review holds → optional verify → write cache), `generateAltTextBatch` (concurrency default 1).
- [validate.ts](../../src/lib/alt-text/validate.ts) — `validateJudgment`, `truncateAlt`, `stripRedundantOpener`, `echoesFileName`, `altForRecordPortrait`.
- [cache.ts](../../src/lib/alt-text/cache.ts) — on-disk JSON cache in `ALT_TEXT_CACHE_DIR` or `./.cache/alt-text`; `cacheKey(sha256|model|promptVersion|contextDigest)`, `clearCache`.

### `src/lib/image-budget/`
- [browser.ts](../../src/lib/image-budget/browser.ts) — `findBrowserExecutable` (env, then Windows/mac/Linux Chrome/Edge paths), `launchMeasuringBrowser` (puppeteer, headless, anti-backgrounding flags), `NoBrowserError`.
- [measure.ts](../../src/lib/image-budget/measure.ts) — `measurePage(browser, url, {viewports})` at `DEFAULT_VIEWPORTS = [1440, 768, 390]` (collector injected as source text, see Gotchas), `attachFileFacts` (bytes/dimensions/format of each file).

### Other `src/lib/`
- [image-index-admin.ts](../../src/lib/image-index-admin.ts) — `readImageIndex(projectId)`, `recordInIndex(projectId, updates)` (merge set, batches of 400, doc id `imageIndexId(fingerprint)`).
- [alt-suggestions-admin.ts](../../src/lib/alt-suggestions-admin.ts) — `loadProjectForAltText` (open/regressed alt findings from `link_audits` + `audit_decisions` via `collectFindings`), `saveAltSuggestions` (doc id `decisionId('alt', fingerprint)`, full overwrite). Deliberately not `server-only` (the CLI imports it).
- [backup/bunny.ts](../../src/lib/backup/bunny.ts) — `bunnyConfig`, `BUNNY_NOT_CONFIGURED`, `backupPath` → `originals/<projectId>/<YYYY-MM-DD>/<fingerprint>-<file>`, `putToBunny` (PUT with `AccessKey`), `probeBunny` (write + read back + pull-zone GET).
- [load-env.ts](../../src/lib/load-env.ts) — loads `.env.local`, `.env.vercel-production`, `.env` in that order (first value wins); `isPlaceholder`/`env` treat `[SENSITIVE]`/`[SECRET]` as absent.
- Webflow helpers used by handlers (owned by the Webflow/CMS doc): `src/lib/cms/library.ts` (`listSiteAssets`, `listCollectionImages`, `buildCmsIndex`), `src/lib/cms/placement.ts` (`placementsFor`, `ensureOptimisedFolder`, `OPTIMISED_FOLDER_NAME = 'ActiveSet · optimised'`), `src/lib/cms/webflow-client.ts` (`webflowFetch` retries 429, `patchItems`, `publishItems`), `src/lib/cms/assets.ts` (`uploadAssetToWebflow`, `sanitizeAssetFileName`), `src/lib/cms/patch.ts` (`groupUpdatesByItem`), `src/lib/project-admin.ts` (`loadProjectDocAdmin`, `getWebflowTokenAdmin`).

### `src/modules/site-monitoring/` (client side + pure domain)
- [domain/worker-control.ts](../../src/modules/site-monitoring/domain/worker-control.ts) — `WorkerDesiredState`, `WorkerAction`, `ACTION_LABEL`, `KNOWN_MODELS`, `validateDesired`, `WORKER_OFFLINE_AFTER_MS = 90 s`, `COMMAND_STALE_AFTER_MS = 10 min`, `describeWorkerState`.
- [domain/image-index.ts](../../src/modules/site-monitoring/domain/image-index.ts) — `ImageIndexEntry`, `AltState`, `OptimiseState`, `optimiseSettled`.
- [domain/image-budget.ts](../../src/modules/site-monitoring/domain/image-budget.ts) — `ImageMeasurement`, `WeightAssessment`, `assessImageWeight`, `summariseWeight`, `formatBytes`.
- [domain/audit-findings.ts](../../src/modules/site-monitoring/domain/audit-findings.ts) — `imageFingerprint` (host+path), `decisionId`, `imageIndexId`, `fileNameOf`.
- [domain/webflow-assets.ts](../../src/modules/site-monitoring/domain/webflow-assets.ts) — `cmsSourceAssetIds`, `resolveAssets`.
- [infrastructure/worker.repository.ts](../../src/modules/site-monitoring/infrastructure/worker.repository.ts) — `workerRepository.enqueue` (client `addDoc` to `worker_jobs`), `subscribeJobs` (by `projectId`, limit 40, sorted in memory), `subscribeWorkers` (orderBy `lastSeenAt` desc, limit 10), `subscribeWeight`, `subscribeControl`, `setDesired`, `sendCommand`; `isWorkerOnline`; types `WorkerJobDoc`, `WorkerDoc`, `WeightFindingDoc`.
- [infrastructure/alt-suggestions.repository.ts](../../src/modules/site-monitoring/infrastructure/alt-suggestions.repository.ts) — read-only subscription → `Map<fingerprint, AltSuggestionDoc>`.
- [infrastructure/image-index.repository.ts](../../src/modules/site-monitoring/infrastructure/image-index.repository.ts) — read-only subscription → `Map<fingerprint, ImageIndexEntry>`.
- [ui/hooks/useWorker.ts](../../src/modules/site-monitoring/ui/hooks/useWorker.ts) — Audit tab: jobs, workers, weight, `online` (re-evaluated every 15 s), `activeJob`, `lastDone(kind)`, `enqueue(kind, payload, requestedBy)`.
- [ui/hooks/useWorkerControl.ts](../../src/modules/site-monitoring/ui/hooks/useWorkerControl.ts) — panel: `setPaused`, `setModel`, `send(action)`.
- [ui/hooks/useLibraryOptimise.ts](../../src/modules/site-monitoring/ui/hooks/useLibraryOptimise.ts) — Images screen: `optimise(groups, publish, {srcs, steps})` queues one `library_group` per group not already active; `saveAlt` queues `alt_apply` with `overrides`; `draftFor`, `indexFor`, `activeFor`, `lastFor`, `isConfidentDraft`, `libraryGroupKey`.
- [ui/hooks/useAltSuggestions.ts](../../src/modules/site-monitoring/ui/hooks/useAltSuggestions.ts) — Audit tab subscription to drafts.
- [ui/components/audit/WorkerPanel.tsx](../../src/modules/site-monitoring/ui/components/audit/WorkerPanel.tsx), [WeightTab.tsx](../../src/modules/site-monitoring/ui/components/audit/WeightTab.tsx), [AltTextTab.tsx](../../src/modules/site-monitoring/ui/components/audit/AltTextTab.tsx).

### Components / hooks outside the module
- [src/components/webflow/WebflowImagesDashboard.tsx](../../src/components/webflow/WebflowImagesDashboard.tsx) — the Images screen (groups, rows, Save, Live badge; never pre-fills a portrait draft that names someone other than the CMS item).
- [src/hooks/useCmsImages.ts](../../src/hooks/useCmsImages.ts) — `discoverCollections`, `loadCollectionImages`, `loadPublished` (→ `/api/webflow/cms/live`).
- `src/hooks/useWebflowAssets.ts` — asset list for the General assets section.

## Data model

All worker writes use **firebase-admin** (`FIREBASE_SERVICE_ACCOUNT_JSON` et al. on the worker). The browser uses the client SDK.

| Path | One doc = | Key fields (type, file) | Written by | Read by |
|---|---|---|---|---|
| `worker_jobs/{auto}` | one queued unit of work | `kind`, `projectId`, `projectName?`, `payload`, `status` (`queued / running / done / failed / cancelled`), `progress`, `fraction`, `currentSrc`, `currentPhase`, `claimedBy`, `claimedAt`, `heartbeatAt`, `finishedAt`, `result` (+`durationMs`), `error`, `requestedBy`, `createdAt` (ISO), `attempts` — `WorkerJob` in [queue.ts](../../src/lib/worker/queue.ts), `WorkerJobDoc` in [worker.repository.ts](../../src/modules/site-monitoring/infrastructure/worker.repository.ts) | browser (client `addDoc`) or CLI `enqueue` creates; worker claims/updates | browser subscription per project; worker |
| `workers/{workerId}` | one machine's self-report | hardware (`platform`, `cpu`, `cores`, `ramGb`, `gpu`, `vramGb`), `model`, `paused`, `kinds`, `busyWith`, `lastSeenAt` (ISO), `updatedAt` — `WorkerDoc` | worker only (`reportWorkerAlive`, every poll and every ≥20 s during a job) | browser roster |
| `workers/{id}/control/desired` | settings to converge on | `paused?`, `model?`, `by`, `at` — `WorkerDesiredState` | browser (`setDesired`) | worker each poll (`readDesiredState`) |
| `workers/{id}/commands/{auto}` | one action | `action`, `status` (`pending / running / done / failed / rejected`), `requestedBy`, `createdAt`, `startedAt`, `finishedAt`, `output` — `WorkerCommand` | browser creates; worker updates | both |
| `projects/{id}/alt_suggestions/{decisionId('alt', fp)}` | one ALT draft per image fingerprint | `fingerprint`, `src`, `kind`, `certainty`, `alt`, `visibleText`, `longDescription`, `observation`, `needsReview`, `notes`, `agreement`, `verified`, `model`, `generatedAt`, `updatedAt`; after a human save also `reviewedBy`, `reviewedAt`; after a swap `carriedFrom` — `StoredAltSuggestion` in [alt-suggestions-admin.ts](../../src/lib/alt-suggestions-admin.ts), `AltSuggestionDoc` client-side | worker (`saveAltSuggestions`, `alt_apply` overrides, `carryAltAcross`), `npm run alt project` | Alt text tab, Images screen |
| `projects/{id}/image_budget/{fingerprint sanitised}` | one measured image | `WeightAssessment` fields + `fingerprint`, `pages[]`, `widestAt`, `isBackground`, `hasSrcset`, `optimisedBytes/Path/How`, `placement` (`cms / asset / unknown`), `replacement` (Designer copy), `format`, `measuredAt` — `StoredWeightFinding` in [handlers/image-budget.ts](../../src/lib/worker/handlers/image-budget.ts) | worker; **whole collection deleted and rewritten on every `image_budget` run** (`replacement` carried over) ; `image_apply` patches `placement`/`replacement` | Weight tab (`subscribeWeight`); `image_apply` |
| `projects/{id}/image_index/{imageIndexId(fp)}` | what has been done to one image | `fingerprint`, `src`, `group` (`assets` or collection id), `alt {state: present / added / held / decorative, text?, at}`, `optimise {state: optimised / already-optimal / designer-copy / failed, at, width, bytesBefore, bytesAfter, replacedBy, replaces, designerCopyUrl, error}`, `updatedAt` — `ImageIndexEntry` in [domain/image-index.ts](../../src/modules/site-monitoring/domain/image-index.ts) | worker only (merge) | Images screen; `image_apply` before downloading |
| `projects/{id}/audit_decisions/{decisionId(kind, fp)}` | team/worker decision on a finding | `alt_apply` writes `kind:'alt'`, `decision: fixed_unverified / decorative`, `altText`; `image_apply` writes `kind:'weight'`, `decision:'fixed_unverified'`, `previousUrl`, `previousBytes`, `targetWidth`, `backupUrl` | worker (also the Audit tab; owned by audit doc) | Audit tabs; `library_group` reads `decision == 'decorative'` |
| `projects/{id}/link_audits` | per-page audit result | read by `loadProjectForAltText` only | scanner (other doc) | `alt_text` |

**firestore.rules** ([firestore.rules](../../firestore.rules)):
- `worker_jobs`: read, create, **update** by any `@activeset.co` user; delete admin only.
- `workers/{id}`: read team; write `false` (admin SDK only). `control/*`: read/write team. `commands/*`: read/create team; update/delete `false`.
- `alt_suggestions` and `image_budget`: read **and write** `canAccessProjectById()` (browser can write, though no client code does).
- `image_index`: read `canAccessProjectById()`; write `false`. Tested in [tests/firestore.rules.test.ts](../../tests/firestore.rules.test.ts) (`describe('image_index')`).

**firestore.indexes.json**: no entries for these collections. Queries are designed to avoid composite indexes (single-field `where` + in-memory sort in `claimNextJob` and `subscribeJobs`).

**Storage**: none in Firebase. Originals go to Bunny storage (see External services). `image_budget` can write resized files to a local directory on the worker (`emitDir`). The ALT cache is local JSON files on whichever machine runs the classifier.

## Background jobs

No Vercel crons touch this area (vercel.json has none). All background work is worker jobs:

| Kind | Queued from | Payload (type, file) | What it does | Writes |
|---|---|---|---|---|
| `alt_text` | Alt text tab "Draft on `<worker>`" → `{pageLimit: 40}`; CLI `enqueue` | `AltTextPayload` ([alt-text.ts](../../src/lib/worker/handlers/alt-text.ts)): `pageLimit` (default 40), `concurrency`, `dryRun`, plus `GenerateOptions` (`model`, `host`, `consensus`, `verify`, `noCache`, `reviewBelow`, `maxDim`…) | Loads open/regressed alt findings, re-fetches up to `pageLimit` pages (most-missing first), extracts contexts for wanted fingerprints, dedupes by fingerprint (most-shared first), drafts each | `alt_suggestions` (unless `dryRun`) |
| `webflow_alt` | **No UI caller** — only `npm run worker enqueue webflow_alt <projectId>` | `WebflowAltPayload` ([webflow-alt.ts](../../src/lib/worker/handlers/webflow-alt.ts)): `scope` (`missing` default / `all`), `srcs?`, `sources` (`assets`,`cms`), `limit` (300), `concurrency`, + `GenerateOptions` | Drafts ALT for the whole Webflow library: image assets (skips non-`image/*`) and every CMS collection image (item name as `subject`); dedupes by src | `alt_suggestions` |
| `alt_apply` | Alt text tab bulk apply `{fingerprints, publish, by}`; Images screen Save `{fingerprints:[fp], overrides:[{fingerprint,src,alt}], by}`; internally by `library_group` | `AltApplyPayload` ([alt-apply.ts](../../src/lib/worker/handlers/alt-apply.ts)): `fingerprints` (required), `publish`, `by`, `overrides`, `collectionIds` (undefined = all, `[]` = none), `includeAssets` (default true) | Loads drafts for the fingerprints, applies overrides (empty = decorative), writes CMS fields (every field using the image, PATCH chunks of 25, optional publish) or asset `altText` via Assets API; skips anything that is neither | Webflow; `audit_decisions` (`fixed_unverified`/`decorative`); for overridden ones `alt_suggestions` as reviewed; `image_index.alt` (`added`/`decorative`) |
| `image_budget` | Weight tab "Measure sizes" `{limit: 40}`; CLI `enqueue … --pages --emit` | `ImageBudgetPayload` ([image-budget.ts](../../src/lib/worker/handlers/image-budget.ts)): `pages?` (default project `links` with `source === 'auto'`), `limit` (40), `emitDir?`, `viewports?` | Headless Chrome at 1440/768/390 per page, merges to widest slot per image, fetches file facts, assesses 2×, classifies placement via Webflow, optionally encodes oversized files to `emitDir` | Replaces all of `image_budget`; files on worker disk |
| `image_apply` | Weight tab "Optimise" `{fingerprints, designerCopies, publish:false, by}`; internally by `library_group` with `srcs` | `ImageApplyPayload` ([image-apply.ts](../../src/lib/worker/handlers/image-apply.ts)): `fingerprints?`, `srcs?`, `publish`, `by`, `designerCopies`, `collectionIds`, `group`, `force` | **Refuses without Bunny.** For CMS images: skip if `optimiseSettled`, fetch, `encodeAtWidth` (measured width if oversized else original size; skip if saving < 8 KB or < 15 % when not resizing; skip undersized), archive original to Bunny, upload new asset, repoint every field, optional publish, re-read fields to learn the served URL, carry drafts/decisions to it. For non-CMS measured-oversized with `designerCopies`: upload a copy into "ActiveSet · optimised" folder (idempotent by name) | Webflow assets + CMS; Bunny; `image_budget.placement/replacement`; `image_index.optimise` (original and replacement); `alt_suggestions`/`audit_decisions` copies; `audit_decisions` `weight` |
| `library_group` | Images screen Optimise / Optimise everything / selected rows | `LibraryGroupPayload` ([library-group.ts](../../src/lib/worker/handlers/library-group.ts)): `group` (`{kind:'assets'}` or `{kind:'collection', collectionId, name?}`), `srcs?`, `steps {alt?, images?}` (both default on), `force`, `publish`, `by` | Lists the group's images (General assets = image assets minus `cmsSourceAssetIds`); ALT half: redraft missing images without a confident draft, one image at a time (saved immediately), then `runAltApply` for confident ones (`!needsReview && certainty !== 'low'`), record ALT state in index; images half: `runImageApply` with `designerCopies` for assets. Throws only if neither half did anything and there are errors | Everything the two sub-handlers write + `image_index.alt` for every image in the group |

Job lifecycle: `queued` → worker `claimNextJob` → `running` (heartbeat each progress call) → `done` (`result`) or `failed` (`error`). `cancelled` exists in the type but nothing sets it. A job whose heartbeat is > 5 min old is reclaimed (`attempts` increments).

Remote-control commands (not jobs): `restart`, `update`, `doctor`, `clear_cache`, `release_gpu` — see `performCommand` in [control-admin.ts](../../src/lib/worker/control-admin.ts). Commands are handled before jobs each cycle and even while paused.

## Configuration

Env vars (worker machine unless stated; all grep-confirmed as `process.env.X`):

| Var | Required | Used in |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` (or `FIREBASE_SERVICE_ACCOUNT_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_CLIENT_EMAIL`+`FIREBASE_PRIVATE_KEY`, …) | yes | `src/lib/firebase-admin.ts`; without it the queue throws `WorkerQueueUnavailableError` |
| `OLLAMA_HOST` | no (default `http://127.0.0.1:11434`) | [ollama.ts](../../src/lib/alt-text/ollama.ts); also `src/lib/cms/ai-alt.ts` (default `http://localhost:11434`) |
| `OLLAMA_ALT_MODEL`, then `OLLAMA_MODEL` | no (default `qwen2.5vl:7b`) | [ollama.ts](../../src/lib/alt-text/ollama.ts); the worker overwrites `process.env.OLLAMA_ALT_MODEL` from `control/desired.model` at runtime. `OLLAMA_MODEL` alone drives cms-alt (default `gemma3:4b`) |
| `OLLAMA_KEEP_ALIVE` | no (default `15m`) | [ollama.ts](../../src/lib/alt-text/ollama.ts) — sent in every request body; set it on the **worker** service, not Ollama's |
| `ALT_TEXT_CACHE_DIR` | no (default `./.cache/alt-text`) | [cache.ts](../../src/lib/alt-text/cache.ts), read at module load |
| `WORKER_ID` | no (default hostname; `--id` wins) | [scripts/worker.ts](../../scripts/worker.ts) |
| `WORKER_EMIT_DIR` | no | [scripts/worker.ts](../../scripts/worker.ts) — overrides `image_budget` `emitDir` when set |
| `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_KEY` | yes for `image_apply` / `library_group` images half | [bunny.ts](../../src/lib/backup/bunny.ts) |
| `BUNNY_STORAGE_HOST` | no (default `storage.bunnycdn.com`) | [bunny.ts](../../src/lib/backup/bunny.ts) |
| `BUNNY_CDN_HOST` | no (without it archives are storage-API-only) | [bunny.ts](../../src/lib/backup/bunny.ts) |
| `PUPPETEER_EXECUTABLE_PATH` / `CHROME_PATH` | no | [browser.ts](../../src/lib/image-budget/browser.ts) |
| `NO_COLOR` | no | worker / alt CLIs colour output |
| `WEBFLOW_TOKEN` / `WEBFLOW_API_TOKEN`, `WEBFLOW_SITE_ID` | cms-alt CLI only | [scripts/cms-alt.ts](../../scripts/cms-alt.ts) |

Env files: [load-env.ts](../../src/lib/load-env.ts) reads `.env.local` → `.env.vercel-production` → `.env` (first wins). `scripts/cms-alt.ts` does **not** use load-env (plain `dotenv.config` for `.env.local` then `.env`; it does not touch firebase-admin).

Stored config: the Webflow API token per project, via `getWebflowTokenAdmin(projectId)` ([project-admin.ts](../../src/lib/project-admin.ts)). Runtime settings: `workers/{id}/control/desired` (`paused`, `model` from `KNOWN_MODELS`). CLI flags for `npm run worker run|once`: `--interval <s>` (default 10, min 2), `--kinds a,b`, `--id <name>`.

No feature flags.

## External services

| Service | How | File | Auth |
|---|---|---|---|
| Ollama (local) | HTTP `/api/version`, `/api/tags`, `/api/show`, `/api/generate` (with JSON-schema `format`), `/api/ps`, unload via `/api/generate {keep_alive:0}` | [ollama.ts](../../src/lib/alt-text/ollama.ts) | none (localhost) |
| Webflow Data API v2 | assets list/upload/PATCH altText, collections, items PATCH (chunks of 25), publish; all via `webflowFetch` (429 retry) | `src/lib/cms/*`, handlers | project's Webflow token (admin read) |
| Webflow Content Delivery API | `api-cdn.webflow.com/v2/collections/{id}/items/live` | [cms/live/route.ts](../../src/app/api/webflow/cms/live/route.ts) | same token |
| Bunny Storage | `PUT https://{host}/{zone}/{path}`; probe GET | [bunny.ts](../../src/lib/backup/bunny.ts) | `AccessKey` header = `BUNNY_STORAGE_KEY` |
| Chrome/Edge via puppeteer | headless page layout measurement | [browser.ts](../../src/lib/image-budget/browser.ts), [measure.ts](../../src/lib/image-budget/measure.ts) | — |
| Client sites | page HTML (`fetchPage`) and image bytes (`fetchImageBytes`), UA `ActiveSet-AltText/1.0` | [context.ts](../../src/lib/alt-text/context.ts), [prepare.ts](../../src/lib/alt-text/prepare.ts) | — |
| sharp | metadata/stats/resize/encode | prepare.ts, image-budget handler | — |

## Key flows

1. **One-click Optimise on the Images screen.** User presses a section's Optimise → `useLibraryOptimise.optimise` → `workerRepository.enqueue({kind:'library_group', payload:{group, publish, by, srcs?, steps?}})` (client write to `worker_jobs`) → worker `loop()` → `claimNextJob` → `runLibraryGroup`: list group images (`listSiteAssets` minus `cmsSourceAssetIds(buildCmsIndex)` or `listCollectionImages`) → read `alt_suggestions` + decorative `audit_decisions` → for each missing image without a confident draft, `generateAltTextBatch([context])` + `saveAltSuggestions` (row lights via `currentSrc`) → `runAltApply` on confident drafts → `recordInIndex` ALT states → `runImageApply({srcs, collectionIds:[id], designerCopies: group is assets, group, force})` → `completeJob`. The screen updates live from `alt_suggestions`, `image_index`, `worker_jobs` subscriptions.
2. **Drafting one image** (`generateAltText`, [generate.ts](../../src/lib/alt-text/generate.ts)): `prepareImage` fetches bytes + sha256 → cache key (sha256, model, `PROMPT_VERSION`, context digest incl. `subject`) → cache hit returns with **this** image's fingerprint/src → `precheck` may settle decorative with no model → `generateJson` with `judgmentSchema` (temp 0.1, seed 7; consensus uses temp 0.7) → `majority` → `validateJudgment` → if portrait with `subject`, `altForRecordPortrait` trims to the CMS name unless extra words are visible → `ALWAYS_REVIEW_KINDS` hold unless record-named → optional `verifyAlt` → `writeCache`.
3. **Human save on a row.** `WebflowImagesDashboard` Save → `library.saveAlt({fingerprint, src, alt})` → `alt_apply` job with `overrides` → `runAltApply` writes the CMS field / asset alt → `recordApplied` (`audit_decisions` fixed_unverified) → overridden drafts rewritten in `alt_suggestions` as `needsReview:false`, `reviewedBy` → `recordInIndex` alt `added`; row shows "saving…" then "ALT added". The CMS write is **staged**; the Live badge compares with `/api/webflow/cms/live`.
4. **Measure then optimise (Weight tab).** "Measure sizes" → `image_budget {limit:40}` → `runImageBudget`: `launchMeasuringBrowser` → `measurePage` per page → merge widest → `attachFileFacts` → `assessImageWeight` → `placementsFor` → optional emit → `writeFindings` (delete all, rewrite). "Optimise all" → `image_apply {fingerprints, designerCopies}` → per image: `optimiseSettled` skip → fetch → `encodeAtWidth` → `putToBunny(backupPath(...))` → `uploadAssetToWebflow` → queue field updates → `patchItems` chunks → re-read served URL via `listCollectionImages` → `carryAltAcross` → index `optimised` on both old and new fingerprints (or `failed` if the field did not change) → `audit_decisions` `weight` with `backupUrl`.
5. **Remote control.** Panel button → `useWorkerControl.send(action)` → `workers/{id}/commands` doc (`pending`) → next poll `claimNextCommand` (unknown action → `rejected`) → `performCommand` → `finishCommand` with output shown in the panel. Pause/model → `setDesired` → `control/desired` → `readDesiredState` each cycle.
6. **Run/deploy the worker.** On the Windows box: repo at `C:\activeset\activeset-internal-tool`, copy `.env.vercel-production` over by `scp` (pull with `npx vercel env pull .env.vercel-production --environment=production` elsewhere) → Ollama as NSSM service `OllamaServe` (pull models via `POST /api/pull`) → worker as NSSM service `ActiveSetWorker` running `npm run worker run` with `AppExit Default Restart` (exit 75 on restart/update) and env via `nssm set … AppEnvironmentExtra +KEY=VALUE` → verify with the panel's **Run checks** (`doctor` inside the service). Code updates: panel **Update** (`git pull --ff-only` + `npm install` + restart; refuses a dirty tree). Details in [docs/features/worker.md](../features/worker.md).

## Gotchas and invariants

- **Import `@/lib/load-env` first** in any script that touches firebase-admin. firebase-admin decides it has credentials while its module body runs, and ES imports evaluate before any `dotenv.config()` in the importing file ([load-env.ts:4-25](../../src/lib/load-env.ts), [scripts/worker.ts:16](../../scripts/worker.ts)).
- **Vercel env pull**: default environment is development (no service account); Secrets come back as `[SENSITIVE]`. Pull production into `.env.vercel-production`, never over `.env.local`; `.env.local` is read first so real values win ([load-env.ts:25-37](../../src/lib/load-env.ts)).
- **Never put a concrete example name in the prompt.** "Priya Sharma, Head of Design" was copied onto a real person's photo; the rule is now `[name], [role]` ([taxonomy.ts:61-65](../../src/lib/alt-text/taxonomy.ts)). Any prompt/rule change must **bump `PROMPT_VERSION`** ([taxonomy.ts:20](../../src/lib/alt-text/taxonomy.ts)) or cached answers from the old prompt are replayed.
- **A cache hit must take the requesting image's identity** (fingerprint, src). One Webflow upload is served under several URLs (e.g. two thumbnail fields); returning the stored hit filed the draft under the wrong URL and cost 46 images their ALT ([generate.ts:127-134](../../src/lib/alt-text/generate.ts), commit 913fca3).
- **Pass the CMS item name as `subject`, never the field name as `title`** — "Numaan Ashraf, Headshot" ([webflow-alt.ts:124-127](../../src/lib/worker/handlers/webflow-alt.ts), [library-group.ts:169-172](../../src/lib/worker/handlers/library-group.ts)). A record-named portrait is trimmed to exactly the name unless extra words are visible in the image ([validate.ts:237-251](../../src/lib/alt-text/validate.ts)); a portrait not using the record name stays held.
- **One-click ALT writes only confident drafts**: `!needsReview && certainty !== 'low'` ([library-group.ts:98](../../src/lib/worker/handlers/library-group.ts)); mirrored client-side in `isConfidentDraft` ([useLibraryOptimise.ts:41](../../src/modules/site-monitoring/ui/hooks/useLibraryOptimise.ts)). Keep them in sync.
- **Drafts and decisions are keyed by URL fingerprint.** After a CMS repoint Webflow serves the file from yet another URL (it copies into collection storage), so drafts are carried to the **re-read** field URL, not the uploaded `hostedUrl` ([image-apply.ts:507-531](../../src/lib/worker/handlers/image-apply.ts)). ALT runs before images in `library_group` for the same reason, and the image patch passes `newAlt: entry.currentAlt` because the patch builders write alt unconditionally ([image-apply.ts:442-444](../../src/lib/worker/handlers/image-apply.ts)).
- **The index records what Webflow says afterwards, not what was sent** — if the field still shows the original fingerprint the entry is `failed` ([image-apply.ts:533-541](../../src/lib/worker/handlers/image-apply.ts)). Our own output is marked `optimised` too, which is what prevents a second lossy generation ([image-apply.ts:545-547](../../src/lib/worker/handlers/image-apply.ts); rule in `optimiseSettled`, [image-index.ts:70-96](../../src/modules/site-monitoring/domain/image-index.ts)).
- **`image_index` is worker-only** (rules `write: if false`); a browser-written "optimised" would make runs skip real work ([firestore.rules:140-143](../../firestore.rules)).
- **`image_apply` refuses to run without Bunny**, and archives each original before any Webflow write; if the backup throws, the image is untouched ([image-apply.ts:156-159](../../src/lib/worker/handlers/image-apply.ts), [image-apply.ts:409-419](../../src/lib/worker/handlers/image-apply.ts)).
- **Webflow limits**: the Assets API cannot replace an existing asset's bytes and Designer-placed images cannot be repointed. Only CMS fields are swapped; assets get a Designer copy in "ActiveSet · optimised" ([image-apply.ts:36-40](../../src/lib/worker/handlers/image-apply.ts)).
- **General assets exclude CMS source uploads.** CMS image URLs are `<delivery id>_<source asset id>_name`; the source asset sits in the list with blank alt forever (1,236 of 1,993 on PeakXV) — `cmsSourceAssetIds` ([library-group.ts:128-136](../../src/lib/worker/handlers/library-group.ts)). The first 24-hex id in a CDN URL is not an asset id.
- **An asset library is not all pictures** — filter `contentType.startsWith('image/')` (PDFs/MP4s were fed to the model on Canopy) ([webflow-alt.ts:59-60](../../src/lib/worker/handlers/webflow-alt.ts)).
- **Everything written to the CMS is staged**; the Live badge exists because a wrong name was published from Webflow unnoticed (a00f91e). Don't use the CDN API for the work itself: it serves cached published values only.
- **Encoder quality bar is "looks lossless", not literal lossless.** Literal lossless WebP came out 88 % larger than originals; the rule encodes lossless and q90 (full chroma) and keeps the smaller, never heavier than the original, skips animations and SVG, keeps AVIF as AVIF ([image-budget.ts:108-151](../../src/lib/worker/handlers/image-budget.ts)).
- **`page.evaluate` gets source text, not a function** — esbuild's `__name` helper breaks serialised functions inside Chrome ([measure.ts:42-52](../../src/lib/image-budget/measure.ts)).
- **`OLLAMA_KEEP_ALIVE` on the Ollama service does nothing** — the request-body `keep_alive` wins; set it on the worker ([ollama.ts:75-80](../../src/lib/alt-text/ollama.ts)). Pausing does not free VRAM; "Free the GPU" does.
- **NSSM `AppEnvironmentExtra` without `+` replaces the whole env block**; use `+KEY=VALUE`. A hand-run `doctor` over SSH does not see the service env — use Run checks.
- **Restart/update rely on the service manager**: the worker exits with code 75 ([scripts/worker.ts:447-452](../../scripts/worker.ts)).
- **Commands are closed-list** — the worker holds a full-admin service account, so no free-text command or model ever reaches a shell/Ollama ([control-admin.ts:157-201](../../src/lib/worker/control-admin.ts), [worker-control.ts:67-83](../../src/modules/site-monitoring/domain/worker-control.ts)). `update`'s `shell: true` on Windows is safe only because its args are constants.
- **`emitDir` is taken from the job payload when `WORKER_EMIT_DIR` is unset.** The comment at [scripts/worker.ts:204-207](../../scripts/worker.ts) says the env default "goes after the spread" to stop payloads redirecting writes, but `process.env.WORKER_EMIT_DIR ?? payload.emitDir` falls back to the payload. Any `@activeset.co` user can create a job, so keep `WORKER_EMIT_DIR` set on the worker.
- **`image_budget` wipes and rewrites its collection every run** ([image-budget.ts:315-335](../../src/lib/worker/handlers/image-budget.ts)); history of what an image was lives in `audit_decisions` `weight` (`previousUrl`, `backupUrl`) and `image_index`.

## Tests

| File | Covers | Script |
|---|---|---|
| [src/lib/alt-text/alt-text.test.ts](../../src/lib/alt-text/alt-text.test.ts) | precheck, repairs, context extraction, record portraits | `npm run test:alt-text` |
| [src/lib/worker/handlers/image-budget.test.ts](../../src/lib/worker/handlers/image-budget.test.ts) | `encodeAtWidth` on real bytes | `npm run test:worker` |
| [src/lib/backup/bunny.test.ts](../../src/lib/backup/bunny.test.ts) | `backupPath` flattening | `npm run test:worker` |
| [src/modules/site-monitoring/domain/image-index.test.ts](../../src/modules/site-monitoring/domain/image-index.test.ts) | `optimiseSettled` | `npm run test:site-monitoring` |
| [src/modules/site-monitoring/domain/image-budget.test.ts](../../src/modules/site-monitoring/domain/image-budget.test.ts) | 2× arithmetic, verdicts, roll-up | `npm run test:site-monitoring` |
| [src/modules/site-monitoring/domain/worker-control.test.ts](../../src/modules/site-monitoring/domain/worker-control.test.ts) | closed action/model lists | `npm run test:site-monitoring` |
| [src/modules/site-monitoring/domain/webflow-assets.test.ts](../../src/modules/site-monitoring/domain/webflow-assets.test.ts) | `cmsSourceAssetIds`, `resolveAssets` | `npm run test:site-monitoring` |
| [tests/firestore.rules.test.ts](../../tests/firestore.rules.test.ts) | rules incl. `image_index` write denial | `npm run test:rules` (needs Firebase emulator + JDK) |

`npm test` runs all of the above except `test:rules`. No tests for the handlers' Firestore/Webflow paths, `claimNextJob`, or `generateAltText` against a model.

## Related docs

- [docs/features/worker.md](../features/worker.md) — **partially stale.** Accurate on Windows setup, NSSM, keep-alive, controls, 2× rule, Bunny, encoder, index. Stale: says `webflow_alt` feeds "the Webflow tab" (no UI queues it any more); says `library_group` saves drafts "ten at a time" (now one at a time); Verification step cites `npm run test:image-budget` (no such script — use `test:site-monitoring` / `test:worker`); Collections table omits `image_index`.
- [docs/features/alt-text.md](../features/alt-text.md) — **partially stale.** Accurate on the CLI, pipeline, categories, cache and costs. Stale: "Portraits are always flagged for review" (record-named CMS portraits are not); does not mention the worker `alt_text` job or the "Draft on `<worker>`" button (describes only `npm run alt project`).
- [packages/cms-alt/README.md](../../packages/cms-alt/README.md) — accurate for the standalone CSV package; unrelated to the worker.
