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
nssm set OllamaServe AppEnvironmentExtra "OLLAMA_MODELS=C:\activeset\ollama-models"
nssm set OllamaServe Start SERVICE_AUTO_START
nssm start OllamaServe

Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/pull' -Method Post -TimeoutSec 3600 `
  -ContentType 'application/json' -Body (@{ model = 'qwen2.5vl:7b'; stream = $false } | ConvertTo-Json)
```

`OLLAMA_MODELS` points outside the user profile so it does not matter which
account runs the service. The 5.6 GB pull took about three minutes.

Note there is deliberately no `OLLAMA_KEEP_ALIVE` here. It would be ignored:
this app sends `keep_alive` in every request body, and the API parameter beats
the server's environment. Set it on the *worker* service instead — see
[Two ways to use the machine](#two-ways-to-use-the-machine).

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

## Two ways to use the machine

Goliath is a resource most of the time and a desktop some of the time. Its
**default state is "ready"**: nothing needs opening, unlocking or logging into.
Both halves are Windows services set to start on boot, the worker polls
Firestore every ten seconds whether or not anyone is signed in, and Chrome
launches headless. Powered on and on the network is the whole requirement.

The thing that makes it unusable *as a desktop* while the worker is around is
**not CPU — it is VRAM**: the vision model holds about 7 GB of the 8 GB card,
and since driver 536.40 an over-subscribed card silently spills into system
RAM rather than erroring, so the symptom is stutter rather than a clean
failure. Pausing the worker does **not** give the card back; pause stops it
claiming jobs and the model stays resident until `keep_alive` expires.

So the two modes are handled by one button rather than by a setting that has
to be right for both:

**Sitting down at it: press "Free the GPU" in the worker panel.** It asks
Ollama to unload whatever `/api/ps` reports as loaded, by requesting it with
`keep_alive: 0`. A second or two, no restart, and the next job reloads the
model by itself. It works while the worker is paused, because commands are
claimed before the paused check, and `doctor` reports what is resident so you
can check from your phone first.

**Leaving it as a resource: nothing.** Because the button exists, the model
can stay warm for a long time without costing anything — a *short* keep-alive
would only make the machine pay a reload between every pair of jobs more than
a couple of minutes apart. It is set to an hour: warm through a working
session, cold overnight.

```powershell
nssm set ActiveSetWorker AppEnvironmentExtra +OLLAMA_KEEP_ALIVE=1h
nssm restart ActiveSetWorker
```

This goes on the **worker** service, not `OllamaServe`: the app sends
`keep_alive` in every request body, and the API parameter beats the server's
environment. The `+` prefix matters too — `AppEnvironmentExtra` is a single
`REG_MULTI_SZ`, so the unprefixed form **replaces the whole block** and would
drop `WORKER_EMIT_DIR`. `+KEY=VALUE` upserts one pair; `-KEY` removes one.
Keep it to one prefixed pair per call.

### Settings that suit both modes

**`AppPriority BELOW_NORMAL_PRIORITY_CLASS`** on the worker. Priority only
matters under contention: with nothing else running, Windows gives the process
all the CPU regardless, so this costs a dedicated box nothing — and when
someone does sit down, `npm` → `node` → headless Chrome all inherit it and
yield. It matters most for `image_budget`, the heaviest job on the box.

**High performance power plan.** Balanced parks cores and powers down PCIe
links between bursts, which is exactly the wrong shape for a machine whose
work arrives as sustained batches. `powercfg /setactive
8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c`; on Windows 11 installs that hide the
plan, `powercfg -duplicatescheme` with the same GUID brings it back.

**Windows Update active hours 08:00–02:00.** Automatic restarts then land
between two and eight in the morning. A restart mid-job is survivable — the
job is reclaimed after five minutes without a heartbeat and both services
auto-start — but there is no reason to pay for a re-run in the middle of a
batch. Sleep and hibernate are already off (`powercfg /change
standby-timeout-ac 0`).

### Deliberately not done, so nobody re-derives them

- **CPU affinity pinning to the E-cores.** The 12600KF's efficiency cores are
  conventionally logical CPUs 12–15, but that was never confirmed on this
  machine, and pinning would slow `image_budget` a lot for a problem that is
  not CPU-bound. `AppPriority` lets Windows' own scheduler place the work,
  which on a hybrid CPU is what it is for.
- **`OLLAMA_MAX_LOADED_MODELS=1`.** Near a no-op on an 8 GB card: the
  scheduler already refuses to co-load a model that does not fit, and unloads
  idle ones to make room. Keep-alive is the knob that holds the card.
- **A scheduled "quiet hours" mode.** With "Free the GPU" a press away, a
  timer that guesses when someone is at the desk solves a problem the button
  already solves, and gets it wrong on every irregular day.

## What it does

| Job | What happens |
|---|---|
| `alt_text` | Reads the project's open alt-text findings, re-fetches those pages for context, classifies every image and drafts its alt. Results go to `alt_suggestions` and fill the boxes on the Alt text tab. See [alt-text.md](alt-text.md). |
| `image_budget` | Opens each page in Chrome at 1440, 768 and 390 px, measures how wide every image is actually drawn, fetches each file, and works out what it should weigh. Results go to `image_budget` and drive the Weight tab. |
| `webflow_alt` | Drafts alt text for a site's whole Webflow library — assets and CMS collections — rather than for scanned pages. Feeds the same `alt_suggestions` store, so a draft shows up on both the Webflow tab and the Audit tab. Skips PDFs, videos and anything else that is not an image. |
| `image_apply` | Archives the originals to Bunny, re-encodes, uploads the new file as a Webflow asset and repoints every CMS field that used the old one. Resizes where a measured display width exists, re-encodes at the original dimensions where none does. CMS fields only — see [What it will not do](#what-it-will-not-do). Carries any alt draft across to the image's new URL, since drafts are keyed by URL. |
| `library_group` | One click for one group of a site's images — general assets, or one CMS collection. Describes every image missing ALT (saved ten at a time, so a run that dies three hours in keeps three hours of work), **writes the ALT the classifier is confident about and holds the rest for review**, then optimises: CMS images swapped in place with a Bunny backup, general assets given an optimised copy for Designer where measured oversized. One job per group, so each section of the Images screen has its own progress and its own failure. |
| `alt_apply` | Writes chosen drafts back to Webflow in bulk, and optionally publishes. Two destinations: a site asset takes its alt through the Assets API, a CMS image through its collection item's field. On Canopy eleven of eleven were CMS, so the asset path alone would have applied nothing. |

They are queued from the Audit tab — the Alt text tab's "Draft on `<machine>`"
button, the Weight tab's "Measure sizes" and optimise buttons — and from the
Webflow tab's **Images** screen. That screen is one section per group —
**General assets** first, then each CMS collection — each with its own
**Optimise**, plus **Optimise everything** at the top. Or by hand:

```bash
npm run worker enqueue image_budget <projectId> --emit ./optimised-images
```

**ALT policy, Rehan's call on 2026-09-22:** one click adds ALT, but not ALT the
model itself doubts. A draft is written if the classifier did not flag it for
review and its certainty is not low; everything else waits in the section's
"to review" list, where one Save writes it.

**Portraits in CMS collections.** Every portrait used to be held, because a
model naming a stranger is the worst thing this can write. But in a Teams
collection the item *is* the person, so the item's name is passed as a trusted
`subject`, and a portrait whose ALT uses that name goes straight in. It says
**the name and nothing else** unless the extra words can be read in the image
(`altForRecordPortrait`): given "Jevyn Ong" and a plain headshot, the model
wrote "Jevyn Ong, Head of Design" — a job title from nowhere. It also used to
write "Numaan Ashraf, Headshot", because the field's name went in as the
image's title attribute. A portrait naming anyone else, or no one, is still
held.

**Drafts follow the image across a swap — to the URL Webflow serves.**
Pointing a CMS field at an uploaded asset makes Webflow copy it into the
collection's storage under another id: upload `…/6ab2c0fa…_Jevyn.webp`, and the
field reads back `…/6ab2c175…_6ab2c0fa…_Jevyn.webp`. Carrying drafts to the
uploaded URL orphaned eight of PeakXV's. The job now re-reads the fields it
wrote and carries to what they say.

**What counts as a general asset.** Many sites fill their CMS by uploading
files as site assets, which Webflow then copies into the collection. The CMS
image's URL carries the source asset's id as its *second* hash
(`<delivery id>_<source asset id>_name`), and the source asset sits in the
asset list with an empty alt forever — alt for a CMS image lives on the
field. On PeakXV that was **1,236 of 1,993** image assets; counting them as
general assets missing ALT would have spent about 3½ hours describing images
whose alt is never shown. Both the screen and the job exclude them
(`cmsSourceAssetIds`). On Canopy there were none, so this is measured per
site, never assumed. The screen also used to fetch one page of 100 assets and
stop, which is why PeakXV showed 92.

**Rate limits.** Every Webflow call goes through `webflowFetch`, which waits
out a 429 instead of failing — the first one-click run on PeakXV died on
"Webflow refused the asset list (429)" before describing a single image.
There is one reader for the library (`src/lib/cms/library.ts`); there used to
be four copies of "list the assets", one of which quietly truncated on error.

**Nothing writes to Webflow from the browser any more.** The Webflow tab used
to have two screens with two "Save" buttons that PATCHed from the page, a CLI
command builder under a fake terminal, and a generate route that called Ollama
on `localhost` from a Vercel function. All of it went. Every write is a worker
job, so there is one place to log, back up and audit. An edit made in a row
reaches Webflow as an `overrides` entry on `alt_apply`, not as a second path.

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
| Free the GPU | action | Unloads the vision model so the card is usable. Works while paused; the next job reloads it. |

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

**Nothing reaches a client's live site without someone pressing a button.**
Measuring is automatic; applying never is.

Beyond that, there is a hard line that is worth knowing exactly, because half
of it is a limit and half is a capability:

- **A CMS image can be fixed.** Its URL lives in a collection field, so the
  worker can resize it, upload the new file, and repoint the field. On Canopy
  every image needing work was CMS.
- **A site asset cannot.** Webflow's Assets API creates an asset or edits its
  metadata; there is no endpoint that replaces an existing asset's bytes.
- **A Designer-placed image cannot.** Nothing in the Data API addresses static
  page markup.

The Weight tab splits oversized images on exactly this, with a bulk action per
group and **Optimise all** for every group at once:

| Group | What Optimise does |
|---|---|
| **CMS — fixed for you** | Resize to the measured width, archive the original to Bunny, upload, repoint every field that used it. |
| **Site asset or Designer — ready to swap** | Upload an optimised copy into an **ActiveSet · optimised** folder in the client's Webflow library. The row names the file; in Designer it is select → Replace → pick it. Nothing on the site changes, so nothing needs backing up. Idempotent by file name, and carried across re-measures. |
| **Not classified yet** | Findings measured before classification existed. Optimise works out which is which as it goes and writes the answer back onto each finding, so the rows re-sort live. |

A finding with no classification is *unknown*, never "not CMS". The first
version treated it as the latter, and filed all 45 of PeakXV's CMS images under
"needs Designer" with a footer saying none of them were CMS — because they had
been measured an hour before the classifier shipped.

The worker still writes resized files to `WORKER_EMIT_DIR`, but a path on
Goliath's disk is useless to anyone looking at the app, so the rows no longer
show it.

### Backups

`image_apply` archives every original to Bunny storage **before** it writes
anything, and an image whose backup fails is left untouched. Without
`BUNNY_STORAGE_ZONE` and `BUNNY_STORAGE_KEY` the job refuses to run at all.

That is deliberate rather than cautious. Repointing a CMS field is the first
thing this tool does that overwrites something live. The old Webflow asset is
not deleted, so in principle the bytes survive — but Webflow reports no
back-references, nothing stops someone tidying the asset library later, and
`image_budget` wipes and rewrites its findings on every run, so within a day
there is no record of what the image used to be. An archive off Webflow is
the only version of this that is genuinely reversible.

```powershell
nssm set ActiveSetWorker AppEnvironmentExtra +BUNNY_STORAGE_ZONE=<zone>
nssm set ActiveSetWorker AppEnvironmentExtra +BUNNY_STORAGE_KEY=<password>
nssm set ActiveSetWorker AppEnvironmentExtra +BUNNY_CDN_HOST=<zone>.b-cdn.net
nssm restart ActiveSetWorker
```

`BUNNY_STORAGE_HOST` defaults to `storage.bunnycdn.com`; set it if the zone is
in a specific region. `BUNNY_CDN_HOST` is the pull zone, and is optional —
without it the archive is written but not readable back, which `doctor` says
plainly. Originals land at
`originals/<projectId>/<YYYY-MM-DD>/<fingerprint>-<filename>`, so a second
pass months later archives alongside the first rather than over it.

### The encoding: perceptually lossless, then smallest

"Lossless" stops meaning much the moment you resize — the resample has already
thrown pixels away. So the bar is *perceptually* lossless: a file nobody could
pick out of a line-up beside the original. Two candidates are encoded and the
smaller one ships:

- **True lossless WebP**, which reproduces the resized pixels exactly.
- **WebP at quality 90** with chroma at full resolution, the accepted
  visually-lossless setting for continuous-tone images.

Picking either one for *everything* is the mistake. Measured on six real
ActiveSet images at their 2× target widths:

| | original | lossless everywhere | this rule |
|---|---|---|---|
| total | 470 KB | 884 KB (**+88%**) | 294 KB (−38%) |

Lossless wins on wordmarks and flat graphics, where a handful of colours
compress to nothing, and loses four to six times over on photographs and page
screenshots. Because both candidates already clear the perceptual bar,
choosing between them on size alone cannot cost quality.

Four things the encoder refuses to do, each because the obvious version is
worse than doing nothing:

- **Return anything heavier than what the site already serves.** If neither
  candidate beats the original, the image is left alone and the report says so
  rather than leaving you hunting for a file that is deliberately absent.
- **Flatten an animation.** The old encoder passed `animated: false`, which
  turns an animated logo into a still of its first frame. Multi-page images
  are skipped.
- **Rasterise a vector.** An SVG has no business being pinned to a width.
- **Downgrade AVIF to WebP.** A modern format stays in it, re-encoded at q70.

The saving shown is then **measured**, not the area estimate the app shows
before a file has been encoded, and each row says which candidate won.

## Collections

| Collection | Written by | Read by |
|---|---|---|
| `worker_jobs` | the app queues, the worker claims and completes | both |
| `workers` | the worker, every poll | the app, to show who is online |
| `workers/{id}/control/desired` | the team, from the app | the worker, every poll |
| `workers/{id}/commands` | the team creates; the worker reports the result | both |
| `projects/{id}/image_budget` | the worker | the Weight tab |
| `projects/{id}/alt_suggestions` | the worker | the Alt text tab |
| `projects/{id}/audit_decisions` | the worker, on apply | the Alt text and Weight tabs |

A worker silent for 90 seconds shows as offline. A job whose worker dies
mid-run is reclaimed after five minutes, so a reboot loses nothing.

## Verification

**Use "Run checks" in the app, not `npm run worker doctor` over SSH.** A shell
does not inherit the service's environment block, so a hand-run doctor reports
the *defaults* for everything set with `nssm set ... AppEnvironmentExtra` —
keep-alive, the emit dir, the Bunny zone. The tell is the emit dir: the
service has `C:\activeset\optimised-images`, a shell shows the repo-local
one. "Run checks" executes inside the service and reports what is really
running.

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
