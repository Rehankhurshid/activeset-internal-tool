# Client Portal

A private, branded page per project that a client can open from a link, plus the
internal **Client** tab and dashboard signals the team uses to run it. This is the
"client inclusion" layer: the client sees where the project is, what is next and
what we need from them; the team tracks client-facing state without leaving the
project dashboard.

## Structure

```
Client (company)          Project.client (free text today; a clients entity is planned)
└─ Project                projects/{id} + clientPortal{} + clientFacing{}
   ├─ Phase               project_timelines/{projectId}.phases[]
   │   └─ Milestone       .milestones[] — shown only when clientVisible === true
   ├─ Deliverables        Project.links[] (manual links) — shown only when clientVisible === true
   ├─ Waiting on you      tasks where needsClientInput === true and status !== 'done'
   ├─ Recent updates      projects/{id}/client_updates — short notes the team posts
   └─ Replies             projects/{id}/client_messages — what the client writes back
```

Vocabulary: the internal project `status` (current / paused / closed / paid) and
`tags` never reach the client. The **client status** is a separate field the team
sets: `on_track`, `needs_client`, `blocked`, `paused`, `delivered`. The portal shows
it with softer wording (On track / Waiting on you / On hold / Paused / Delivered);
milestone statuses appear as Upcoming / In progress / Done / On hold.

## The client's experience

- **URL**: `https://app.activeset.co/portal/<token>`. No login. The token is the
  credential; the page is `noindex`, sends `Referrer-Policy: no-referrer`, and
  never renders in the app shell.
- **Page** (light theme, phone-first, ~760px): header with the client's logo/name
  and the project name; a "Where we are" card (status chip, one-line note,
  phase stepper such as "Phase 2 of 4 · Build", next milestone, progress,
  "Last update 3 days ago"); the plan (phases with their visible milestones);
  deliverables (visible links + Open site); "What we need from you" (only when
  there are asks); a footer saying the page is private and whom to ask for a new
  link.
- **States**: a revoked, rotated, expired, malformed or disabled link shows
  "This link is no longer active"; a deployment without firebase-admin
  credentials shows "temporarily unavailable". `?preview=1` shows a preview
  banner and is never counted as a view.
- **Updates and replies**: the team's recent updates appear under the status
  card. When replies are on, the client can write back — either as a general
  message or attached to one of the asks, which then reads "You answered on
  12 Sep". Their own text is never echoed back onto the page; the projection
  uses their messages only to decide which asks look answered.
- **Never shown**: task descriptions, checklists, audits and health data, images,
  invoices, internal status/tags, billing, tokens, milestone notes/assignees,
  team emails other than the agency contact, other projects, and any phase that
  has no client-visible milestone in it.

## The team's workflow

1. Open a project → **Client** tab (second tab, `2`).
2. **Portal link card**: Enable → Copy link (`c` from anywhere on the project
   screen; `s` shares it too) → paste into the client's Slack or email. Rotate
   issues a new link and kills the old one immediately; Disable turns the portal
   off. "Preview as client" opens the page with `?preview=1`. "Opened N× · last …"
   opens the same views popover the proposals use.
3. **Status editor**: client status, a one-line note, the current phase
   (or automatic), "Mark updated" to refresh the freshness stamp.
4. **Visibility**: switches for each milestone (also in the Timeline tab's edit
   sheet as "Visible to client") and each manual link. No plan yet → start one
   from a timeline template right there.
