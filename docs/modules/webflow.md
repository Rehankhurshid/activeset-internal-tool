---
module: webflow
title: Webflow integration (Pages, SEO, Images, Schema, Sitemap Sync)
keywords: [webflow, webflow api, data api v2, webflow pages, webflow tab, webflow pages tab, seo editor, bulk edit, bulk seo, seo health, seo score, qc, open graph, same as seo, meta title, meta description, cms template, cms variables, wf variable, locale, localization, publish site, unpublish site, draft, archive, copy dom, credentials, connect to webflow, api token, site id, project_secrets, webflowConfig, hasApiToken, x-project-id, reveal-token, validate-token, images, image assets, general assets, cms images, alt text, optimise, optimise everything, live badge, cms live, content delivery api, api-cdn, assets resolve, schema, schema markup, json-ld, schema-gen, ollama, gemma, sitemap sync, sitemap drift, missing from sitemap, missing from webflow, ignore path, webflow-settings, settings auditor, ai-seo-gen, gemini, cms-alt, cmsRuns, schemaRuns, schema_analyses, webflow_sessions]
entry_points: [/modules/project-links/[id]?tab=webflow]
code_roots: [src/app/api/webflow, src/components/webflow, src/lib/cms, src/modules/webflow, src/hooks, src/services, src/lib]
last_verified: 2026-09-23 @ a00f91e
---
# Webflow integration (Pages, SEO, Images, Schema, Sitemap Sync)

> Everything in the app that talks to the Webflow Data API (v2). A team member connects a project to a Webflow site (Site ID + API token) on the project page's **Webflow Pages** tab; the token is stored server-side in `project_secrets`, never on the project doc. That tab then has four vertical sub-tabs: **Pages** (SEO health scoring, single/bulk SEO editor, AI SEO generation via Gemini, draft/archive, publish site, locale switch), **Images** (general assets + one section per CMS collection, ALT drafting/optimising queued to the worker, published-vs-staged ALT badges), **Schema** (copy a CLI command that runs `@activeset/schema-gen` locally against Ollama; results stream back and are shown per page), and **Sitemap Sync** (daily/on-demand diff between Webflow static pages and the project's sitemap). The Audit tab also writes ALT text to Webflow site assets in place and can publish the site. Users are @activeset.co team members only.

## Where to find things (quick lookup)

| I want to… | Go to |
|---|---|
| See where the Webflow tab is mounted on the project page | [ProjectDetailScreen.tsx](../../src/modules/project-links/ui/screens/ProjectDetailScreen.tsx) (`TabsContent value="webflow"`, `handleSaveWebflowConfig`) |
| Change the Webflow tab layout / sub-tabs (Pages, Images, Schema, Sitemap Sync) | [WebflowPagesDashboard.tsx](../../src/components/webflow/WebflowPagesDashboard.tsx) `WebflowPagesDashboard` |
| Change how the token is saved / removed | [config/route.ts](../../src/app/api/webflow/config/route.ts) (POST/DELETE) + [projectSecrets.ts](../../src/services/projectSecrets.ts) `setWebflowToken` / `deleteWebflowToken` |
| Change how an API route gets the token | [webflow-token-resolver.ts](../../src/lib/webflow-token-resolver.ts) `resolveWebflowToken` |
| Call a Webflow route from the browser | [api-client.ts](../../src/lib/api-client.ts) `fetchForProject` (adds `x-project-id` + Firebase ID token) |
| Change the "Connect to Webflow" dialog / Test connection | [WebflowCredentialsDialog.tsx](../../src/components/webflow/WebflowCredentialsDialog.tsx) + [validate-token/route.ts](../../src/app/api/webflow/validate-token/route.ts) |
| Change SEO health scoring (points, length limits) | [WebflowService.ts](../../src/services/WebflowService.ts) `analyzeSEOHealth`, `SEO_LIMITS`, `DEDUCTIONS`, `calculateSiteHealth` |
| Change page list fetching / page save / publish logic | [useWebflowPages.ts](../../src/hooks/useWebflowPages.ts) |
| Edit a single page's SEO / OG / CMS variables | [WebflowSEOEditor.tsx](../../src/components/webflow/WebflowSEOEditor.tsx) (`formatForSave`), [editor/WebflowSEOInput.tsx](../../src/components/webflow/editor/WebflowSEOInput.tsx), [editor/VariableNode.tsx](../../src/components/webflow/editor/VariableNode.tsx) |
| Bulk-edit SEO across pages | [WebflowBulkSEOEditor.tsx](../../src/components/webflow/WebflowBulkSEOEditor.tsx) |
| Render `{{wf {...} }}` variables as `{{slug}}` chips | [webflow-utils.ts](../../src/lib/webflow-utils.ts) `formatForDisplay`, [SEOVariableRenderer.tsx](../../src/components/webflow/SEOVariableRenderer.tsx) |
| Change the AI SEO prompt / model | [ai-seo-gen/route.ts](../../src/app/api/ai-seo-gen/route.ts) |
| Change the Images screen (groups, counts, Live badge, Save) | [WebflowImagesDashboard.tsx](../../src/components/webflow/WebflowImagesDashboard.tsx) |
| Queue ALT/optimise jobs from the Images screen | [useLibraryOptimise.ts](../../src/modules/site-monitoring/ui/hooks/useLibraryOptimise.ts) (`optimise` → `library_group`, `saveAlt` → `alt_apply`) |
| Read CMS images / published ALT | [useCmsImages.ts](../../src/hooks/useCmsImages.ts), [cms/items](../../src/app/api/webflow/cms/items/route.ts), [cms/live](../../src/app/api/webflow/cms/live/route.ts) |
| Extract images from CMS items (Image / MultiImage / RichText) | [lib/cms/extract.ts](../../src/lib/cms/extract.ts) `extractAllImages`, `isMissingAlt` |
| Build a CMS field PATCH (alt or URL) | [lib/cms/patch.ts](../../src/lib/cms/patch.ts) `groupUpdatesByItem`, `applyRichTextUpdates` |
| Retry-on-429 Webflow fetch | [lib/cms/webflow-client.ts](../../src/lib/cms/webflow-client.ts) `webflowFetch` |
| Decide which image URLs are real site assets | [webflow-assets.ts](../../src/modules/site-monitoring/domain/webflow-assets.ts) `resolveAssets`, `cmsSourceAssetIds` + [assets/resolve](../../src/app/api/webflow/assets/resolve/route.ts) |
| Write ALT to a Webflow asset from the Audit tab | [WebsiteAuditDashboardScreen.tsx](../../src/modules/site-monitoring/ui/screens/WebsiteAuditDashboardScreen.tsx) `handleSaveAlt`, `handlePublishSite` |
| Change the sitemap drift comparison | [WebflowSitemapDiffService.ts](../../src/services/WebflowSitemapDiffService.ts) `computeSitemapDiff`, `normalizePath`, `applyIgnore` |
| Change sitemap/Webflow fetching for the drift check | [webflow-sitemap-io.ts](../../src/lib/webflow-sitemap-io.ts) `runSitemapDiff` |
| Change the daily drift cron | [cron/webflow-sitemap-diff/route.ts](../../src/app/api/cron/webflow-sitemap-diff/route.ts) |
| Change the Schema tab / CLI command | [WebflowSchemaDashboard.tsx](../../src/components/webflow/WebflowSchemaDashboard.tsx) `buildCommand`, `TOKEN_PLACEHOLDER` |
| Change the schema CLI itself | [packages/schema-gen/src/cli.ts](../../packages/schema-gen/src/cli.ts) (published) / [scripts/schema-gen.ts](../../scripts/schema-gen.ts) (repo-local) |

