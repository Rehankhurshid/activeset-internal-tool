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

Done once on GOLIATH (i5-12600KF, 32 GB, RTX 3070 Ti) on 2026-09-22. Four
things bit, and they are all recorded here because none is obvious.

**1. Remote access.** Enable OpenSSH and trust a key:

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
```

Two traps. For an **administrator account** Windows OpenSSH ignores
`~/.ssh/authorized_keys` entirely and reads
`C:\ProgramData\ssh\administrators_authorized_keys`, which must be owned by
Administrators and SYSTEM with inheritance removed. And **never append with
`Add-Content` alone** — if the file does not end in a newline the new key
lands on the end of the previous one and silently breaks both. That happened
here and cost a diagnosis.

**2. The firewall.** `Add-WindowsCapability` creates an inbound rule for the
**Private** profile only. An office ethernet classified **Public** leaves
`sshd` listening on `0.0.0.0:22` with every packet dropped, which looks
exactly like a broken key:

```powershell
Set-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -Enabled True -Profile Any
```

**3. Tools.** `winget install` works fine over SSH:

```powershell
winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements
winget install --id Ollama.Ollama -e --silent --accept-package-agreements --accept-source-agreements
winget install --id NSSM.NSSM -e --silent --accept-package-agreements --accept-source-agreements
git clone https://github.com/Rehankhurshid/activeset-internal-tool.git C:\activeset\activeset-internal-tool
```

Copy `.env.vercel-production` across with `scp` rather than running
`vercel env pull` there — it needs a browser login the machine cannot do.

**4. Ollama must be a service, and the CLI cannot pull.** Anything started
over SSH dies when the session closes, so `ollama serve` will not stay up.
Worse, the Windows `ollama` CLI tries to launch the *desktop app*, which
cannot initialise a UI without a logged-in session and fails with "Unable to
init instance". So run the server as a service and pull through its API:

```powershell
nssm install OllamaServe "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" serve
nssm set OllamaServe AppEnvironmentExtra "OLLAMA_MODELS=C:\activeset\ollama-models" "OLLAMA_KEEP_ALIVE=15m"
nssm set OllamaServe Start SERVICE_AUTO_START
nssm start OllamaServe

Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/pull' -Method Post -TimeoutSec 3600 `
  -ContentType 'application/json' -Body (@{ model = 'qwen2.5vl:7b'; stream = $false } | ConvertTo-Json)
