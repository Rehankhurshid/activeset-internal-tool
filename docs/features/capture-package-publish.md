# Publishing `@activeset/capture`

## Package Location

- `/Users/nayyarkhurshid/Desktop/Widget Folders/project-links-widget/packages/activeset-capture`

## Local Validation

```bash
cd "/Users/nayyarkhurshid/Desktop/Widget Folders/project-links-widget"
npm --prefix packages/activeset-capture run build
node packages/activeset-capture/dist/bin/activeset-capture.js --help
node packages/activeset-capture/dist/bin/capture-local.js --help
```

## Publish via GitHub Actions

1. Add repo secret `NPM_TOKEN` (npm automation token with publish permissions).
2. Create and push a tag:

```bash
git tag capture-v0.1.0
git push origin capture-v0.1.0
```

3. Workflow used:
- `.github/workflows/publish-activeset-capture.yml`

It will:
- install package deps
- build `packages/activeset-capture`
- publish `@activeset/capture` to npm

## End-User Install

```bash
npx @activeset/capture
```

or

```bash
npm i -g @activeset/capture
activeset-capture
```