## User-facing pages

| URL | File | What it shows | Access |
|---|---|---|---|
| `/modules/project-links/[id]?tab=webflow` | [page.tsx](../../src/app/modules/project-links/[id]/page.tsx) → [ProjectDetailScreen.tsx](../../src/modules/project-links/ui/screens/ProjectDetailScreen.tsx) → [WebflowPagesDashboard.tsx](../../src/components/webflow/WebflowPagesDashboard.tsx) | Tab labelled **Webflow Pages** (compact "Webflow"), stat badge "Set"/"Not Set". Not connected → "Connect to Webflow" card. Connected → header stats (Total Pages, Pages with Issues, Critical Issues, Average SEO Score), buttons **Unpublish Site (N/A)**, **Publish Site**, **Bulk Edit**, settings dialog; vertical sub-tabs **Pages**, **Images**, **Schema**, **Sitemap Sync** | Signed-in user (`ProjectDetailScreen` shows Sign In when `!user`); API routes enforce @activeset.co via `requireProjectAccess` |
| `/modules/project-links/[id]?tab=audit` | [WebsiteAuditDashboardScreen.tsx](../../src/modules/site-monitoring/ui/screens/WebsiteAuditDashboardScreen.tsx) | Alt-text findings with "Save to Webflow" (site assets only) and "Publish site" — Webflow-writing parts only are in scope here | Same; read-only share view has no write buttons |

## API routes

Auth legend: **ID token + project** = `Authorization: Bearer <Firebase ID token>` (must be @activeset.co, see `requireCaller` in [api-auth.ts](../../src/lib/api-auth.ts)) plus `x-project-id` header or `?projectId=` and the project must exist; the Webflow token is then loaded from `project_secrets` via `resolveWebflowToken`. **run secret** = `{runId, secret}` pair issued by a `progress/start` route.

