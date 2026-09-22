---
module: platform
title: Environment variables (master list)
keywords: [env, environment variables, process.env, import.meta.env, .env.local, .env.vercel-production, vercel env, secrets, config, NEXT_PUBLIC, CRON_SECRET, firebase credentials, service account, GEMINI_API_KEY, SLACK, GMAIL, OLLAMA, CLICKUP, TYPESAFE, BUNNY, WEBFLOW_TOKEN]
entry_points: []
code_roots: [src, scripts, apps, packages/activeset-capture/src, packages/cms-alt/src, packages/schema-gen/src, extensions, next.config.ts]
last_verified: 2026-09-23 @ a00f91e
---
# Environment variables (master list)

> Every environment variable the code reads at a00f91e. The list comes from grepping `process.env.X`, `process.env['X']` and `import.meta.env.X` across `src/`, `scripts/`, `apps/`, `packages/*/src`, `extensions/` and `next.config.ts`, plus names passed as strings to `readEnv` / `readFirstEnv` ([runtime-env.ts](../../src/lib/runtime-env.ts)), `process.env[KEY_ENV]` ([client-portal-tokens.ts](../../src/lib/client-portal-tokens.ts)) and `requireEnv(…, 'X')` ([packages/schema-gen/src/cli.ts](../../packages/schema-gen/src/cli.ts)). Test-only reads (`*.test.ts`) are included when the var is also read by real code.

## How env is loaded

- **Next.js app (Vercel / `npm run dev`)**: Next loads `.env*` itself. `NEXT_PUBLIC_*` values are inlined into the browser bundle at build time, so changing one needs a rebuild. Everything else is server-only.
- **tsx scripts** that use firebase-admin must `import '@/lib/load-env'` first ([load-env.ts](../../src/lib/load-env.ts)). It reads `.env.local`, then `.env.vercel-production`, then `.env`, and the first value seen wins. `isPlaceholder()` / `env()` treat Vercel's `[SENSITIVE]` / `[SECRET]` pull placeholders as missing. Currently only [worker.ts](../../scripts/worker.ts) and [alt-text.ts](../../scripts/alt-text.ts) import it.
- **Deploy/migrate scripts** load `DEPLOY_ENV_FILE` / `MIGRATE_ENV_FILE`, then `.env.vercel-production`, `.env.local` and `.env`, and stop at the first file that exists (opposite precedence to `load-env.ts`).
- `apps/raycast` and `extensions/refrens-skydo-bridge` read no env vars. Raycast uses extension preferences and the Chrome extension uses `chrome.storage`.
- Implicit: `ai` SDK calls with string model ids like `'google/gemini-2.5-flash'` (`PROPOSAL_AI_MODEL`, `NAG_AI_MODEL` defaults) go through the Vercel AI Gateway. The library authenticates itself (`AI_GATEWAY_API_KEY` or Vercel OIDC), and no repo code reads those names.

"Required?" means: **Yes** = the app, or the named feature on it, fails or fails closed without it in production. **Feature** = only that feature breaks. **Optional** = has a default or fallback. **Platform** = set by the runtime, never set by hand.

## Firebase and core platform

