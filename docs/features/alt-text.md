# Alt text, classified locally

A vision model on your own machine reads every undescribed image on a client
site, decides what job the image is doing, and drafts the alt attribute for
it. Nothing leaves the laptop except the page fetches: no API key, no cloud
model, no image upload.

```bash
npm run alt doctor                            # is the setup ready
npm run alt page https://www.activeset.co/    # one page
npm run alt site https://usecache.com         # a whole sitemap
npm run alt image ./hero.png                  # a file or a URL
npm run alt project <projectId>               # feed the Audit tab
```

## Setup

```bash
ollama pull qwen2.5vl:7b
ollama serve
```

`qwen2.5vl:7b` is the default: about 6 GB, comfortable on 16 GB of RAM, and
the best local option at that size for reading text out of an image, which
matters because so much of a marketing site is words set as pictures. Swap it
with `--model` or `OLLAMA_ALT_MODEL`. `gemma3:4b` is roughly twice as fast and
noticeably worse at text; `llama3.2-vision:11b` is slower and no better here.

## Classifying, not just describing

The question that matters is not "what is in this image". It is **what is this
image for**, because the right alt text follows from that and nothing else. An
empty alt is *correct* on a divider and wrong on a product photo. A logo
inside a link should say where the link goes, not describe the logo.

Ten categories, following the W3C alt decision tree plus what actually turns
up on the sites this is pointed at. They and their rules live in one file —
[`src/lib/alt-text/taxonomy.ts`](../../src/lib/alt-text/taxonomy.ts) — because
the categories and the thresholds are the part a person should argue with, and
hunting them across six files is how a rule ends up wrong for a year.

| Category | What the alt becomes |
|---|---|
| `decorative` | empty — a spacer, a divider, a texture |
| `informative` | what it shows |
| `functional` | where the link goes, not what the picture is |
| `logo` | "<Organisation> logo", or just the name inside a link |
| `text_image` | the words, transcribed exactly |
| `portrait` | the person's name when the page gives it, never a guess |
| `product` | the product as the page names it, plus one distinguishing detail |
| `chart` | a one-line summary, with the detail in a long description |
| `screenshot` | the site or product and what the screen shows |
| `icon` | empty beside a text label; the action when it stands alone |

## How one image is decided

```
fetch and shrink  →  cheap rules  →  one schema-constrained model call
                  →  deterministic repair  →  optional agreement and self-check
```

**Cheap rules first.** A 1×1 tracking pixel does not need eight billion
parameters. Flat colours, hairline rules and anything the markup already
marks `aria-hidden` are settled without a model call.

**Context, then pixels.** Most of the quality is in what the page says around
the image: the heading on its own card, the caption, the link it sits inside,
its CSS classes, how many pages carry it. The scanner stores `src`, `alt` and
"is it in main", which is enough to *count* a problem and nowhere near enough
to *fix* one, so this re-reads the page.

**One call, in a fixed order.** Ollama constrains decoding to a JSON schema,
and constrained decoding emits keys in schema order. So the model must say
what it sees, then transcribe any text, then pick a category, and only then
write the alt — each step conditioned on the last. That is a reasoning chain
for the price of one call, and there is no "sometimes it wraps the answer in
backticks" parsing layer.

**Rules that can be enforced are enforced in code**, in
[`validate.ts`](../../src/lib/alt-text/validate.ts): the "Image of…" opener a
vision model will write forever, the 125-character limit, an alt that is just
the file name, an alt that repeats the caption. And one rule that is a rule
rather than a judgement — an image that is the only thing inside a link is
functional, whatever the model called it.

**Optional, off by default:**

- `--consensus 3` samples three times and keeps the majority, with the
  agreement rate as a real confidence. A model that flip-flops between
  "decorative" and "logo" is flagged instead of guessed at.
- `--verify` shows the model its own alt beside the image and asks whether it
  holds. Catches confident nonsense; doubles the time.

**Cached by image bytes**, not URL, so a second run over a barely-changed site
costs nothing, and a re-uploaded copy of the same photograph is recognised
while a genuinely replaced one is not. `npm run alt cache --clear` empties it.

## In conjunction with the Audit tab

```
audit scan  →  open alt findings  →  npm run alt project <id>  →  alt_suggestions
                                                                       ↓
                                              Alt text tab fills the box for you
```

`npm run alt project <id>` reads the project's open alt findings, re-fetches
the pages that carry them for context, runs the classifier, and writes the
drafts to `projects/{id}/alt_suggestions`, keyed by the same image fingerprint
the findings use so each one lands on its own row.

The browser never talks to Ollama. Going through Firestore instead means no
CORS, no private-network permission prompt, and — the real reason — the
drafts are waiting on your phone afterwards. The model runs where the GPU is;
the reviewing happens wherever you are.

**A suggestion fills the box. It never saves anything.** The row shows the
category, what the model saw, and any repairs that were made; Save to Webflow
and Decorative stay human clicks, the same rule the rest of the audit follows.

Requires Firebase admin credentials locally:

```bash
npx vercel env pull .env.local
```

Without them every other command still works in full.

## What it costs

On an M1 Pro with `qwen2.5vl:7b`, about **11–19 seconds an image**, one at a
time. Concurrency defaults to 1 because Ollama serialises requests to a single
model anyway — firing four at once makes each slower and risks swapping 6 GB
against everything else running. The model stays resident for 15 minutes
between calls, which matters far more than parallelism: reloading it per image
is the slowest thing you can do.

So a 40-image site is about ten minutes, and the second run is seconds.

## What it is bad at

Measured, on real pages, not guessed:

- **Borderline nav icons.** On the Cache nav it labelled two product icons by
  their destination and described the third one's pictogram. The link rule now
  catches that class; `--consensus 3` surfaces the rest as disagreement.
- **Generic screenshots.** "Privado website screenshot" is honest but thin
  where "Luca website: financing for Latino businesses" is good. It depends
  entirely on whether the surrounding copy names the thing.
- **People.** It is told never to guess a name, gender, age or mood, so an
  unnamed person gets a thin description. Portraits are always flagged for
  review.
- **Charts.** Always flagged. A short alt plus a long description is a
  judgement about what the reader needs, and a 7B model does not make it well.

## Verification

1. `npm run test:alt-text` covers the cheap rules, every repair, and the
   context extraction — no model needed. Three cases are regressions from real
   output and are named as such in the file.
2. `npm run alt doctor` should end in "Ready."
3. `npm run alt page https://www.activeset.co/ --limit 8` is the page this was
   tuned against. Expect the Udemy and Canopy marks as logos, the Luca and
   Peak XV cards as screenshots, and the Keatech lorry as a product photo.

## Where the bodies are buried

Three defects found by pointing this at a real page, all now covered by tests:

- **A low-entropy rule called the Udemy logo "a gradient or wash".** Sharp
  measures entropy over the histogram, so a two-tone wordmark scores lower
  than a photograph while being the least decorative thing on the page. The
  rule is gone; entropy is kept as a diagnostic and never decides anything.
- **A photograph of a branded lorry became `alt="IVECO"`**, because it was
  called a text image and the transcription was swapped in. A transcription
  under 18 characters is now treated as a wordmark inside a picture.
- **"Nearest heading above the image" labelled the Peak XV screenshot
  "Luca".** A card grid puts the image before its own title, so every card
  picked up the previous card's heading. The image's own container is searched
  first now.
