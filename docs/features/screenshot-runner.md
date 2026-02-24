# Screenshot Runner (Local-First)

The Screenshot Runner helps you capture full-page screenshots for URLs that are not yet in the dashboard.

## Public Install (Hosted)

For users without repo access, install from npm:

```bash
npx @activeset/capture
```

Or install globally:

```bash
npm i -g @activeset/capture
activeset-capture
```

## Quick Start (Installer + Wizard)

### macOS / Linux

```bash
bash ./install-local-capture.sh
activeset-capture
```

### Windows PowerShell

```powershell
powershell -ExecutionPolicy Bypass -File .\install-local-capture.ps1
activeset-capture
```

The `activeset-capture` command opens an interactive wizard and handholds all required inputs.

## What It Does

- Accepts ad-hoc URL lists for new projects.
- Captures both desktop and mobile full-page screenshots.
- Runs a scroll-first warmup pass before capture for animated/lazy content.
- Saves results locally only (no server-side capture compute).

## CLI Command

```bash
npm run capture:local -- --project "New Client Project" --file ./new-client-project-urls.txt --out ./captures --devices desktop,mobile --warmup always
```

PowerShell:

```powershell
npm run capture:local -- --project "New Client Project" --file ".\\new-client-project-urls.txt" --out "./captures" --devices desktop,mobile --warmup always
```

## Input Methods

Use exactly one input source:

- `--urls "https://a.com,https://b.com"`
- `--file ./urls.txt`
- `stdin` piping:
  - macOS/Linux: `pbpaste | npm run capture:local -- --project "Run Name"`
  - PowerShell: `Get-Clipboard | npm run capture:local -- --project "Run Name"`

## Output Structure

```text
captures/<project-slug>-<timestamp>/
  manifest.json
  errors.json (only if partial/failed)
  desktop/*.webp
  mobile/*.webp
```

`manifest.json` includes:

- Run metadata (project, timestamps, machine info)
- Effective capture settings
- Per-URL status and device-level output paths

## CLI Options

- `--out <dir>` default: `./captures`
- `--concurrency <n>` default: `3`
- `--timeout-ms <n>` default: `45000`
- `--retries <n>` default: `1`
- `--devices desktop,mobile` default: both
- `--format webp|png` default: `webp`
- `--warmup always|off` default: `always`

## Notes

- Node.js 20+ is required.
- Public URLs only in this phase (no login automation).
- This flow is local-only and does not auto-sync to dashboard projects.
