---
module: payments
title: Payments (incoming client money from Fold)
keywords: [payments, incoming payments, fold, fold.money, fold mcp, bank, credits, axis, skydo, payoneer, paypal, payer, payer rules, tds, money received, salman, finance, incoming_payments, payment_payers, app_secrets/fold, fold-sync]
entry_points: [/modules/payments, /modules/project-links/[id]?tab=invoices, /api/payments, /api/cron/fold-sync]
code_roots: [src/modules/payments, src/app/api/payments, src/app/api/cron/fold-sync, src/app/modules/payments]
last_verified: 2026-10-07 @ uncommitted
---
# Payments

> Credits on the business bank account, read from **Fold** (fold.money) through its remote MCP server at 10:00 and 18:00 IST, stored in `incoming_payments`, and tied to a client project. Remembered payers are assigned automatically; other credits get a suggestion (from the payer's name or the amount against open invoices) that an admin confirms. New credits are emailed to the people set on the page (Salman and Rehan by default). **Admins only** (`rehan@`, `salman@`, or the `admin` claim), at every layer.

## Where to find things (quick lookup)

| I want to… | Go to |
|---|---|
| Change how a payer is read from a bank line, or how a project is suggested | [payments.matching.ts](../../src/modules/payments/domain/payments.matching.ts) (`parsePayer`, `namesMatch`, `amountFit`, `matchPayment`); tests in [payments.matching.test.ts](../../src/modules/payments/domain/payments.matching.test.ts) |
| Add a payout service that pays for many clients (never remembered) | `VIA_PATTERNS` / `VIA_LABELS` in [payments.matching.ts](../../src/modules/payments/domain/payments.matching.ts), `PaymentVia` in [payments.types.ts](../../src/modules/payments/domain/payments.types.ts) |
| Change the Fold OAuth flow, token refresh or which Fold tools may be called | [fold.client.ts](../../src/modules/payments/infrastructure/fold.client.ts) (`startFoldConnect`, `completeFoldConnect`, `getAccessToken`, `READ_ONLY_TOOLS`) |
| Change what a sync reads, the backfill window or the email | [payments.sync.ts](../../src/modules/payments/infrastructure/payments.sync.ts); email `sendIncomingPaymentsEmail` in [NotificationService.ts](../../src/services/NotificationService.ts) |
| Change the Payments page | [PaymentsScreen.tsx](../../src/modules/payments/ui/screens/PaymentsScreen.tsx), [FoldConnectionCard.tsx](../../src/modules/payments/ui/components/FoldConnectionCard.tsx), [AssignPaymentDialog.tsx](../../src/modules/payments/ui/components/AssignPaymentDialog.tsx) |
| Change the card on a project's Invoices tab | [ProjectPaymentsCard.tsx](../../src/modules/payments/ui/components/ProjectPaymentsCard.tsx), mounted in [ProjectDetailScreen.tsx](../../src/modules/project-links/ui/screens/ProjectDetailScreen.tsx) |

## User-facing pages

| URL | File | What it shows | Access |
|---|---|---|---|
| `/modules/payments` | [page.tsx](../../src/app/modules/payments/page.tsx) → `PaymentsScreen` | Fold connection (connect, reconnect, disconnect, Sync now), which accounts to read, minimum amount, who gets the email; "Received this month"; the list with To assign / Assigned / Ignored / All, Confirm a suggestion, Assign (project + optional invoice + remember payer), Ignore, move back | `isAdmin` on the client; every API is `requireAdmin`. Nav item `access: 'admin'` (hidden for everyone else), chord `g m` |
| `?tab=invoices` on a project | `ProjectPaymentsCard` above `InvoicesTab` | Payments assigned to this project and their INR total | The Invoices tab only renders for admins; the API is `requireAdmin` |

## API routes

| Method | Path | File | Auth | Purpose |
|---|---|---|---|---|
| GET | `/api/payments` | [route.ts](../../src/app/api/payments/route.ts) | Admin | `{payments (latest 500), projects (id/name/client), invoices (lean, all statuses)}` |
| GET | `/api/payments?projectId=` | same | Admin | `{payments}` assigned to that project |
| PATCH | `/api/payments/[id]` | [[id]/route.ts](../../src/app/api/payments/[id]/route.ts) | Admin | `assign` (projectId, invoiceId?, rememberPayer?), `ignore`, `unassign`. Remembering also assigns the payer's other unassigned rows; never for a `via` payer |
| POST | `/api/payments/sync` | [sync/route.ts](../../src/app/api/payments/sync/route.ts) | Admin | Sync now; same as the cron |
| GET, PATCH, DELETE | `/api/payments/fold` | [fold/route.ts](../../src/app/api/payments/fold/route.ts) | Admin | Status (never tokens) / save `selectedAccountIds`, `minAmount`, `notifyEmails` / revoke and forget the grant |
| POST | `/api/payments/fold/connect` | [connect/route.ts](../../src/app/api/payments/fold/connect/route.ts) | Admin | Registers an OAuth client for `${NEXT_PUBLIC_BASE_URL}/api/payments/fold/callback`, returns `{authorizeUrl}` |
| GET | `/api/payments/fold/callback` | [callback/route.ts](../../src/app/api/payments/fold/callback/route.ts) | `state` (see Gotchas) | Exchanges the code, stores tokens, lists accounts, redirects to `/modules/payments?fold=connected` or `?fold=error&reason=` |
| GET, POST | `/api/cron/fold-sync` | [route.ts](../../src/app/api/cron/fold-sync/route.ts) | Cron secret | Skips unless connected; else `syncIncomingPayments()` |

## Code map

- [domain/payments.types.ts](../../src/modules/payments/domain/payments.types.ts): `IncomingPayment`, `PaymentStatus`, `PaymentVia`, `PaymentSuggestion`, `PayerRule`, `FoldAccountSummary`, `FoldConnectionStatus`, `FoldSyncSummary`, `DEFAULT_MIN_AMOUNT` (₹1,000).
- [domain/payments.matching.ts](../../src/modules/payments/domain/payments.matching.ts): pure, tested.
- [infrastructure/fold.client.ts](../../src/modules/payments/infrastructure/fold.client.ts) (server-only): OAuth, token lease, `FoldSession` (JSON-RPC over streamable HTTP), `fetchFoldAccounts`, `fetchFoldCredits`, settings and status on `app_secrets/fold`.
- [infrastructure/payments.repository.ts](../../src/modules/payments/infrastructure/payments.repository.ts) (server-only): `incoming_payments`, `payment_payers`, lean project and invoice reads (invoices via `listAllInvoices`).
- [infrastructure/payments.sync.ts](../../src/modules/payments/infrastructure/payments.sync.ts) (server-only): `syncIncomingPayments`.
- [infrastructure/route-errors.ts](../../src/modules/payments/infrastructure/route-errors.ts): shared error → response (409 + `needsReconnect` when Fold must be reconnected).
- [index.ts](../../src/modules/payments/index.ts): UI and pure domain only. Routes import `infrastructure/*` directly. The module is in the `lint:architecture` boundary list.

## Data model

**`incoming_payments/{foldTransactionId}`** (server-only, default deny). Fields as `IncomingPayment`: `accountId`, `accountLabel`, `date` (bank time), `amount`, `currency`, `narration`, `merchantName`, `payerKey`, `payerName`, `via`, `channel`, `foldCategory`, `status` (`unassigned | assigned | ignored`), `projectId`, `invoiceId` (a `project_invoices` id, informational only), `autoAssigned`, `suggestion {projectId, invoiceId, reason, confidence}`, `assignedBy` (`'payer rule'` when automatic), `assignedAt`, `firstSeenAt`, `updatedAt`. Created once by the sync and never overwritten by it.

**`payment_payers/{payerKey}`** (server-only): `{payerName, projectId, createdBy, createdAt}`. Written when someone assigns with "Remember". To forget a payer, delete the doc (no UI yet).

**`app_secrets/fold`** (server-only): `clientId`, `redirectUri`, `refreshToken`, `accessToken`, `accessTokenExpiresAt`, `refreshLockUntil`, `needsReconnect`, `lastError`, `connectedBy`, `connectedAt`, `accounts[]` (bank, masked number, holder, type; **no balances**), `selectedAccountIds`, `minAmount`, `notifyEmails`, `lastSync`, `lastSuccessfulSyncAt`. **`app_secrets/fold_pending`**: the one in-flight connect (`state`, PKCE `verifier`, `clientId`, `redirectUri`, `createdBy`, `expiresAt` +15 min).

No composite indexes: lists sort in memory (a few dozen rows a month).

## Background jobs

| Schedule (UTC) | Path | What |
|---|---|---|
| `30 4,12 * * *` (10:00 and 18:00 IST) | `/api/cron/fold-sync` | Refresh the account list; read credits on ticked accounts since `lastSuccessfulSyncAt − 7 days` (first run: 60 days); drop `< minAmount` and split children; store unseen ones with auto-assign or a suggestion; email them (not on a backfill) |

## Configuration

No env vars of its own. Uses `NEXT_PUBLIC_BASE_URL` (OAuth redirect URI and email links, via `getBaseUrl()`), `CRON_SECRET`, and `GMAIL_USER` / `GMAIL_APP_PASSWORD` for the email. Recipients come from the page (`notifyEmails`), **not** `NOTIFY_EMAIL`, because amounts are private.

## External services

**Fold MCP** `https://mcp.fold.money/mcp` (server `fold-mcp`, seen at v0.1.50). OAuth metadata at `/.well-known/oauth-authorization-server`: dynamic registration at `/oauth/register`, PKCE S256, public client (`token_endpoint_auth_method: none`), scopes `mcp:read offline_access`, `resource=https://mcp.fold.money`. Stateless (no `mcp-session-id`); responses are SSE. Tools used: `list_bank_accounts`, `list_transactions` (`type: credit`, `start_date`, `account_ids`, `limit ≤ 100`, cursor paging).

## Key flows

1. **Connect:** an admin presses Connect Fold → `POST /fold/connect` registers a client and stores `fold_pending` → browser goes to Fold → Fold redirects to `/fold/callback` → tokens saved, accounts listed → back on the page, the admin ticks the business account and saves → Sync now (the first sync is a 60-day backfill and sends no email).
2. **Twice a day:** the cron syncs. A credit from a remembered payer is assigned straight away (and linked to an open invoice the amount fits). Otherwise the payer's name is compared with each project's `client`, `name` and invoice `billedToName`. If exactly one project matches, it is suggested. If none does, an amount that fits exactly one open INR invoice (exact, or 89–100% for TDS) is suggested.
3. **Review:** Salman confirms a suggestion (which remembers the payer unless it is a payout service), or assigns or ignores the credit by hand.

## Gotchas and invariants

- **Fold refresh tokens rotate, and reuse kills the grant.** Presenting an already-used refresh token returns `invalid_grant` *and* revokes the newest one. This was verified on 2026-10-07. So `getAccessToken` takes a Firestore lease (`refreshLockUntil`, 30 s) before refreshing and writes the new refresh token before using the access token. Never refresh outside it. If a refresh succeeds at Fold but the Firestore write fails, the grant is lost and someone must reconnect. `needsReconnect` then pauses the cron and the page shows a red banner.
- **The grant can write.** Despite `mcp:read`, Fold exposes `create_transaction`, `update_transaction`, `delete_transaction`, `split_transaction`, `merge_split` and `add_transactions_to_group` to this token. `FoldSession.callTool` refuses anything outside `READ_ONLY_TOOLS`. Keep it that way.
- **Fold sees personal accounts too.** Rehan's SBI and Federal Bank accounts are in the same Fold login. Only ticked accounts are queried (`account_ids`) *and* filtered again after the response. Ticking a new account resets `lastSuccessfulSyncAt` so it gets the backfill.
- **Skydo and similar payout services** name themselves, not the client (`IMPS/P2A/…/SKYDOTEC/…`). They get `via`, `payerKey = via`, and are never remembered or name-matched. Foreign-currency invoices are never amount-matched (no FX).
- **Fold's own categories are unreliable for this.** A Skydo client payout was marked "Self Transfer" (excluded from cash flow). So nothing is filtered on category or `excluded_from_cash_flow`, only on `minAmount`. Refunds and interest above the minimum show up and are ignored by hand.
- **The callback has no Firebase auth** (it is a browser redirect). It is bound to the admin who started it by the 24-byte `state` in `fold_pending`, which is single-use and lasts 15 minutes, plus PKCE.
- Linking a payment to an invoice does **not** change the invoice's status. Refrens stays the source of truth (see tools-and-extensions).
- Fold refreshes bank data roughly daily, so more than two syncs a day buys nothing.

## Tests

- `npm run test:domain` includes [payments.matching.test.ts](../../src/modules/payments/domain/payments.matching.test.ts) (17 cases: narration parsing, truncated names, TDS fits, auto vs suggest vs none, Skydo never remembered).
- [tests/firestore.rules.test.ts](../../tests/firestore.rules.test.ts) asserts `incoming_payments`, `payment_payers` and `app_secrets` deny admin reads and writes from the client (`npm run test:rules`, needs Java).

## Related docs

- [tools-and-extensions.md](./tools-and-extensions.md): Invoices / Refrens, which owns `project_invoices` and the Invoices tab this card sits on.
- [project-links.md](./project-links.md): the project detail tab table.
- [platform.md](./platform.md): admins, cron table, rules.