| Method | Path | File | Auth | Purpose |
|---|---|---|---|---|
| POST | `/api/webflow/config` | [config/route.ts](../../src/app/api/webflow/config/route.ts) | ID token + `requireProjectAccess(body.projectId)` | Save token to `project_secrets/{id}`; write `webflowConfig {siteId, siteName, customDomain, lastSyncedAt, hasApiToken:true}` on project doc |
| DELETE | `/api/webflow/config?projectId=` | same | ID token + project | Delete secret doc, set `webflowConfig: null` |
| GET | `/api/webflow/config?projectId=` | same | ID token + project | `{configured}` — never returns token |
| POST | `/api/webflow/config/reveal-token` | [reveal-token/route.ts](../../src/app/api/webflow/config/reveal-token/route.ts) | ID token + project | Returns raw token (logged with uid/email). Used only by Schema tab "copy command" |
| POST | `/api/webflow/validate-token` | [validate-token/route.ts](../../src/app/api/webflow/validate-token/route.ts) | **none** | `GET /v2/sites/{siteId}` with the supplied token; returns `{valid, siteName, siteId}` |
| GET | `/api/webflow/pages?siteId=&limit=&offset=&localeId=` | [pages/route.ts](../../src/app/api/webflow/pages/route.ts) | ID token + project | Proxy `GET /v2/sites/{siteId}/pages` (default limit 100) |
| GET | `/api/webflow/pages/[pageId]?localeId=` | [pages/[pageId]/route.ts](../../src/app/api/webflow/pages/[pageId]/route.ts) | ID token + project | Proxy `GET /v2/pages/{id}` (locale-specific metadata) |
| PUT | `/api/webflow/pages/[pageId]?localeId=` | same | ID token + project | Proxy `PUT /v2/pages/{id}` with only `title, slug, seo, openGraph, draft, archived` from body |
| GET | `/api/webflow/pages/[pageId]/content` | [content/route.ts](../../src/app/api/webflow/pages/[pageId]/content/route.ts) | ID token + project | Proxy `GET /v2/pages/{id}/dom?limit=100` (Copy DOM, AI SEO input) |
| GET | `/api/webflow/collections/[collectionId]` | [collections/[collectionId]/route.ts](../../src/app/api/webflow/collections/[collectionId]/route.ts) | ID token + project | Collection schema (fields for CMS variable insertion) |
| GET | `/api/webflow/sites/[siteId]` | [sites/[siteId]/route.ts](../../src/app/api/webflow/sites/[siteId]/route.ts) | ID token + project | Site details (locales) |
| POST | `/api/webflow/sites/[siteId]` | same | ID token + project | `action:"publish"` → `POST /v2/sites/{id}/publish`; if `customDomains` omitted, fetches all custom domain ids and publishes to them + Webflow subdomain. `action:"unpublish"` → 400 (no such API) |
| GET | `/api/webflow/assets?siteId=&limit=&offset=&folderId=&imagesOnly=` | [assets/route.ts](../../src/app/api/webflow/assets/route.ts) | ID token + project | One page of assets + all folders (via `webflowFetch`); filters to `image/*` unless `imagesOnly=false`; folder filter applied to that page |
| PATCH | `/api/webflow/assets/[assetId]` | [assets/[assetId]/route.ts](../../src/app/api/webflow/assets/[assetId]/route.ts) | ID token + project | Update `altText` / `displayName` / `localeId` on a site asset (Audit tab Save) |
| POST | `/api/webflow/assets/resolve` | [assets/resolve/route.ts](../../src/app/api/webflow/assets/resolve/route.ts) | ID token + project | `{siteId, srcs[]}` → `{resolved: {src: assetId}, assetCount}`; lists up to 2,000 assets, resolves at most 500 srcs |
| GET | `/api/webflow/cms/discover?siteId=` | [cms/discover/route.ts](../../src/app/api/webflow/cms/discover/route.ts) | ID token + project | Collections that have Image/MultiImage/RichText fields, with item counts (`CmsDiscoverResult`; totals always 0) |
| GET | `/api/webflow/cms/count-alt?collectionId=` | [cms/count-alt/route.ts](../../src/app/api/webflow/cms/count-alt/route.ts) | ID token + project | Walk all items; `{totalImages, missingAltCount}` |
| GET | `/api/webflow/cms/items?collectionId=&offset=&limit=` | [cms/items/route.ts](../../src/app/api/webflow/cms/items/route.ts) | ID token + project | One page of items flattened to `CmsImageEntry[]` |
| GET | `/api/webflow/cms/live?collectionId=` | [cms/live/route.ts](../../src/app/api/webflow/cms/live/route.ts) | ID token + project | Published ALT/URL per entry id from `api-cdn.webflow.com/v2/collections/{id}/items/live` |
| PATCH | `/api/webflow/cms/update` | [cms/update/route.ts](../../src/app/api/webflow/cms/update/route.ts) | ID token + project | `{updates: CmsUpdatePayload[]}` → grouped PATCH `/v2/collections/{id}/items` (batch 1 if RichText else 5). No in-app caller at HEAD |
| POST | `/api/webflow/cms/publish` | [cms/publish/route.ts](../../src/app/api/webflow/cms/publish/route.ts) | ID token + project | `{collectionId, itemIds}` → publish items. No in-app caller at HEAD |
| POST | `/api/webflow/cms/progress/start` | [cms/progress/start/route.ts](../../src/app/api/webflow/cms/progress/start/route.ts) | **none** | Create `cmsRuns/{runId}` with random secret, 1 h expiry. No in-app caller at HEAD (the `cms-alt` CLI still accepts `--progress-url`) |
| POST | `/api/webflow/cms/progress/event` | [cms/progress/event/route.ts](../../src/app/api/webflow/cms/progress/event/route.ts) | run secret | CLI appends an event to `cmsRuns/{runId}/events` |
| GET | `/api/webflow/cms/progress/events?runId=&secret=&since=` | [cms/progress/events/route.ts](../../src/app/api/webflow/cms/progress/events/route.ts) | run secret | Poll events (max 500) |
| POST | `/api/webflow/schema/progress/start` | [schema/progress/start/route.ts](../../src/app/api/webflow/schema/progress/start/route.ts) | **none** | Create `schemaRuns/{runId}` (stores caller-supplied `projectId`, model default `gemma4:e4b`), 1 h expiry |
| POST | `/api/webflow/schema/progress/event` | [schema/progress/event/route.ts](../../src/app/api/webflow/schema/progress/event/route.ts) | run secret | CLI appends an event |
| GET | `/api/webflow/schema/progress/events?runId=&secret=&since=` | [schema/progress/events/route.ts](../../src/app/api/webflow/schema/progress/events/route.ts) | run secret | Schema tab polls live terminal output |
| POST | `/api/webflow/schema/progress/upload` | [schema/progress/upload/route.ts](../../src/app/api/webflow/schema/progress/upload/route.ts) | run secret | CLI uploads results → `schema_analyses/{pageId}_{contentHash}` under the run's `projectId` |
| GET | `/api/webflow/sitemap-diff?projectId=` | [sitemap-diff/route.ts](../../src/app/api/webflow/sitemap-diff/route.ts) | ID token + project | Stored snapshot `{diff, ignorePaths, sitemapUrl, connected}` |
| POST | `/api/webflow/sitemap-diff` | same | ID token + project | Recompute via `runSitemapDiff`, persist `webflowSitemapDiff` |
| POST | `/api/webflow/sitemap-diff/ignore` | [sitemap-diff/ignore/route.ts](../../src/app/api/webflow/sitemap-diff/ignore/route.ts) | ID token + project | `{path, action:"add"\|"remove"}` on `sitemapIgnorePaths` |
| GET | `/api/cron/webflow-sitemap-diff` | [cron/webflow-sitemap-diff/route.ts](../../src/app/api/cron/webflow-sitemap-diff/route.ts) | cron secret (`isCronAuthorized`) | Daily drift check + digest (see Background jobs) |
| POST, GET | `/api/webflow/session` | [session/route.ts](../../src/app/api/webflow/session/route.ts) | **none** | Webflow account seat claim/heartbeat/release for the Team Tracker extension (`webflow_sessions`, `webflow_account_history`). Owned by the tracker-extension doc; listed for completeness |
| POST, GET | `/api/webflow-settings` | [webflow-settings/route.ts](../../src/app/api/webflow-settings/route.ts) | ID token **or** paired extension token for slug `webflow-settings-auditor` (`requireCallerOrExtensionToken`) | Save/read `projects/{id}.webflowSettingsAudit` from the Webflow Settings Auditor extension |
| POST | `/api/ai-seo-gen` | [ai-seo-gen/route.ts](../../src/app/api/ai-seo-gen/route.ts) | **none** | Gemini (`gemini-flash-latest`) → `{title, description, ogTitle, ogDescription}` from page text (≤30k chars) |
| POST | `/api/schema/scrape` | [schema/scrape/route.ts](../../src/app/api/schema/scrape/route.ts) | **none** | `scrapePageSignals(url)` for any http(s) URL. Only caller is the unused `useSchemaAnalysis` hook |

## Code map

### Module dir — `src/modules/webflow`
- [index.ts](../../src/modules/webflow/index.ts) — barrel: re-exports `WebflowPagesDashboard`, `WebflowImagesDashboard`, `WebflowSEOEditor`, `webflowConfigRepository`, and types.
- [domain/webflow.types.ts](../../src/modules/webflow/domain/webflow.types.ts) — type re-exports from `@/types/webflow`.
- [infrastructure/webflow-config.repository.ts](../../src/modules/webflow/infrastructure/webflow-config.repository.ts) — client-side `webflowConfigRepository.updateWebflowConfig` / `removeWebflowConfig` calling `/api/webflow/config` with the ID token. The only sanctioned way to write `webflowConfig` (see note in [database.ts](../../src/services/database.ts) near `updateProjectFolderPageTypes`).

