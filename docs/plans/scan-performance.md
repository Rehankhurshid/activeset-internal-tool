# Page scans: why they felt slow, and what changed

Measured on 2026-09-20 against `https://www.activeset.co/`, a real Webflow page
with 47 links and 52 images, using the actual scan code rather than estimates.

## The scan was never the slow part

| Step | Measured | Notes |
| --- | --- | --- |
| Fetch the page, parse it, run every in-process check | **0.5 s** | This is "the scan". |
| Check the links | **4.9 s one run, 18.4 s the next** | Same page, same 47 links. |
| Read the previous audit | unbounded | Downloads every audit the page has ever had, each carrying its full HTML, to read one field. Grows nightly. |
| Screenshot | not measurable on this Mac | Headless Chromium on Vercel: cold launch, a second full page load, and sleeps. |
| Jev judgment | 0.4 to 0.9 s | Fine, and overlapped with the screenshot. |

Everything expensive was network fan-out around the scan, run one step after
another, and much of it was doing work that produced nothing.

## What was wrong, specifically

**The link checker was slow and also wrong.** It checked 47 links in sequential
batches of ten, each batch waiting for its slowest member with a 5 s timeout, and
retried every blocked `HEAD` with a full `GET`. It checked all 47 when only 28
were unique, because nav and footer repeat. It cached nothing across pages, so a
40-page site hit the same LinkedIn profile 40 times, which is exactly the burst
that provokes the rate limiting behind the 5-to-18-second swing. And it reported
LinkedIn as broken: every profile answers a script with status 999, LinkedIn's
bot-block code, and the checker called that a dead link. Every LinkedIn link on
every client site, flagged forever.

**Two history queries had no bound.** `getLatestAuditLog` and
`changeLogService.getLatestEntry` both had their `orderBy` commented out "to
avoid index requirements" and sorted in memory. Each audit log carries the page's
full HTML source, up to 900 KB. So every scan of every page downloaded the page's
entire history to read the newest entry, and the change-log one did it to answer
a yes-or-no question. The `orderBy` and `limit` imports were already sitting
unused in both files: someone planned this and never finished.

**The previous HTML was fetched on every scan** but only used to build a content
diff, which most nightly scans never do.

**Writes were proportional to the whole site, per page.** Persisting one page's
audit rewrote the audit document of every audited page on the project, once per
chunk of five. A 40-page site wrote its 40 audits eight times over, each
deep-cloned and compacted again, to land five. A single manual rescan wrote 41
documents.

**Jev never saw the broken links.** The judgment was started before the link
check resolved so the two could overlap, but that meant it judged the scanner's
hardcoded empty list. The broken-link triage shipped the day before was dead code
on every path. My bug.

**The page was parsed twice.** `cheerio.load` was called on the same 300 KB
string once inside the schema extractor and once in the main scan.

**The manual rescan read the previous audit three times** in one request, and had
no `maxDuration`, so a headless-browser route ran on the platform default.

**Idle polling.** Two every-minute crons each ran three Firestore queries to drain
a notification queue that the status route already drains in real time on
completion; both are crash-recovery fallbacks by their own comments. With the
job-discovery queries, that was about eight reads a minute, eleven thousand a
day, to find nothing.

## What changed

**Link checker** (`src/services/LinkCheckerService.ts`, new `LinkCheckCache.ts`,
new test file). Dedupe by absolute URL with the fragment stripped. A continuous
concurrency pool of ten instead of sequential batches. A per-invocation cache
with a five-minute TTL for settled verdicts and sixty seconds for transient ones,
so pages two to ten of a site pay nothing for the links page one already checked.
`HEAD` gets 3 s, the `GET` retry 5 s, and there is no `GET` retry at all for 999,
403, 429 or 401, or for DNS and connection failures, which only doubled the wait.

Measured on the same page: **5,031 ms before, 1,310 ms after cold, 57 ms for
the next page of the same site.**

Bot-block and rate-limit answers are now **unverifiable, not broken**: 999, 403,
429, 401, and a `405` whose `GET` retry was also refused. They live in a separate
`unverifiableLinks` list on the audit, do not count against the page's score, and
the audit screen shows them as "could not be verified" in amber rather than
letting them vanish. Broken stays 404, 410, other 4xx, 5xx, DNS and connection
failure, and a timeout on a host that has not bot-blocked us.

