# @activeset/capture

Local-first responsive screenshot capture for ad-hoc URLs.

- Desktop: `1280x800`
- Mobile: `375x812` (mobile UA)
- Scroll warmup enabled by default to trigger lazy/animated content
- Output is local files only

## Quick Start

```bash
npx @activeset/capture
```

That opens the interactive wizard.

## One-Shot Run

Use `run` when you already have a URL file or want to skip the wizard:

```bash
npx @activeset/capture run --project "My Project" --file ./urls.txt
```

You can also pass URLs directly:

```bash
npx @activeset/capture run --project "My Project" --urls "https://a.com,https://b.com"
```

## Global Install

```bash
npm i -g @activeset/capture
activeset-capture
```

Available commands after a global install:

```bash
activeset-capture
activeset-capture wizard
activeset-capture run --project "My Project" --file ./urls.txt
activeset-capture-local --project "My Project" --file ./urls.txt
```

Controls:
- Up/Down arrows: move
- Space: toggle (multi-select)
- Enter: confirm

## Output

- `captures/<project-slug>-<timestamp>/manifest.json`
- `captures/<project-slug>-<timestamp>/desktop/*.webp|png`
- `captures/<project-slug>-<timestamp>/mobile/*.webp|png`
- `captures/<project-slug>-<timestamp>/errors.json` (when partial/failed)