### Components — `src/components/webflow`
- [WebflowPagesDashboard.tsx](../../src/components/webflow/WebflowPagesDashboard.tsx) — `WebflowPagesDashboard`: the whole Webflow tab. Pages table (filters All/Has Issues/Critical/Good/Static/CMS Templates; sorts; "show drafts" switch; locale select), per-row draft/archive toggles, Copy DOM Details, View page (link built from `customDomain` or a `siteName`-derived `*.webflow.io` guess), hosts the Images / Schema / Sitemap Sync sub-tabs. The sub-tab list is a sidebar from `md` up; on a phone it becomes a horizontally scrolling row above the content.
- [WebflowSEOEditor.tsx](../../src/components/webflow/WebflowSEOEditor.tsx) — `WebflowSEOEditor` sheet: title, slug, SEO title/description, OG with "Same as SEO" (`titleCopied`/`descriptionCopied`), char counters, per-locale reload via `GET /pages/[id]?localeId`, CMS field fetch via `/collections/[id]` (types PlainText, RichText, Number, Email, Phone, Color, Option, DateTime), `formatForSave` converts `{{slug}}` → `{{wf {"path":"slug","type":"<Type>"} }}`, "Generate" via `onGenerateSEO`.
- [WebflowBulkSEOEditor.tsx](../../src/components/webflow/WebflowBulkSEOEditor.tsx) — `WebflowBulkSEOEditor`: table split Static Pages / CMS Templates, per-page lock (`lockedPageIds`), bulk AI generate, saves only rows with `hasChanges`.
- [WebflowCredentialsDialog.tsx](../../src/components/webflow/WebflowCredentialsDialog.tsx) — "Webflow Configuration" dialog: Site ID, API token, custom domain; must "Test connection" (validate-token) before Save; Remove.
- [WebflowImagesDashboard.tsx](../../src/components/webflow/WebflowImagesDashboard.tsx) — `WebflowImagesDashboard`: one section per group (General assets, then each CMS collection), per-section Optimise + "Optimise everything", publish toggle, per-row draft/Save, `LiveBadge` (live / pending / never) comparing staged ALT with `cms/live`. `AutoOptimiseSwitch` under the header: the per-project "Auto-optimise new images" switch (`projects.autoOptimiseImages`, via `projectsService.setAutoOptimiseImages`), with a line from the last hourly `library_sweep` job (`workerRepository.subscribeJob(autoOptimiseJobId(projectId))`). On a phone the section header takes the full width (counts wrap under the name, Optimise drops below) and each row's badges wrap. No browser-side Webflow writes.
- [WebflowSchemaDashboard.tsx](../../src/components/webflow/WebflowSchemaDashboard.tsx) — `WebflowSchemaDashboard`: "Run on your machine" command builder (`npx @activeset/schema-gen@latest generate --site …`), model/concurrency/`--only` pickers, live terminal (polls schema `progress/events`), results list (client `onSnapshot` on `schema_analyses where projectId==`), "Import JSON" (client `writeBatch` of `schema-output.json` v1).
- [WebflowSchemaPanel.tsx](../../src/components/webflow/WebflowSchemaPanel.tsx) — `WebflowSchemaPanel` per-page in-browser Ollama analysis. **Not imported anywhere** at HEAD.
- [WebflowSitemapSync.tsx](../../src/components/webflow/WebflowSitemapSync.tsx) — `WebflowSitemapSync`: two lists (in Webflow not in sitemap / in sitemap not in Webflow), ignore/unignore, "check now".
- [SEOVariableRenderer.tsx](../../src/components/webflow/SEOVariableRenderer.tsx) — renders `{{slug}}` chips from `formatForDisplay` output.
- [WebflowSEOHealthBadge.tsx](../../src/components/webflow/WebflowSEOHealthBadge.tsx) — score badge. **Not imported anywhere** at HEAD.
- [editor/WebflowSEOInput.tsx](../../src/components/webflow/editor/WebflowSEOInput.tsx) — Lexical editor with `INSERT_VARIABLE_COMMAND`, used by `WebflowSEOEditor` for CMS templates.
- [editor/VariableNode.tsx](../../src/components/webflow/editor/VariableNode.tsx) — Lexical `VariableNode` decorator (`$createVariableNode`, `$isVariableNode`).

### Hooks
- [useWebflowPages.ts](../../src/hooks/useWebflowPages.ts) — pages + site health + locales; `fetchPages(localeId)`, `updatePageSEO`, `updatePageState` (draft/archived through the same PUT), `publishSite`, `unpublishSite` (always errors), `bulkUpdatePagesSEO` (sequential PUTs), `generatePageSEO` (DOM → `extractTextFromDOM` → `/api/ai-seo-gen`).
- [useWebflowAssets.ts](../../src/hooks/useWebflowAssets.ts) — read-only; loops `/api/webflow/assets` 100 at a time up to 10,000.
- [useCmsImages.ts](../../src/hooks/useCmsImages.ts) — read-only; `discoverCollections`, `scanAltCounts` (4 concurrent count-alt), `loadCollectionImages`, `loadPublished`, `fetchImages`, `fetchAllImages`.
- [useWebflowSitemapDiff.ts](../../src/hooks/useWebflowSitemapDiff.ts) — load/refresh/ignore/unignore with optimistic update and revert-on-error.
- [useSchemaAnalysis.ts](../../src/hooks/useSchemaAnalysis.ts) — browser → `/api/schema/scrape` → Ollama at `NEXT_PUBLIC_OLLAMA_BASE_URL` → client-SDK cache in `schema_analyses`. Only used by the unused `WebflowSchemaPanel`.
- Outside `src/hooks` but part of this area: [useLibraryOptimise.ts](../../src/modules/site-monitoring/ui/hooks/useLibraryOptimise.ts) (worker queueing for the Images screen) and [useWebflowAssetIndex.ts](../../src/modules/site-monitoring/ui/hooks/useWebflowAssetIndex.ts) (Audit tab → `assets/resolve`).

### Services
- [WebflowService.ts](../../src/services/WebflowService.ts) — pure. `webflowService.processPagesWithQC`, `calculateSiteHealth` (averages over **static pages only**), `sortByHealth`, `searchPages`, `extractTextFromDOM`, filters.
- [WebflowSitemapDiffService.ts](../../src/services/WebflowSitemapDiffService.ts) — pure. `computeSitemapDiff`, `normalizePath`, `applyIgnore`.
- [SchemaMarkupService.ts](../../src/services/SchemaMarkupService.ts) — `scrapePageSignals`, `computeContentHash` (53-bit non-crypto hash named `sha1`), `analyzeWithOllama`, `getCachedAnalysis`/`saveCachedAnalysis` (client SDK).
- [projectSecrets.ts](../../src/services/projectSecrets.ts) — `server-only`; `getWebflowToken`, `setWebflowToken`, `deleteWebflowToken`, `hasWebflowToken` on `project_secrets/{projectId}`.

### Lib
- [webflow-token-resolver.ts](../../src/lib/webflow-token-resolver.ts) — `resolveWebflowToken(req)` → `{projectId, apiToken}` or a `NextResponse` to return.
- [webflow-sitemap-io.ts](../../src/lib/webflow-sitemap-io.ts) — `fetchWebflowPages` (paginates all pages), `fetchSitemapUrls` (one level of sitemap index, ≤50 children, 20 s timeout), `runSitemapDiff` (never throws; sets `error`).
- [webflow-utils.ts](../../src/lib/webflow-utils.ts) — `formatForDisplay` (re-exported by [platform/webflow/utils.ts](../../src/platform/webflow/utils.ts), which nothing imports).
- [project-admin.ts](../../src/lib/project-admin.ts) — `getWebflowTokenAdmin` (second reader of `project_secrets`, used by worker handlers).
- `src/lib/cms/` — shared by API routes, worker handlers and the `cms-alt` CLI:
  - [webflow-client.ts](../../src/lib/cms/webflow-client.ts) — `webflowFetch` (retries 429 up to 5×, honours `retry-after`, cap 60 s; also retries a dropped connection up to 5× with backoff, except on POSTs other than `/publish`), `listCollections`, `getCollection`, `listItems`, `patchItems`, `publishItems`, `buildHeaders`.
  - [extract.ts](../../src/lib/cms/extract.ts) — `extractImageFields`, `extractRichTextImages` (cheerio), `extractAllImages`, `isMissingAlt`, `BAD_ALTS`.
  - [patch.ts](../../src/lib/cms/patch.ts) — `buildFieldPatch`, `applyRichTextUpdates`, `groupUpdatesByItem`.
  - [library.ts](../../src/lib/cms/library.ts) — `listSiteAssets` (≤10,000), `listCollectionImages`, `buildCmsIndex` (fingerprint → every CMS entry using it). Worker-side.
  - [placement.ts](../../src/lib/cms/placement.ts) — `placementsFor` (cms / asset / unknown), `PLACEMENT_HINT`, `ensureOptimisedFolder` ("ActiveSet · optimised" asset folder). Worker-side.
  - [assets.ts](../../src/lib/cms/assets.ts) — `uploadAssetToWebflow` (2-step create + S3 multipart), `sanitizeAssetFileName` (80 chars).
  - [ai-alt.ts](../../src/lib/cms/ai-alt.ts), [compress.ts](../../src/lib/cms/compress.ts), [csv.ts](../../src/lib/cms/csv.ts) — only used by the `cms-alt` CLI ([scripts/cms-alt.ts](../../scripts/cms-alt.ts), [packages/cms-alt](../../packages/cms-alt)).