```

`OLLAMA_MODELS` points outside the user profile so it does not matter which
account runs the service. The 5.6 GB pull took about three minutes.

**The worker service**, with NSSM rather than Task Scheduler because the
`restart` and `update` commands exit the process and depend on being brought
straight back:

```powershell
nssm install ActiveSetWorker "C:\Program Files\nodejs\npm.cmd" "run worker run"
nssm set ActiveSetWorker AppDirectory C:\activeset\activeset-internal-tool
nssm set ActiveSetWorker AppEnvironmentExtra "WORKER_EMIT_DIR=C:\activeset\optimised-images" "NO_COLOR=1"
nssm set ActiveSetWorker AppExit Default Restart
nssm set ActiveSetWorker DependOnService OllamaServe
nssm set ActiveSetWorker Start SERVICE_AUTO_START
nssm start ActiveSetWorker
```

Then `npm run worker doctor` should end in "Ready.", and
`powercfg /change standby-timeout-ac 0` keeps the machine awake.

### On model size

`doctor` picks the model from the VRAM it finds. **8 GB fits the 7B model and
not the 32B one** — the 3070 Ti sits at about 7.0 GB of 8 GB with
`qwen2.5vl:7b` loaded, which leaves enough for Chrome. Only reach for
`qwen2.5vl:32b` on a card with 20 GB or more.

## What it does

| Job | What happens |
|---|---|
| `alt_text` | Reads the project's open alt-text findings, re-fetches those pages for context, classifies every image and drafts its alt. Results go to `alt_suggestions` and fill the boxes on the Alt text tab. See [alt-text.md](alt-text.md). |
| `image_budget` | Opens each page in Chrome at 1440, 768 and 390 px, measures how wide every image is actually drawn, fetches each file, and works out what it should weigh. Results go to `image_budget` and drive the Weight tab. |
| `webflow_alt` | Drafts alt text for a site's whole Webflow library — assets and CMS collections — rather than for scanned pages. Feeds the same `alt_suggestions` store, so a draft shows up on both the Webflow tab and the Audit tab. Skips PDFs, videos and anything else that is not an image. |
| `alt_apply` | Writes chosen drafts back to Webflow in bulk, and optionally publishes. Two destinations: a site asset takes its alt through the Assets API, a CMS image through its collection item's field. On Canopy eleven of eleven were CMS, so the asset path alone would have applied nothing. |

They are queued from the Audit tab — the Alt text tab's "Draft on `<machine>`"
button, the Weight tab's "Measure sizes" — and from the Webflow tab's Image
Assets screen, which drafts the library. Or by hand:

```bash
npm run worker enqueue image_budget <projectId> --emit ./optimised-images
```

The app shows which workers are online, live progress while a job runs, and
the error if one fails.

## Controlling it from the app

Nobody needs a key, a VPN, or shell on the machine. The Audit tab's Weight
panel lists every worker with its hardware, its model and what it is doing,
and offers:

| Control | Shape | Effect |
|---|---|---|
| Pause / Resume | setting | Stops claiming new work; a running job finishes. Applies on the next poll. |
| Model | setting | Switches the vision model for alt text, from a fixed list. |
| Restart | action | Exits cleanly so the service manager starts it again. |
| Update | action | `git pull --ff-only`, `npm install`, restart. Refuses a dirty checkout. |
| Run checks | action | Re-runs `doctor` and posts the report back into the panel. |
| Clear cache | action | Forgets every cached alt-text judgement. |

Settings and actions are deliberately different shapes. Pausing is a **state
the machine converges on**, so pressing it twice is the same as pressing it
once and there is no queue to drain. Restarting is an **event**, so it is a
command with a result you can read afterwards. Control is handled before work
on each cycle, so a pause does not wait behind a twenty-minute scan.

### Why it is not remote access

The machine holds `FIREBASE_SERVICE_ACCOUNT_JSON` — full admin on every
client project. Shell on it is database admin, so "the team can control the
worker" must not quietly become "the team can run things on the worker".

So there is no command string anywhere in this path. Firestore carries an
**action from a closed union**, the worker dispatches it through a `switch`,
and an action it does not recognise is rejected and recorded rather than
attempted. The model is likewise a fixed list, because that value reaches
Ollama and free text there would mean "fetch and run any weights you like".
Both lists live in
[`worker-control.ts`](../../src/modules/site-monitoring/domain/worker-control.ts),
validated in the app so a refusal can be explained and again on the worker
because the app is not the only thing that can write to Firestore.

The worker's own document is admin-only. Everything the team can change sits
in subcollections beneath it, so the panel always shows the machine's report
rather than somebody's wishes reflected back.

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
| `workers/{id}/control/desired` | the team, from the app | the worker, every poll |
| `workers/{id}/commands` | the team creates; the worker reports the result | both |
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
5. `npm run test:site-monitoring` covers the closed lists — that no command
   string, unknown action or arbitrary model gets through.
6. Pause it from the panel and watch the log say `paused from the app`, then
   press Run checks and watch the report appear in the panel.

## Moving more work here later

The queue is generic — `kind`, `projectId`, `payload` — precisely so page
scans, screenshots and link checks can move over without rework. They are
currently split across Vercel functions with a five-minute ceiling and a
self-retriggering batch loop to work around it; on this machine they would
just run. That is a separate piece of work, not a side effect of this one.