| Name | Required? | Public? | Read in (files) | Purpose | Owner |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes | Yes | [firebase.ts](../../src/lib/firebase.ts), [seed-templates.ts](../../scripts/seed-templates.ts) | Firebase web SDK config. Missing → `auth/invalid-api-key` in the browser | platform |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes | Yes | firebase.ts, seed-templates.ts | Web SDK auth domain (Google popup) | platform |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes | Yes | firebase.ts, [firebase-admin.ts](../../src/lib/firebase-admin.ts), [deploy-firestore-indexes.ts](../../scripts/deploy-firestore-indexes.ts), seed-templates.ts | Project id. firebase-admin falls back to it when `FIREBASE_PROJECT_ID` is unset | platform |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Feature (Storage) | Yes | firebase.ts, firebase-admin.ts, seed-templates.ts | Storage bucket for client SDK and admin (`upload-captures`, screenshots) | platform |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Optional | Yes | firebase.ts, seed-templates.ts | Web SDK config | platform |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Yes | Yes | firebase.ts, seed-templates.ts | Web SDK config | platform |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Optional | Yes | firebase.ts, seed-templates.ts | Analytics id (Analytics is never initialised) | platform |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Yes (one credential form) | No | firebase-admin.ts, [deploy-firestore-rules.ts](../../scripts/deploy-firestore-rules.ts), deploy-firestore-indexes.ts, [migrate-webflow-tokens.ts](../../scripts/migrate-webflow-tokens.ts) | Service-account JSON (plain, raw-newline, or base64). First candidate checked | platform |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes (one credential form) | No | same four files | Same as above; the name set in Vercel Production (memory `cron-internal-urls.md`) | platform |
| `GOOGLE_CREDENTIALS` | Alt credential | No | same four files | Same JSON alias | platform |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Alt credential | No | same four files | Same JSON alias | platform |
| `GCLOUD_SERVICE_ACCOUNT_KEY` | Alt credential | No | firebase-admin.ts, deploy-firestore-rules.ts, migrate-webflow-tokens.ts | Same JSON alias (not read by the index deploy script) | platform |
| `FIREBASE_CLIENT_EMAIL` | Alt credential | No | firebase-admin.ts | Split-credential form: client email | platform |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Alt credential | No | firebase-admin.ts | Alias of the above | platform |
| `FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL` | Alt credential | No | firebase-admin.ts | Alias of the above | platform |
| `FIREBASE_PRIVATE_KEY` | Alt credential | No | firebase-admin.ts | Split-credential form: private key (`\n` escapes normalised) | platform |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Alt credential | No | firebase-admin.ts | Alias of the above | platform |
| `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY` | Alt credential | No | firebase-admin.ts | Alias of the above | platform |
| `FIREBASE_PROJECT_ID` | Optional | No | firebase-admin.ts, deploy-firestore-indexes.ts | Overrides the admin project id | platform |
| `FIREBASE_STORAGE_BUCKET` | Optional | No | firebase-admin.ts | Admin bucket if the public one is unset | platform |
| `FIREBASE_USE_APPLICATION_DEFAULT` | Optional | No | firebase-admin.ts | `true` → use Application Default Credentials | platform |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional | No | firebase-admin.ts | Presence switches firebase-admin to ADC | platform |
| `K_SERVICE` | Platform | No | firebase-admin.ts | Cloud Run hint → ADC | platform |
| `FUNCTION_TARGET` | Platform | No | firebase-admin.ts | Cloud Functions hint → ADC | platform |
| `GOOGLE_CLOUD_PROJECT` | Platform | No | firebase-admin.ts | GCP hint → ADC | platform |
| `CRON_SECRET` | Yes | No | [cron-auth.ts](../../src/lib/cron-auth.ts) | Bearer / `x-cron-secret` for every `/api/cron/*` and `scan-bulk/process`. Unset in production → all cron calls rejected | platform |
| `NEXT_PUBLIC_BASE_URL` | Yes (effectively) | Yes | [base-url.ts](../../src/lib/base-url.ts), [scan-job-dispatch.ts](../../src/lib/scan-job-dispatch.ts), [ScanNotificationQueueService.ts](../../src/services/ScanNotificationQueueService.ts), [scan-bulk/notify](../../src/app/api/scan-bulk/notify/route.ts), [send-notification](../../src/app/api/send-notification/route.ts), [upload-captures](../../src/app/api/upload-captures/route.ts), [ProposalService.ts](../../src/app/modules/proposal/services/ProposalService.ts), [review-digest.ts](../../src/lib/review-digest.ts) | Public origin for links and for server-to-self fetches from crons. Without it, crons call the protected deployment URL and get 302'd | platform |
| `APP_BASE_URL` | Optional | No | base-url.ts | Fallback for `NEXT_PUBLIC_BASE_URL` in `getBaseUrl()` | platform |
| `NEXT_PUBLIC_APP_URL` | Optional | Yes | [generate-pdf](../../src/app/api/generate-pdf/route.ts), [clickup/register-webhook](../../src/app/api/clickup/register-webhook/route.ts), [cron/refrens-sync](../../src/app/api/cron/refrens-sync/route.ts), [refrens/invoices/[id]](../../src/app/api/refrens/invoices/[id]/route.ts), review-digest.ts, [create-contract.ts](../../scripts/create-contract.ts) | A second "public origin" var, used by these callers instead of `NEXT_PUBLIC_BASE_URL` | platform |
| `VERCEL_ENV` | Platform | No | base-url.ts | `production` → `https://app.activeset.co` fallback | platform |
| `VERCEL_URL` | Platform | No | base-url.ts, clickup/register-webhook | Deployment host fallback | platform |
| `VERCEL` | Platform | No | [ScreenshotService.ts](../../src/services/ScreenshotService.ts) | Detects serverless → use `@sparticuz/chromium` | site-audit |
| `AWS_LAMBDA_FUNCTION_NAME` | Platform | No | ScreenshotService.ts | Same serverless detection | site-audit |
| `NODE_ENV` | Platform | No | [api-auth.ts](../../src/lib/api-auth.ts), cron-auth.ts, [auth/dev-token](../../src/app/api/auth/dev-token/route.ts), [database.ts](../../src/services/database.ts) | Gates dev-only paths (dev token, local API auth, local project bypass, cron fail-open) | platform |
| `ACTIVESET_LOCAL_DEV_API_AUTH` | Optional (dev) | No | api-auth.ts | `true` + no admin creds + localhost + non-prod → API routes accept a fake admin caller | platform |
| `NEXT_PUBLIC_ACTIVESET_LOCAL_DEV_API_AUTH` | Optional (dev) | Yes | api-auth.ts | Same switch, public-prefixed twin | platform |
| `DEPLOY_ENV_FILE` | Optional | No | deploy-firestore-rules.ts, deploy-firestore-indexes.ts | Which env file the deploy scripts load first | platform |
| `GMAIL_USER` | Feature (email) | No | [NotificationService.ts](../../src/services/NotificationService.ts), send-notification, review-digest.ts, [scan-bulk/debug-notifications](../../src/app/api/scan-bulk/debug-notifications/route.ts) | SMTP user for all app email | platform |
| `GMAIL_APP_PASSWORD` | Feature (email) | No | NotificationService.ts, send-notification, review-digest.ts | Gmail app password | platform |
| `NOTIFY_EMAIL` | Feature (email) | No | NotificationService.ts, send-notification, review-digest.ts, [cron/delivery-nudge](../../src/app/api/cron/delivery-nudge/route.ts) | Default recipient for alerts, health reports, nudges and digests | platform |