- [webflow-assets.ts](../../src/modules/site-monitoring/domain/webflow-assets.ts) — `resolveAssets`, `idPrefixOf`, `normaliseAssetName`, `cmsSourceAssetIds`, `NOT_AN_ASSET_HINT`.

### Types
- [types/webflow.ts](../../src/types/webflow.ts) — `WebflowPage`, `WebflowPageWithQC`, `SEOIssue`, `SEOHealthScore`, `WebflowSiteHealth`, `UpdateWebflowPageSEO`, `AISEOGeneratedData`, `WebflowConfig` (stored), `WebflowConfigInput` (form, has `apiToken`), `WebflowAsset`, `WebflowAssetFolder`, `CmsCollectionSummary`, `CmsImageEntry` (id = `collectionId::itemId::fieldSlug::index`), `CmsUpdatePayload`, `CmsItemsResult`, etc.
- [types/schema-markup.ts](../../src/types/schema-markup.ts) — `SchemaPageSignals`, `SchemaAnalysisResult`, `SchemaRecommendation`, `SchemaAnalysisDoc`.
- [types/index.ts](../../src/types/index.ts) — `Project.webflowConfig`, `sitemapUrl`, `folderPageTypes`, `sitemapIgnorePaths`, `webflowSitemapDiff: WebflowSitemapDiff`.

### Scripts / packages
- [scripts/migrate-webflow-tokens.ts](../../scripts/migrate-webflow-tokens.ts) — one-time, idempotent: moves `projects/{id}.webflowConfig.apiToken` → `project_secrets/{id}.webflowApiToken`, strips it, sets `hasApiToken`. Dry run by default. `npm run security:migrate-webflow-tokens[:apply]`. Loads env from `MIGRATE_ENV_FILE`, `.env.vercel-production`, `.env.local`, `.env` (first found) and builds its own admin app.
- [packages/schema-gen](../../packages/schema-gen) — `@activeset/schema-gen` CLI (bin `schema-gen`, v0.5.0): lists static pages via Webflow API, scrapes, runs Ollama, streams progress/uploads to the routes above. Build: `npm run schema-gen:pkg:build`.
- [scripts/schema-gen.ts](../../scripts/schema-gen.ts) — older repo-local variant (`npm run schema:gen`) that writes `schema_analyses` directly with firebase-admin; env `WEBFLOW_API_TOKEN`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`.

## Data model

| Path | One document = | Key fields (type, file) | Written by | Read by | SDK |
|---|---|---|---|---|---|
| `projects/{id}.webflowConfig` | Non-secret connection metadata | `siteId, siteName?, customDomain?, lastSyncedAt?, hasApiToken?` (`WebflowConfig`, [types/webflow.ts](../../src/types/webflow.ts)) | `/api/webflow/config` POST/DELETE | Project page (client listener), every hook's `isReady` check, cron eligibility | admin write, client read |
| `projects/{id}.webflowSitemapDiff` | Last drift snapshot | `checkedAt, sitemapUrl, missingFromSitemap[], missingFromWebflow[], webflowStaticCount, sitemapStaticCount, error?` (`WebflowSitemapDiff`, [types/index.ts](../../src/types/index.ts)) — lists are **raw** (pre-ignore) | sitemap-diff POST, cron | sitemap-diff GET | admin |
| `projects/{id}.sitemapIgnorePaths` | Normalized paths excluded from drift | `string[]`, sorted | sitemap-diff/ignore | UI + cron `applyIgnore` | admin |
| `projects/{id}.webflowSettingsAudit` | Settings Auditor extension result | `lastAuditDate, siteSlug, score, passedCount, totalCount (default 17), results.{general,publishing,seo}` (untyped) | `/api/webflow-settings` POST | same GET | admin |
| `project_secrets/{projectId}` | Per-project third-party secrets | `webflowApiToken`, `webflowTokenUpdatedAt` ([projectSecrets.ts](../../src/services/projectSecrets.ts) `ProjectSecretsDoc`) | `/api/webflow/config`, migrate script | `resolveWebflowToken`, `runSitemapDiff`, `getWebflowTokenAdmin` (worker), `/api/scan-sitemap` | admin only |
| `schema_analyses/{pageId}_{contentHash}` | One schema recommendation for one page version | `pageId, projectId, contentHash, url, result: SchemaAnalysisResult, model, createdAt (ms)` (`SchemaAnalysisDoc`) | schema `progress/upload` (admin), Schema tab Import JSON (client), `scripts/schema-gen.ts` (admin), `saveCachedAnalysis` (client) | Schema tab results list (client `onSnapshot`) | both |
| `schemaRuns/{runId}` + `/events/{eid}` | One CLI run's live log | run: `secret, projectId, siteId, siteLabel, domain, expectedPages, model, concurrency, only, status (awaiting/running/completed/aborted), eventCount, lastStep, lastMessage, createdAt, updatedAt, expiresAt`; event: `step, level, message(≤500), detail(≤1000), current, total, durationMs, at` | schema progress routes | schema `progress/events` | admin |
| `cmsRuns/{runId}` + `/events/{eid}` | Same shape for the `cms-alt` CLI | `siteId, collectionIds, collectionLabel, expectedImages, actions{ai,compress,publish}` + status fields | cms progress routes | cms `progress/events` | admin |
| `webflow_sessions/{email}`, `webflow_account_history/{email}` | Tracker extension seat state | see [session/route.ts](../../src/app/api/webflow/session/route.ts) | session route (client SDK on the server) | session route, extension | client SDK |

Collections this area writes indirectly through the worker (`worker_jobs` kinds `library_group`, `alt_apply`; `projects/{id}/alt_suggestions`, `image_index`, `audit_decisions`) are documented in the worker/alt-text doc.

**firestore.rules** ([firestore.rules](../../firestore.rules)):
- `project_secrets/{projectId}`: `allow read, write: if false` (admin only).
- `projects/{projectId}`: create/update require `writeHasNoApiToken()` — rejects any `webflowConfig` containing `apiToken` (covered by [tests/firestore.rules.test.ts](../../tests/firestore.rules.test.ts)).
- `schema_analyses`, `cmsRuns`, `cmsRuns/*/events`, `schemaRuns`, `schemaRuns/*/events`, `webflow_account_history`, `webflow_sessions`: `allow read, write: if true` (world-readable/writable, including run `secret`s).

**firestore.indexes.json**: no composite indexes for this area (queries are single-field: `events orderBy at`, `schema_analyses where projectId`).

No Firebase Storage use.

## Background jobs

| Job | Schedule | Route | Auth | What it does |
|---|---|---|---|---|
| Webflow ↔ sitemap drift | `0 1 * * *` ([vercel.json](../../vercel.json)) | `GET /api/cron/webflow-sitemap-diff` | `isCronAuthorized` ([cron-auth.ts](../../src/lib/cron-auth.ts)): `Authorization: Bearer $CRON_SECRET` or `x-cron-secret`; fail-closed in production if unset | Loads all projects (`loadAllProjectsAdmin`), keeps `status` `current` (default) + `webflowConfig.siteId` + `hasApiToken` + `sitemapUrl`; 4 concurrent, 4-minute budget (`maxDuration` 300); persists each snapshot; computes paths **new since the previous snapshot** minus ignore list; one digest via `sendSitemapDriftNotifications` (email + Slack, [NotificationService.ts](../../src/services/NotificationService.ts)). Skipped projects are counted, not retried |
| Images screen work | on demand | worker queue (`worker_jobs`) | Firestore client write from `useLibraryOptimise` | `library_group` per group (ALT drafting then image optimise), `alt_apply` for a hand-typed ALT. Handlers in [src/lib/worker/handlers](../../src/lib/worker/handlers) — owned by the worker doc |

No Webflow webhooks are registered.

## Configuration

| Env var | Required? | Used in |
|---|---|---|
| `GEMINI_API_KEY` | For AI SEO generation (500 without it) | [ai-seo-gen/route.ts](../../src/app/api/ai-seo-gen/route.ts) |
| `CRON_SECRET` | Yes in production for the cron | [cron-auth.ts](../../src/lib/cron-auth.ts) |
| firebase-admin credentials (`FIREBASE_SERVICE_ACCOUNT_JSON` / `FIREBASE_SERVICE_ACCOUNT_KEY` / … ) | Yes — every token lookup is admin-only | [firebase-admin.ts](../../src/lib/firebase-admin.ts) |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Optional (default `http://127.0.0.1:11434`, `gemma4:e4b`) | [SchemaMarkupService.ts](../../src/services/SchemaMarkupService.ts) `analyzeWithOllama`, [scripts/schema-gen.ts](../../scripts/schema-gen.ts), [packages/schema-gen/src/cli.ts](../../packages/schema-gen/src/cli.ts) |
| `NEXT_PUBLIC_OLLAMA_BASE_URL`, `NEXT_PUBLIC_OLLAMA_MODEL` | Optional; only the unused `useSchemaAnalysis` | [useSchemaAnalysis.ts](../../src/hooks/useSchemaAnalysis.ts) |
| `OLLAMA_HOST`, `OLLAMA_MODEL` | Optional; `cms-alt` CLI only | [lib/cms/ai-alt.ts](../../src/lib/cms/ai-alt.ts) |
| `WEBFLOW_API_TOKEN` | For `npm run schema:gen` only | [scripts/schema-gen.ts](../../scripts/schema-gen.ts) |
| `MIGRATE_ENV_FILE` | Optional, token migration | [scripts/migrate-webflow-tokens.ts](../../scripts/migrate-webflow-tokens.ts) |
| Notification envs (`GMAIL_USER`, `GMAIL_APP_PASSWORD`, `NOTIFY_EMAIL`, Slack webhook/bot vars) | For the drift digest | read via `readFirstEnv` in [NotificationService.ts](../../src/services/NotificationService.ts) |