**History queries** (`AuditService.ts`, `ChangeLogService.ts`,
`firestore.indexes.json`). Both are now `orderBy('timestamp', 'desc')` with
`limit(1)`, backed by two composite indexes. Until the indexes are deployed
Firestore refuses the ordered query, so each falls back to the old unbounded read
with a loud warning rather than silently returning nothing and breaking every
diff. The previous HTML is only fetched on the content-changed path, so the
common nightly no-change scan never reads it at all.

**Writes** (`ScanJobService.ts`, `database.ts`). The bulk path writes audit
documents only for the pages scanned this invocation. The manual path writes only
the page that was rescanned. The links array on the project document is still
rewritten whole; see below.

**Jev ordering** (`ScanJobService.ts`, `scan-pages/route.ts`). The judgment
starts after the link check and overlaps the screenshot instead, so it sees the
real broken-link list. The screenshot is the long step, so the overlap is
preserved.

**One parse** (`PageScanner.ts`). The schema extractor takes the already-loaded
document.

**Manual rescan** (`scan-pages/route.ts`). Previous screenshot URLs come from the
stored audit rather than a history read. At most one bounded history read, on
the content-changed path only. `runtime = 'nodejs'`, `maxDuration = 120`.

**Polling** (`vercel.json`, `ScanJobService.ts`, `ScanNotificationQueueService.ts`).
The duplicate notifications cron is gone. Job discovery and notification
discovery are one `in` query each instead of two and three. The remaining
fallback cron runs every five minutes instead of every minute; it is safe to slow
because a new bulk scan is kicked immediately on creation and the process route
re-triggers itself, so the cron is only ever recovering from a crash. Idle cost
drops from about eight reads a minute to two reads every five.

**Screenshot** (`ScreenshotService.ts`, `ScreenshotStorageService.ts`). The
per-step 100 ms sleeps are replaced by a single in-page walk that steps one
viewport per animation frame, scrolls back, then waits only while lazy images
are still landing, ending after a 400 ms quiet window or a 1.5 s backstop. The
obvious alternatives were tried and lost: `waitForNetworkIdle` hit its timeout
on every marketing page because analytics beacons never go idle, and a tall
viewport loaded fewer images. Full-page capture stays, because the audit screen
shows current against previous and a viewport shot would miss changes below the
fold. The capture is passed as bytes rather than base64. The dead three-viewport
capture with its 30 s timeout is deleted.

Measured locally, scroll-and-settle phase only: activeset.co 2,049 ms to 472 ms,
webflow.com 1,087 ms to 639 ms, vercel.com 873 ms to 203 ms, with the same
images loaded.

**A bug found on the way: tall pages were uploading empty files.** Chrome's WebP
encoder caps each side at 16,383 px and `page.screenshot` returns an empty buffer
rather than throwing. The ActiveSet homepage is 19,782 px tall and produced zero
bytes under the old code. Any existing audit whose screenshot came from a page
that tall points at an empty file. The scale factor is now lowered just enough to
fit, keeping the whole page, and an empty capture throws so it is logged as a
failure instead of uploaded as nothing.

The second round trip for the download URL is kept, deliberately. The SDK cannot
derive the token URL. A tokenless URL would work today only because
`storage.rules` allows public read on screenshots, and every stored URL would
break the day that is tightened. That trade-off is documented in the file and is
a decision for Rehan, not for a performance pass.

## One-time step after deploying

The two composite indexes have to be created once. From a machine that has run
`firebase login`:

```bash
npx firebase deploy --only firestore:indexes
```

Until then the bounded queries fall back and log a warning; nothing breaks.

## On "rethinking the process"

The pipeline was slow for reasons that were all fixable in place, not because the
shape was wrong. A page-per-job pipeline with a shared link cache and bounded
reads is a reasonable design.

The one genuinely structural problem that remains is that `project.links` is an
array on one document, rewritten whole by every persist. Two chunks of the same
scan, or two scans of different projects that happen to share a lambda, can each
read the array, each write it back, and the last writer wins. The audit content
itself is safe in its subcollection; what can be lost is a link's stripped
metadata. The fix is per-link documents instead of an array, which touches every
reader of `project.links` and is a separate piece of work.

## Verification

1. `npx tsx --test src/services/LinkCheckerService.test.ts` covers dedupe,
   classification, the result mapping and the pool, with a stubbed `fetch`.
2. Rescan a page whose footer links to LinkedIn. It should finish in a few
   seconds, report no broken links, and list the LinkedIn profiles under "could
   not be verified".
3. Rescan a page a second time with no change. The audit-log history read should
   not appear in the function logs at all.
4. After deploying the indexes, the fallback warning should stop appearing.
