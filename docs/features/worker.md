# The worker machine

Some of this app's work is the wrong shape for a serverless function. Running
a vision model over four hundred images, or opening every page of a site in a
real browser at three screen widths, is minutes of CPU and gigabytes of RAM —
a background job, not a request.

So it runs on a PC that is already on.

```
Audit tab  ──queue──▶  worker_jobs  ◀──poll──  the PC
                            │                    ├─ Ollama       (alt text)
                            │                    ├─ Chrome       (measuring)
                            ▼                    └─ sharp        (resizing)
                     results land back in the project
```

The PC polls for work. Nothing ever calls *in*, so it needs no public address,
no port forwarding, no tunnel and no dynamic DNS — it works behind any router.
If the machine is off, jobs sit in the queue until it comes back.

## Setting it up on Windows

Once, on the PC:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install Ollama.Ollama
git clone https://github.com/Rehankhurshid/activeset-internal-tool.git
cd activeset-internal-tool
npm install
npx vercel env pull .env.local      # Firebase admin credentials
npm run worker doctor
```

`doctor` reports the hardware, finds Ollama and Chrome, checks the
credentials, and recommends a model for the GPU it finds:

```
Worker machine
  Windows_NT 10.0.26100
  AMD Ryzen 9 7900X · 24 cores · 64 GB RAM
  NVIDIA GeForce RTX 4090 · 24 GB VRAM

Vision model
  configured  qwen2.5vl:7b
  recommended qwen2.5vl:32b — 24 GB of VRAM fits the 32B model, which is
                              markedly better at reading text in images
```

Pull whatever it recommends, then point the worker at it:

```powershell
ollama pull qwen2.5vl:32b
setx OLLAMA_ALT_MODEL qwen2.5vl:32b
setx WORKER_EMIT_DIR C:\activeset\optimised-images
npm run worker run
```

On a 24 GB card the 32B model answers in **two to four seconds an image**
against twelve to nineteen on an M1 Pro's CPU, and it is materially better at
the thing that matters most on marketing sites — reading text inside an image.

### Keeping it running

`npm run worker run` in a terminal is fine to start with. To survive a reboot,
either works:

**Task Scheduler**, "at system startup", running `npm run worker run` in the
repo folder. Simplest, no extra software.

**NSSM**, if you want a real Windows service with automatic restarts:

```powershell
winget install NSSM.NSSM
nssm install ActiveSetWorker "C:\Program Files\nodejs\npm.cmd" "run worker run"
nssm set ActiveSetWorker AppDirectory C:\activeset\activeset-internal-tool
nssm start ActiveSetWorker
```

Either way the machine must not sleep: `powercfg /change standby-timeout-ac 0`.

## What it does

| Job | What happens |
|---|---|
| `alt_text` | Reads the project's open alt-text findings, re-fetches those pages for context, classifies every image and drafts its alt. Results go to `alt_suggestions` and fill the boxes on the Alt text tab. See [alt-text.md](alt-text.md). |
| `image_budget` | Opens each page in Chrome at 1440, 768 and 390 px, measures how wide every image is actually drawn, fetches each file, and works out what it should weigh. Results go to `image_budget` and drive the Weight tab. |

Both are queued from the Audit tab — the Alt text tab's "Draft on `<machine>`"
button and the Weight tab's "Measure sizes" — or by hand:

```bash
npm run worker enqueue image_budget <projectId> --emit ./optimised-images
```

The app shows which workers are online, live progress while a job runs, and
the error if one fails.

## The 2× rule

An image should be **twice the width it is ever displayed at**. Twice, so it
is sharp on a retina screen; no more than twice, because past that the pixels
are invisible and the bytes are not.

The number that matters is therefore the *displayed* width, and that is not in
the HTML. `width="1200"` is frequently absent, frequently a lie, and says
nothing about what CSS does to the element. Only a browser laying the page out
knows an image sits in a 612px column. So the worker drives a real one.

Measured on activeset.co, first run: **52 images, 34 oversized, 1.9 MB of
2.6 MB recoverable.** The worst was a 3494px, 1 MB JPEG displayed at 200px.

Three details that are easy to get wrong and are handled:

- **The widest slot wins.** A card image is 176px on a phone and 612px on a
  desktop; one file has to satisfy both, so the target comes from the widest.
- **Layout width, not painted width.** `getBoundingClientRect()` reports the
  transformed box, so a carousel resting its slides at `scale(0.8)` would
  measure 20% small and we would resize the asset to something blurry. The
  larger of the rect and `offsetWidth` is used. Under-measuring ships a soft
  image to a client's live site; over-measuring wastes a few kilobytes.
- **Too small is also a finding.** An image below 0.9× its target is soft on
  every modern screen, and no amount of compression fixes it — it needs a
  better original. That is reported separately from oversized, because the
  action is different.

Also recorded: whether the markup offers a `srcset`. Without one, every
visitor downloads that exact file, so an oversized asset is a bill a phone
pays on mobile data. With one, Webflow serves a variant and the oversized
original mostly costs storage. Same finding, different urgency, and the Weight
tab says which.

## What it will not do

**It does not change anything on a client's live site.** Webflow's Assets API
can create an asset and edit its metadata, but it cannot replace the bytes of
an existing one, and an image placed in Designer cannot be repointed through
the API at all. Anyone claiming otherwise has not tried it.

So the worker resizes the files and writes them to `WORKER_EMIT_DIR`, named
`<original>@<width>w.webp`, next to a report saying exactly which is which.
Replacing them is a drag into Designer. The report's "Copy list" button gives
you the whole job as text.

Formats: AVIF stays AVIF, PNG stays PNG, everything else becomes WebP at
quality 82. The saving shown is then **measured**, not the area estimate the
app shows before a file has been encoded.

## Collections

| Collection | Written by | Read by |
|---|---|---|
| `worker_jobs` | the app queues, the worker claims and completes | both |
| `workers` | the worker, every poll | the app, to show who is online |
| `projects/{id}/image_budget` | the worker | the Weight tab |
| `projects/{id}/alt_suggestions` | the worker | the Alt text tab |

A worker silent for 90 seconds shows as offline. A job whose worker dies
mid-run is reclaimed after five minutes, so a reboot loses nothing.

## Verification

1. `npm run worker doctor` on the PC ends in "Ready."
2. `npm run test:image-budget` covers the 2× arithmetic, both failure
   directions and the roll-up — no browser needed.
3. Queue a measurement from the Weight tab and watch the progress line move.
   It names the machine doing the work.
4. Check one number by hand: open the page, inspect an image the report calls
   oversized, and confirm its rendered width in DevTools matches.

## Moving more work here later

The queue is generic — `kind`, `projectId`, `payload` — precisely so page
scans, screenshots and link checks can move over without rework. They are
currently split across Vercel functions with a five-minute ceiling and a
self-retriggering batch loop to work around it; on this machine they would
just run. That is a separate piece of work, not a side effect of this one.
