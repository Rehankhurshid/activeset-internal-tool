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

## Currently listed

| Tool | Kind | Source |
|---|---|---|
| Screenshot Runner | in-app | `src/modules/screenshot-runner/` |
| Refrens → Skydo Invoice Bridge | extension | `extensions/refrens-skydo-bridge/` |
| Webflow Settings Auditor | extension | `chrome-extension/` |
| Webflow Team Tracker | extension | `webflow-team-tracker-1.0.6/` |

The two Webflow extensions still sit in ad-hoc folders at the repo root. Moving them
under `extensions/` would tidy that up, but it breaks "Load unpacked" for anyone who
already pointed Chrome at the old path, so it is left as a deliberate follow-up.