Stored secrets: the Webflow token per project in `project_secrets`. There is no app-wide Webflow token. No feature flags.

## External services

| Service | How | Auth |
|---|---|---|
| Webflow Data API v2 `https://api.webflow.com/v2` | Routes above; `/sites/{id}`, `/sites/{id}/pages`, `/pages/{id}`, `/pages/{id}/dom`, `/sites/{id}/publish`, `/sites/{id}/custom_domains`, `/sites/{id}/assets`, `/sites/{id}/asset_folders`, `/assets/{id}`, `/sites/{id}/collections`, `/collections/{id}`, `/collections/{id}/items`, `/items/publish` | `Authorization: Bearer <project token>` |
| Webflow Content Delivery API `https://api-cdn.webflow.com/v2` | [cms/live/route.ts](../../src/app/api/webflow/cms/live/route.ts) `/collections/{id}/items/live` — published items only, cached up to ~5 min, reports `fromCache` via `cf-cache-status` | same token |
| Webflow asset upload S3 | [lib/cms/assets.ts](../../src/lib/cms/assets.ts) (worker `image-apply`, CLI) | presigned `uploadDetails` |
| Google Gemini | [ai-seo-gen/route.ts](../../src/app/api/ai-seo-gen/route.ts) via `@google/genai`, model `gemini-flash-latest`, JSON response | `GEMINI_API_KEY` |
| Ollama (local) | Schema CLI / `analyzeWithOllama`; `cms-alt` CLI | none (localhost) |
| Arbitrary public sites | `scrapePageSignals` (schema), `fetchSitemapUrls` (drift) | none |

## Key flows

1. **Connect a project to Webflow.**
   `WebflowCredentialsDialog` → `POST /api/webflow/validate-token` (Webflow `GET /sites/{id}`; fills site name) → Save → `onSaveConfig` = `handleSaveWebflowConfig` in `ProjectDetailScreen` → `webflowConfigRepository.updateWebflowConfig` → `POST /api/webflow/config` → `requireProjectAccess` → `setWebflowToken` (`project_secrets`) → admin `set({webflowConfig:{…, hasApiToken:true}}, {merge:true})`. The project listener re-renders; hooks become ready when `siteId && hasApiToken`.

2. **Any Webflow API call from the browser.**
   Hook calls `fetchForProject(projectId, url)` → headers `x-project-id` + `Authorization: Bearer <ID token>` → route calls `resolveWebflowToken(req)` → `getProjectIdFromRequest` → `requireProjectAccess` (caller is @activeset.co, project exists) → `getWebflowToken` → proxy to Webflow with the token. The browser never sees the token (except reveal-token).