5. **Branding**: brand name (defaults to the project's client) and a welcome
   line. The logo comes from the project logo.
6. **Tasks**: mark a task "Needs client input" to put it on the portal's
   "What we need from you" list (title and due date only). The task title is
   what the client reads, word for word — the Client tab lists the currently
   published asks so this is visible in the place the team checks.
7. **Updates**: post a short note from the Client tab; it appears on the client's
   page newest-first, and can be pinned.
8. **Replies**: the client's messages arrive in the Client tab with an unread
   count, and can be marked read or turned into an internal request. Replies can
   be switched off per project.

The project list shows a client-status chip on each card, counts of shared /
waiting-on-client / stale portals, and a `needs_client` filter (Phase 1b).

## Data model

On the project document (`src/types/index.ts`):

| Field | Written by | Notes |
| --- | --- | --- |
| `clientPortal.enabled` | server (token store, transactional) | Strictly `true` or the link is dead. |
| `clientPortal.activeTokenHash` | server (token store, transactional) | Points at the one live token. A link resolves only when it names this hash, so a stray record can never work. |
| `clientPortal.tokenIssuedAt` | server | Stamped on issue and rotate. |
| `clientPortal.brandName`, `welcome`, `brandLogoUrl`, `contactEmails` | team (client SDK) | Branding and copy. |
| `clientFacing.status`, `statusNote`, `currentPhaseId`, `lastUpdateAt`, `lastUpdateBy` | team (client SDK) | Bumps `updatedAt` like every team edit. |
| `clientFacing.viewCount`, `lastViewedAt`, `lastViewCountry`, `lastViewCity` | server (beacon, firebase-admin) | Merged in place; **never** touches `updatedAt`, so client opens do not reorder the project lists. |
| `links[].clientVisible`, `project_timelines.milestones[].clientVisible` | team | Default false. |

Server-only collections (absent from `firestore.rules` on purpose, so client SDKs
are denied by default):

- `client_portal_tokens/{sha256(token)}` — `{ projectId, active, createdBy, createdAt, expiresAt?, revokedAt?, revokedBy?, lastUsedAt?, useCount, tokenCiphertext? }`. The raw token is **never** stored in the clear, so a Firestore export yields no working links.
- `projects/{id}/client_updates` — `{ title?, body, postedAt, postedBy, pinned? }`. Team-readable and team-writable from the browser.
- `projects/{id}/client_messages` — `{ body, askTaskId?, authorName?, createdAt, readAt?, readBy?, convertedRequestId? }`. The rules allow the team to read, update and delete, and deny `create` to every client-SDK identity including an admin's, so the portal route is the only writer.
- `projects/{id}/portal_views` — one row per counted open: `{ projectId, tokenHash, viewedAt, ipHash?, userAgent?, referrer?, country?, city? }`. A subcollection rather than a top-level one so the Client tab can `orderBy('viewedAt')` without a composite index. Firestore rules do not cascade into subcollections and nothing matches this path, so it is deny-by-default even though the parent project doc is team-readable.

## Security model

- **Token**: 32 random bytes, base64url, minted only in `src/lib/client-portal-tokens.ts`;
  the document id is its SHA-256 and the raw value is never persisted in the
  clear. With `CLIENT_PORTAL_TOKEN_KEY` set it is kept AES-256-GCM encrypted so
  the Client tab can re-show the link; without the key the link is shown once,
  on enable or rotate, and Rotate issues a fresh visible one.
- **One live link**: issue, rotate and disable each run in a Firestore
  transaction that revokes every active record, writes the new one, and moves
  the project's `clientPortal.activeTokenHash` pointer in the same commit, so
  concurrent clicks from two teammates cannot leave two working links.
  Verification requires the record to be active and unexpired, the project's
  portal to be enabled, **and** the pointer to name this record.
- **Uniform rejection**: unknown, malformed, revoked, expired and
  portal-disabled links all perform the same two reads and return the same
  404 text, so timing and wording reveal nothing about why a link stopped
  working. `enable` never revives a previously shared link: if the portal was
  switched off out-of-band, it issues a fresh token.
- **Allow-list**: `buildClientPortalView` in
  `src/modules/client-portal/domain/client-portal.projection.ts` is the only
  payload the page receives. `client-portal.projection.test.ts` asserts the
  output keys and that sentinel values planted on every internal field never
  appear in the JSON. Run it with `npm run test:client-portal`.
- **Rules**: `firestore.rules` tightened alongside this feature — writes on
  `tasks`, `project_timelines`, `project_checklists`, `requests` are team-only,
  `access_control` writes are admin-only, proposal collections are team-only
  except the public client comment and signature paths. `npm run test:rules`
  runs the emulator suite (needs Java).
- **Beacon** (`POST /api/portal/[token]/view`): bot user agents skipped, IP hashed
  with `PROPOSAL_VIEW_IP_SALT`, geo from Vercel headers. It is also the only
  place token usage is stamped — the page loader is strictly read-only, so a
  Slack unfurl or an agency preview never counts as a client open.
- **Headers**: `/portal/*` gets `Referrer-Policy: no-referrer` and
  `X-Robots-Tag: noindex` in `next.config.ts`.

## API routes

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /api/client-portal/[projectId]/link` | team (`requireProjectAccess`) | Current link state. |
| `POST /api/client-portal/[projectId]/link` `{ action: enable \| rotate \| disable }` | team | Manage the link; also writes `clientPortal.enabled`. |
| `GET /api/client-portal/[projectId]/views?limit=N` | team | Recent opens (same shape as proposal views). |
| `POST /api/portal/[token]/view` `{ preview?: boolean }` | token | View beacon. |
| `POST /api/portal/[token]/messages` `{ body, askTaskId?, name?, company? }` | token | The client's reply. The only write a client can make. |

Everything else the team does (posting updates, marking messages read, toggling
replies) is a plain Firestore write through the client SDK, gated by the rules,
so the Client tab updates live.

The message route has no rate limiter to lean on — the codebase has none — so it
defends itself: a valid unexpired token, `repliesOpen` not switched off, a
honeypot field, a 4000-character cap, and a 20-per-hour cap counted from the
subcollection. None of that stops someone holding the link; it stops scripted
noise and runaway write costs.

## Files

- Domain: `src/modules/client-portal/domain/*` (types, projection + test, status helpers).
- Server-only: `src/lib/client-portal-tokens.ts`, `src/lib/client-portal-auth.ts`,
  `src/lib/client-portal.ts` (loader), `src/lib/base-url.ts`.
- Page: `src/app/portal/[token]/page.tsx` → `ClientPortalScreen` and the
  `Portal*` components in `src/modules/client-portal/ui/`.
- Team UI: `ClientPanel` (Client tab), `ClientStatusChip`, `PortalLinkCard`,
  `ClientStatusEditor`, `PortalVisibilityLists`, `PortalBrandingFields`,
  `StartPlanFromTemplate`; wiring in
  `src/modules/project-links/ui/screens/ProjectDetailScreen.tsx`.
- Shared: `src/components/views/ViewsPopover.tsx` (the proposal popover is a wrapper).
- Client-side writes: `projectsService.updateClientFacing`, `markClientUpdated`,
  `updateClientPortalSettings`, `updateLinkClientVisibility` in `src/services/database.ts`,
  wrapped by `src/modules/client-portal/infrastructure/client-portal.repository.ts`.

## Environment

- `NEXT_PUBLIC_BASE_URL` (optional) pins the origin used in portal links and
  emails; otherwise production resolves to `https://app.activeset.co`.
- `CLIENT_PORTAL_TOKEN_KEY` (optional) — 32 bytes as hex or base64
  (`openssl rand -hex 32`). When set, an existing portal link can be re-shown in
  the Client tab; when unset, links are show-once and Rotate is the way to get a
  copyable link again. Rotating the key makes existing links unreadable in the
  UI but does **not** invalidate them; rotate the links themselves for that.
- `PROPOSAL_VIEW_IP_SALT` is reused for the portal beacon's IP hash.
- `CLIENT_PORTAL_NOTIFY_EMAIL` (optional, falls back to `NOTIFY_EMAIL`) receives
  an email when a client replies; Slack goes to the usual `SLACK_BOT_TOKEN` /
  `SLACK_CHANNEL_ID`. Both are best-effort: a client pressing Send never sees an
  error because Gmail or Slack is unhappy.
- Firebase admin credentials are required: without them the portal page renders
  "temporarily unavailable" and the link routes return 503.

## Manual verification

1. `npm run arch:check` and `npm run test:client-portal`.
2. Sign in, open a project → Client tab → Enable, set a status and note, make two
   milestones and one link visible, Copy link.
3. Open the link in a private window and at phone width: light page, only the
   chosen milestones/links, no internal data. Refresh → the Client tab shows
   "Opened 1×" (agency previews are not counted).
4. Rotate → the old link shows "no longer active". Disable → same.
5. Signed out: `/api/project/<id>` still returns only its public fields;
   `/api/client-portal/<id>/link` without a bearer token → 401.

## Roadmap

Phase 2 (updates, replies, notifications) is built. Still open:

- Phase 3: a `clients` entity replacing the free-text `client` string, a Clients
  section in the rail, a company-level portal link listing every project, a
  weekly client digest, and retirement of the legacy `/share/project-links` page.
- Per-contact links, so the dashboard can say who opened the page rather than
  just how many times. The token record already carries a `label` for this.

## Notes for whoever works on this next

- The portal route imports its screen directly rather than through the module
  index, and has an eslint override saying so. The index also exports the
  internal Client tab, and Next ships anything a route's barrel pulls in to the
  browser — that put ~326KB of admin UI, including its wording, on the client's
  page. Keep the route's client references to the two components that genuinely
  need to be interactive.
- Visibility writes (`setMilestoneClientVisible`, `updateLinkClientVisibility`)
  are transactions on purpose. The read-modify-write versions lose updates when
  switches are flipped quickly, and the thing lost is a milestone or link the
  team believes they hid.
- `updateClientFacing` only stamps "last updated" when passed `{ touch: true }`.
  That stamp is the sole input to the stale-portal nudge, so tidying statuses
  from the project list must not clear it.
