# Internal Tools

**Route:** `/modules/internal-tools`
**Module:** [`src/modules/internal-tools/`](../../src/modules/internal-tools/)

One page listing everything the team has built for itself, with setup steps beside each
tool. It exists because the extensions had no home: they lived in unrelated folders at
the repo root and the only way to install one was to be told about it.

## Adding a tool

The page is driven by a catalogue, not by JSX — [`data/tools.ts`](../../src/modules/internal-tools/data/tools.ts).

**In-app module:** add a `Tool` with `kind: 'module'` and an `href`.

**Chrome extension:**

1. Add the folder path to `EXTENSIONS` in [`scripts/pack-extension.mjs`](../../scripts/pack-extension.mjs).
2. Run `npm run extension:pack:all`. Zips land in `public/downloads/`, named from the
   manifest's `name` and `version`.
3. Add a `Tool` with `kind: 'extension'` and a `download` path matching that filename.
4. Commit the zip.

Re-run the pack script and update `version` in the catalogue whenever an extension's
manifest version changes — unpacked extensions do not auto-update, so the version in the
filename is the only signal a colleague has that theirs is stale.

## Why the zips are committed

`public/` is served directly, so `app.activeset.co/downloads/<name>-<version>.zip` is a
link that can be handed to anyone with app access — no Chrome Web Store listing, no
separate hosting. They are small (16–40 KB) and there was already precedent in the repo
(`webflow-team-tracker-1.0.6.zip` at the root).

The alternative — publishing to the Chrome Web Store — is worth revisiting if these
spread beyond the team, since it would bring real auto-updates. It costs a one-off
developer-account fee and a review per version.

## Access control and extension pairing

Tools that name `requiresModule` are hidden from anyone without that module — hidden, not
shown-and-locked, since a locked card just invites requests for access someone may not
need. The Refrens → Skydo bridge requires `invoices`, granted in **Settings → Team Access**.

The bridge needs Refrens data, but the Refrens account authenticates with an **ES256
signing key that can mint tokens for the whole account** (including creating and
cancelling invoices). That key stays in `app_secrets/refrens`, server-side, and is never
sent to a browser. Instead:

1. The page detects the extension by messaging its **pinned id** (`lndfjmgghbhchfhffhniencmffdpmnfp`,
   fixed by the `key` field in its manifest — an unpacked install would otherwise get a
   different id per machine) over `externally_connectable`.
2. **Pair with this browser** calls `POST /api/extension/pair`, which checks the caller's
   module access and mints an opaque per-person token. Only its SHA-256 is stored, in
   `extension_tokens`.
3. The page pushes that token into the extension. The extension can never pull one out —
   `STATUS` is not reachable from a web page, only `PING`, `PAIR` and `UNPAIR`, and only
   from allowlisted origins.
4. The extension calls `/api/extension/refrens/invoices*`, which re-checks module access
   **on every request** and forwards an allowlisted, read-only subset of the Feathers
   query with the server's credentials.

So revoking someone in Team Access cuts their extension off immediately, with no key to
rotate. Adding a person is granting them a module, not handing out a secret.

`ALLOWED_QUERY_KEYS` in `RefrensService.ts` is the contract for what the extension may
ask for — a future extension version cannot widen its own reach by adding a parameter.

## Currently listed

| Tool | Kind | Source |
|---|---|---|
| Screenshot Runner | in-app | `src/modules/screenshot-runner/` |
| Refrens → Skydo Invoice Bridge | extension (requires `invoices`) | `extensions/refrens-skydo-bridge/` |
| Webflow Settings Auditor | extension | `chrome-extension/` |
| Webflow Team Tracker | extension | `webflow-team-tracker-1.0.6/` |

The two Webflow extensions still sit in ad-hoc folders at the repo root. Moving them
under `extensions/` would tidy that up, but it breaks "Load unpacked" for anyone who
already pointed Chrome at the old path, so it is left as a deliberate follow-up.