3. **Edit page SEO and publish.**
   `useWebflowPages.fetchPages(localeId)` → `/api/webflow/pages` → `webflowService.processPagesWithQC` + `calculateSiteHealth`. Row → `WebflowSEOEditor` (loads locale-specific data via `GET /pages/[id]`; CMS templates load collection fields and use `WebflowSEOInput`) → Save → `updatePageSEO` → `PUT /api/webflow/pages/[id]?localeId=` → re-score that row. "Generate" → `generatePageSEO` → `/pages/[id]/content` → `extractTextFromDOM` → `POST /api/ai-seo-gen`. Bulk: `WebflowBulkSEOEditor` → `bulkUpdatePagesSEO` (one PUT per changed page, sequential). **Publish Site** → `publishSite` → `POST /api/webflow/sites/[siteId]` `{action:'publish'}`; changes are staged until this happens.

4. **Images screen: ALT + optimise (apply path).**
   `WebflowImagesDashboard` loads `useWebflowAssets.fetchAssets('all')` and `useCmsImages.discoverCollections()`, then each collection sequentially via `loadCollectionImages` (`/cms/items`) and `loadPublished` (`/cms/live`). General assets = image assets minus `cmsSourceAssetIds(cms urls)`, only counted once all collections loaded. **Optimise** → `useLibraryOptimise.optimise(groups, publish)` → `worker_jobs` `library_group` per group. Row **Save** → `saveAlt` → `alt_apply` with `overrides:[{fingerprint, src, alt}]`; the worker's [alt-apply.ts](../../src/lib/worker/handlers/alt-apply.ts) writes CMS fields with `groupUpdatesByItem` + `patchItems` (optionally `publishItems`) and site assets with `webflowFetch('/assets/{id}', PATCH)`. The row's `LiveBadge` shows "pending" until the CDN copy matches. Drafting itself: see the worker/alt-text doc.

5. **Audit tab: in-place ALT fix on a site asset.**
   `useWebflowAssetIndex` → `POST /api/webflow/assets/resolve` (lists assets, `resolveAssets`) → only resolved srcs get a Save → `handleSaveAlt` → `PATCH /api/webflow/assets/[assetId]` `{altText}` → `recordDecision(... 'fixed_unverified')` → toast "publish the site, then verify" → `handlePublishSite` (`POST /sites/[siteId]`) → `handleVerifyAlt` rescans one page and records `verified` only if the live page shows the alt.

6. **Schema generation.**
   Schema tab → copy command → `reveal-token` (token substituted for `__WEBFLOW_TOKEN__` in the clipboard text) → `POST /api/webflow/schema/progress/start` → command gets `--run-id --run-secret --progress-url --upload-url` → user runs `npx @activeset/schema-gen@latest generate …` locally → CLI posts `progress/event` and `progress/upload` → `schema_analyses` docs → tab's `onSnapshot` shows them; live terminal polls `progress/events?since=`. Offline fallback: Import JSON writes the same docs from the browser.

7. **Sitemap drift.**
   `WebflowSitemapSync` → `useWebflowSitemapDiff.load` (GET stored) / `refresh` (POST → `runSitemapDiff`: all Webflow pages + sitemap URLs → `computeSitemapDiff`) → persisted on the project. Ignore → `/sitemap-diff/ignore`; lists are filtered at render. Nightly cron does the same for all eligible projects and notifies only new, non-ignored paths.

## Gotchas and invariants