## Notifications (Slack)

| Name | Required? | Public? | Read in (files) | Purpose | Owner |
|---|---|---|---|---|---|
| `SLACK_WEBHOOK_URL` | Feature | No | NotificationService.ts, scan-bulk/debug-notifications | Incoming webhook for alert / health / scan Slack posts (first of 4 aliases) | site-monitoring |
| `SLACK_WEBHOOK` | Alias | No | same | Alias | site-monitoring |
| `NOTIFICATION_SLACK_WEBHOOK_URL` | Alias | No | same | Alias | site-monitoring |
| `NEXT_PUBLIC_SLACK_WEBHOOK_URL` | Alias | Yes | same (server-side only, but the prefix would inline it into any client bundle that referenced it) | Alias | site-monitoring |
| `SLACK_BOT_TOKEN` | Feature | No | NotificationService.ts, [slack.ts](../../src/lib/slack.ts), [nag-bot.ts](../../src/lib/nag-bot.ts), [clickup/test-nag](../../src/app/api/clickup/test-nag/route.ts), debug-notifications | Bot token for `chat.postMessage` / DMs (nag bot, notifications) | clickup-tasks |
| `SLACK_CHANNEL_ID` | Feature | No | NotificationService.ts, slack.ts, nag-bot.ts, debug-notifications | Default channel for bot posts | clickup-tasks |

## AI

