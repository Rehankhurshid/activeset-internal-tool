# @activeset/capture

Local-first responsive screenshot capture for ad-hoc URLs.

- Desktop: `1280x800`
- Mobile: `375x812` (mobile UA)
- Scroll warmup enabled by default to trigger lazy/animated content
- Output is local files only

## Install

```bash
npx @activeset/capture
```

Or global:

```bash
npm i -g @activeset/capture
activeset-capture
```

## Interactive Wizard

```bash
activeset-capture
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