- **Token never on the project doc.** Firestore rules reject any `webflowConfig.apiToken` write ([firestore.rules](../../firestore.rules) `writeHasNoApiToken`, ~line 95). Clients must use `webflowConfigRepository`; [database.ts](../../src/services/database.ts) deliberately has no webflowConfig writer. `hasApiToken` on the doc is the only client-visible signal.
- **`x-webflow-token` is gone.** No code sends or reads it; the token is resolved server-side from `x-project-id`. [.claude/CLAUDE.md](../../.claude/CLAUDE.md) still cites it as the pattern.
- **"Owns the project" is not enforced.** `resolveWebflowToken`'s comment ([webflow-token-resolver.ts:19](../../src/lib/webflow-token-resolver.ts)) says it checks ownership, but `requireProjectAccess` ([api-auth.ts:153-176](../../src/lib/api-auth.ts)) only checks @activeset.co + project exists. Any team member can use any project's token. Routes also trust the caller-supplied `siteId` / `collectionId` / `assetId` rather than checking it against `webflowConfig.siteId`.
- **Unauthenticated routes:** `validate-token` (open proxy to Webflow `GET /sites/{id}`), `ai-seo-gen` (spends Gemini quota; the hook calls it with plain `fetch`, [useWebflowPages.ts:320](../../src/hooks/useWebflowPages.ts)), `schema/scrape` (fetches any URL server-side), `cms/progress/start` and `schema/progress/start`. The schema `start` stores any `projectId` it is given and `progress/upload` then writes `schema_analyses` under it ([upload/route.ts:57-86](../../src/app/api/webflow/schema/progress/upload/route.ts)). Run docs (including `secret`) are world-readable under the permissive rules.
- **Changing Webflow via the API does not change the live site until publish.** Page PUTs, asset alt PATCHes and CMS PATCHes are staged. The Audit tab records `fixed_unverified` and never auto-verifies right after Save ([WebsiteAuditDashboardScreen.tsx:1585-1604](../../src/modules/site-monitoring/ui/screens/WebsiteAuditDashboardScreen.tsx)); the Images screen compares against `cms/live` for the same reason. `cms/live` is CDN-cached for up to ~5 minutes, so "pending" can lag a real publish.
- **The first 24-hex id in a Webflow CDN URL is not an asset id.** Only trust `resolveAssets` (exact hosted/variant URL, or a *unique* normalized name) — [webflow-assets.ts](../../src/modules/site-monitoring/domain/webflow-assets.ts) `idPrefixOf` is a hint only. In a CMS URL `<delivery id>_<source asset id>_name`, later ids can be the source asset; `cmsSourceAssetIds` removes those from "General assets" ([WebflowImagesDashboard.tsx:259](../../src/components/webflow/WebflowImagesDashboard.tsx)). CMS images never appear in the asset list; their alt lives on the item field.
- **A Webflow asset library is not all pictures.** Filter on `contentType.startsWith('image/')` ([assets/route.ts:68-73](../../src/app/api/webflow/assets/route.ts), [WebflowImagesDashboard.tsx:267](../../src/components/webflow/WebflowImagesDashboard.tsx)).
- **What Webflow's API cannot do:** it cannot replace an existing asset's bytes, and a Designer-placed image cannot be repointed. CMS image fields *can* be repointed. Hence `placementsFor` → cms / asset / unknown and copies into the "ActiveSet · optimised" folder for Designer swaps ([placement.ts:86-100](../../src/lib/cms/placement.ts)). Don't promise in-place replacement for assets.
- **No browser-side Webflow writes on the Images screen.** Both old Save buttons were retired; hand edits go through the worker as `alt_apply` `overrides` ([useLibraryOptimise.ts:142-156](../../src/modules/site-monitoring/ui/hooks/useLibraryOptimise.ts)). A portrait draft naming someone other than the CMS item is not pre-filled; the item's own name is ([WebflowImagesDashboard.tsx:748-766](../../src/components/webflow/WebflowImagesDashboard.tsx)).
- **Rate limits.** `webflowFetch` retries 429 ([webflow-client.ts:47-62](../../src/lib/cms/webflow-client.ts)); the pages, page, content, collections, sites, assets PATCH, assets/resolve and cms/publish routes use plain `fetch` and surface 429 to the user. The Images screen loads collections one at a time on purpose.
- **`__wf_reserved_inherit` counts as missing ALT** ([extract.ts:10](../../src/lib/cms/extract.ts), `BLANK_ALTS` in the Images dashboard).
- **RichText multi-image edits must be merged per field** or siblings are clobbered — always go through `groupUpdatesByItem` ([patch.ts:81-139](../../src/lib/cms/patch.ts)). `cms/update` batches RichText items 1 at a time, others 5.
- **Webflow rejects long asset file names**; `sanitizeAssetFileName` caps at 80 chars ([assets.ts:39](../../src/lib/cms/assets.ts)).
- **Pages list is capped at the first 100.** `useWebflowPages.fetchPages` sends no offset and the route defaults `limit=100` ([useWebflowPages.ts:84-93](../../src/hooks/useWebflowPages.ts)); sites with >100 pages are silently truncated in the Pages tab (the drift check paginates fully).
- **Site health averages static pages only** (`calculateSiteHealth` returns all zeros when there are no static pages). Length checks are skipped when the value contains `{{` (CMS variables).
- **Unpublish does not exist.** `POST /sites/[id]` with `unpublish` returns 400 and the hook short-circuits; the button is labelled "(N/A)". Publish with no `customDomains` publishes to **every** custom domain plus the Webflow subdomain.
- **Drift lists are stored raw**; the ignore list is applied at render and before notifying, so un-ignoring resurfaces instantly ([WebflowSitemapDiffService.ts:35-47](../../src/services/WebflowSitemapDiffService.ts)). `/404` and `/401` are never "missing from sitemap". CMS item URLs are excluded by folder of any CMS template page plus `folderPageTypes` `collection` entries.
- **Cron digest links use the request `Host` header** (`getBaseUrl`, [cron/webflow-sitemap-diff/route.ts:168-172](../../src/app/api/cron/webflow-sitemap-diff/route.ts)). It does not self-call, so the deployment-protection trap from the cron-internal-urls incident does not apply, but links may point at the deployment host rather than the canonical domain.
- **reveal-token puts the raw token on the clipboard** inside the copied CLI command ([WebflowSchemaDashboard.tsx:471-486](../../src/components/webflow/WebflowSchemaDashboard.tsx)); the on-screen preview masks it. Every reveal is logged with uid/email.
- **`deleteWebflowToken` deletes the whole `project_secrets` doc** — fine today because it only holds the Webflow token; switch to a field delete if another secret is added ([projectSecrets.ts:53-55](../../src/services/projectSecrets.ts)). There are two readers of that doc (`projectSecrets.ts`, `project-admin.ts:45`); keep field names in sync.
- **`scripts/schema-gen.ts` imports firebase-admin before `dotenv.config`** ([scripts/schema-gen.ts:28-39](../../scripts/schema-gen.ts)). firebase-admin resolves credentials at module load, so `.env.local` values arrive too late unless already exported — the same trap the worker fixed with `src/lib/load-env.ts`. The published `@activeset/schema-gen` package uses the upload route instead.
- **`lib/cms/compress.ts` is lossless-WebP only** and used only by the `cms-alt` CLI. The worker's optimiser (lossless vs q90, take smaller — "looks and feels lossless") lives in `src/lib/worker/handlers/image-budget.ts`; do not wire `compress.ts` into app flows.
- **`/api/webflow/session` uses the Firebase *client* SDK on the server** with no auth, relying on permissive rules for `webflow_sessions` / `webflow_account_history`.

## Tests

| File | Covers | Run with |
|---|---|---|
| [webflow-assets.test.ts](../../src/modules/site-monitoring/domain/webflow-assets.test.ts) | `idPrefixOf`, `normaliseAssetName`, non-image filtering, `resolveAssets`, `cmsSourceAssetIds` | `npm run test:site-monitoring` (also in `npm test`) |
| [tests/firestore.rules.test.ts](../../tests/firestore.rules.test.ts) | `webflowConfig.apiToken` rejection, `project_secrets` deny-all | `npm run test:rules` (needs Firebase emulator + JDK) |
| [image-budget.test.ts](../../src/lib/worker/handlers/image-budget.test.ts) | Worker image optimiser (adjacent) | `npm run test:worker` |

No tests for `WebflowService`, `WebflowSitemapDiffService`, `lib/cms/patch.ts`, `lib/cms/extract.ts`, or any `/api/webflow/**` route.

## Related docs

| Doc | Status |
|---|---|
| [docs/features/webflow-pages.md](../features/webflow-pages.md) | Partially stale. Accurate on scoring shape, editors, variables, locale, Copy DOM. Stale: calls `WebflowPagesDashboard` "the main controller" of pages only (it now hosts Images/Schema/Sitemap Sync); claims large sites are handled via pagination/virtualization and that page data is cached (neither — first 100 pages, refetch on locale change); "optimistic UI … background validators" (updates happen after the PUT succeeds); says nothing about token storage |
| [docs/misc/webflow/](../misc/webflow/) (pages, CMS, Assets, localisation) | Copies of Webflow's v2 API reference; useful for endpoint shapes; not app docs and not verified against Webflow's current API |
| [docs/features-to-be-developed/4. Schema Markup-20260121163149.html](<../features-to-be-developed/4. Schema Markup-20260121163149.html>) | ClickUp export stub: only headings "Organisation Schema Markup", "Blog Schema Markup", "Breadcrumb Markup". No spec content |
| [worker-alt-text-images.md](./worker-alt-text-images.md) | Owns ALT drafting, `library_group` / `alt_apply` / `image_apply` handlers, `alt_suggestions`, `image_index` |
| [docs/features/worker.md](../features/worker.md), [docs/features/alt-text.md](../features/alt-text.md) | Deeper worker / alt-text write-ups (not re-verified here) |
| [docs/plans/audit-redesign.md](../plans/audit-redesign.md), [docs/features/audit-dashboard.md](../features/audit-dashboard.md) | Audit tab design incl. publish-before-verify loop (not re-verified here) |
| [docs/features/webflow-tracker-extension.md](../features/webflow-tracker-extension.md) | Owns `/api/webflow/session` and the tracker extension |
| [packages/schema-gen/README.md](../../packages/schema-gen/README.md) | CLI usage (not re-verified here) |
| [.claude/CLAUDE.md](../../.claude/CLAUDE.md) | Stale for this area: "External API tokens passed via headers (e.g., `x-webflow-token`)" — tokens are resolved server-side from `project_secrets` |