| Name | Required? | Public? | Read in (files) | Purpose | Owner |
|---|---|---|---|---|---|
| `GEMINI_API_KEY` | Feature | No | [api/audit](../../src/app/api/audit/route.ts), [api/ai-seo-gen](../../src/app/api/ai-seo-gen/route.ts), [api/ai-checklist](../../src/app/api/ai-checklist/route.ts) | `@google/genai` key for content audit, SEO meta generation, AI checklist generation | site-audit (also webflow, project-links checklists) |
| `PROPOSAL_AI_MODEL` | Optional (default `google/gemini-2.5-flash`) | No | [ai/proposal-draft](../../src/app/api/ai/proposal-draft/route.ts), [ai/proposal-block](../../src/app/api/ai/proposal-block/route.ts), [tasks/parse-request](../../src/app/api/tasks/parse-request/route.ts) | AI Gateway model id for proposal drafting and request→task parsing | proposal (also clickup-tasks) |
| `NAG_AI_MODEL` | Optional (default `google/gemini-2.5-flash`) | No | nag-bot.ts | Model for the nag-bot message writer | clickup-tasks |
| `NEXT_PUBLIC_AI_SOURCE` | Optional (default `gateway`) | Yes | [aiClient.ts](../../src/app/modules/proposal/services/aiClient.ts) | `ollama` makes the proposal editor call Ollama from the browser instead of the server | proposal |
| `NEXT_PUBLIC_OLLAMA_BASE_URL` | Optional | Yes | aiClient.ts, [useSchemaAnalysis.ts](../../src/hooks/useSchemaAnalysis.ts) | Browser-side Ollama URL | proposal, webflow |
| `NEXT_PUBLIC_OLLAMA_MODEL` | Optional | Yes | aiClient.ts, useSchemaAnalysis.ts | Browser-side Ollama model | proposal, webflow |
| `OLLAMA_BASE_URL` | Optional | No | [SchemaMarkupService.ts](../../src/services/SchemaMarkupService.ts), [schema-gen.ts](../../scripts/schema-gen.ts), [schema-gen cli](../../packages/schema-gen/src/cli.ts) | Ollama URL for schema-markup generation | webflow |
| `OLLAMA_HOST` | Optional | No | [alt-text/ollama.ts](../../src/lib/alt-text/ollama.ts), [cms/ai-alt.ts](../../src/lib/cms/ai-alt.ts), [cms-alt.ts](../../scripts/cms-alt.ts), [cms-alt cli](../../packages/cms-alt/src/cli.ts), [cms-alt ai-alt](../../packages/cms-alt/src/ai-alt.ts) | Ollama URL for alt-text drafting | worker-alt-text-images |
| `OLLAMA_MODEL` | Optional | No | alt-text/ollama.ts, cms/ai-alt.ts, cms-alt.ts, cms-alt cli + ai-alt, SchemaMarkupService.ts, schema-gen.ts, schema-gen cli | Default Ollama model (alt text and schema) | worker-alt-text-images, webflow |
| `OLLAMA_ALT_MODEL` | Optional | No | alt-text/ollama.ts, worker.ts | Alt-text model override | worker-alt-text-images |
| `OLLAMA_KEEP_ALIVE` | Optional (default `15m`) | No | alt-text/ollama.ts | How long Ollama keeps the model loaded | worker-alt-text-images |
| `ALT_TEXT_CACHE_DIR` | Optional (default `.cache/alt-text`) | No | [alt-text/cache.ts](../../src/lib/alt-text/cache.ts) | On-disk cache for alt-text answers | worker-alt-text-images |
| `TYPESAFE_API_KEY` | Feature | No | [jev.ts](../../src/lib/jev.ts) | TypeSafe / Jev typed judgments in page QA; without it Jev answers nothing | site-audit |
| `LANGUAGETOOL_URL` | Optional | No | [api/check-text](../../src/app/api/check-text/route.ts) | Self-hosted LanguageTool instead of the public API | site-audit |

## Integrations

| Name | Required? | Public? | Read in (files) | Purpose | Owner |
|---|---|---|---|---|---|
| `CLICKUP_API_TOKEN` | Feature | No | [clickup.ts](../../src/lib/clickup.ts) | ClickUp personal token (throws "not configured" without it) | clickup-tasks |
| `CLICKUP_TEAM_ID` | Optional | No | [clickup/members](../../src/app/api/clickup/members/route.ts), clickup/register-webhook, [raycast/assignees](../../src/app/api/raycast/assignees/route.ts) | Workspace id fallback when not stored in `app_secrets/clickup` | clickup-tasks |
| `NEXT_PUBLIC_CLICKUP_TEAM_ID` | Optional | Yes | [ClickUpListLinkCard.tsx](../../src/components/tasks/ClickUpListLinkCard.tsx) | Builds `app.clickup.com/<team>/v/li/<list>` links | clickup-tasks |
| `NAG_TEAM_EMAILS` | Optional | No | [team.ts](../../src/lib/team.ts) | Extra comma-separated emails the nag bot may ping | clickup-tasks |
| `REVIEW_DIGEST_EMAIL` | Optional | No | review-digest.ts | Recipient for the weekday review digest (else `NOTIFY_EMAIL`) | project-links |
| `REVIEW_TIMEZONE` | Optional | No | review-digest.ts, [raycast-projects.ts](../../src/lib/raycast-projects.ts) | Time zone for "today" in review digest / Raycast | project-links |
| `DAILY_SCAN_TIME_ZONE` | Optional | No | raycast-projects.ts | Fallback for `REVIEW_TIMEZONE` (only read there) | tools-and-extensions |
| `REFRENS_API_BASE_URL` | Optional | No | [RefrensService.ts](../../src/services/RefrensService.ts) | Override Refrens API base (credentials live in `app_secrets/refrens`) | tools-and-extensions |
| `RAYCAST_API_TOKEN` | Optional | No | [raycast-auth.ts](../../src/lib/raycast-auth.ts) | Shared bearer token accepted by `/api/raycast/*` | tools-and-extensions |
| `ACTIVESET_UPLOAD_KEY` | Optional (insecure default `activeset-capture-v1`) | No | [upload-captures](../../src/app/api/upload-captures/route.ts), [signing.ts](../../packages/activeset-capture/src/core/signing.ts) | HMAC key shared by the capture CLI and the upload route | tools-and-extensions |
| `CLIENT_PORTAL_TOKEN_KEY` | Optional | No | [client-portal-tokens.ts](../../src/lib/client-portal-tokens.ts) | 32-byte key (hex/base64) that lets portal links be re-shown (encrypted copy stored) | client-portal |
| `PROPOSAL_VIEW_IP_SALT` | Optional (hard-coded default) | No | [portal/[token]/view](../../src/app/api/portal/[token]/view/route.ts), [proposals/[id]/view](../../src/app/api/proposals/[id]/view/route.ts), [proposals/[id]/sign](../../src/app/api/proposals/[id]/sign/route.ts) | Salt for hashing viewer IPs | proposal, client-portal |
| `BUNNY_STORAGE_ZONE` | Feature (backups) | No | [backup/bunny.ts](../../src/lib/backup/bunny.ts) | Bunny storage zone for original-image backups | worker-alt-text-images |
| `BUNNY_STORAGE_KEY` | Feature (backups) | No | backup/bunny.ts | Bunny storage API key | worker-alt-text-images |
| `BUNNY_STORAGE_HOST` | Optional | No | backup/bunny.ts | Regional storage host | worker-alt-text-images |
| `BUNNY_CDN_HOST` | Optional | No | backup/bunny.ts | Pull-zone host so backups can be read back | worker-alt-text-images |

## Scripts, CLIs and the worker

| Name | Required? | Public? | Read in (files) | Purpose | Owner |
|---|---|---|---|---|---|
| `WORKER_ID` | Optional (default hostname) | No | [worker.ts](../../scripts/worker.ts) | Worker identity in `workers/{id}` | worker-alt-text-images |
| `WORKER_EMIT_DIR` | Optional (default `optimised-images`) | No | worker.ts | Where optimised images are written | worker-alt-text-images |
| `PUPPETEER_EXECUTABLE_PATH` | Optional | No | ScreenshotService.ts, [image-budget/browser.ts](../../src/lib/image-budget/browser.ts), [local-capture/engine.ts](../../src/local-capture/engine.ts), [activeset-capture engine](../../packages/activeset-capture/src/core/engine.ts) | Chrome binary for puppeteer | site-audit, worker-alt-text-images, tools-and-extensions |
| `CHROME_PATH` | Optional | No | image-budget/browser.ts | Fallback Chrome path | worker-alt-text-images |
| `LOCALAPPDATA` | Platform (Windows) | No | image-budget/browser.ts | Finds per-user Chrome on the Windows worker | worker-alt-text-images |
| `WEBFLOW_TOKEN` | Feature (CLI) | No | cms-alt.ts, cms-alt cli | Webflow token for the CMS alt CLI | worker-alt-text-images |
| `WEBFLOW_API_TOKEN` | Feature (CLI) | No | cms-alt.ts, cms-alt cli, schema-gen.ts, schema-gen cli | Alias / schema-gen token | worker-alt-text-images, webflow |
| `WEBFLOW_SITE_ID` | Feature (CLI) | No | cms-alt.ts, cms-alt cli | Default site for the CMS alt CLI | worker-alt-text-images |
| `MIGRATE_ENV_FILE` | Optional | No | migrate-webflow-tokens.ts | Env file for the token migration | webflow |
| `CONTRACT_AUTHOR` | Optional | No | create-contract.ts | Default `--author` for the agreement CLI | proposal |
| `NO_COLOR` | Optional | No | worker.ts, alt-text.ts, [schema-gen ui](../../packages/schema-gen/src/ui.ts) | Disable ANSI colour | platform |
| `TERM` | Platform | No | schema-gen ui | `dumb` disables colour | platform |

## Discrepancies worth knowing

- `.claude/CLAUDE.md` / `AGENTS.md` list only the six Firebase web vars, `GEMINI_API_KEY` and the three Gmail vars. They omit the firebase-admin credential, `CRON_SECRET`, `NEXT_PUBLIC_BASE_URL` and all the integration keys above.
- Two public-origin vars coexist (`NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_APP_URL`). Set both to the same value.
- `ACTIVESET_UPLOAD_KEY` and `PROPOSAL_VIEW_IP_SALT` fall back to constants that are committed in the repo, so leaving them unset is insecure, not broken.
- `NEXT_PUBLIC_SLACK_WEBHOOK_URL` is accepted as a server-side alias. A `NEXT_PUBLIC_` secret would be inlined into any client bundle that referenced it.
- `scripts/schema-gen.ts` defines a `requireEnv` helper that is never called.
