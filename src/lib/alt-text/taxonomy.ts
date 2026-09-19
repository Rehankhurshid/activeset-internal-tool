import type { AltKind, ImageContext } from './types';

/**
 * The rules. Everything a reviewer needs to argue with lives in this file —
 * the categories, what good alt text is for each one, and the wording of the
 * instruction the model receives. The rest of the pipeline is plumbing.
 *
 * The shape follows the W3C alt decision tree, which is the only widely
 * agreed answer to "what should this alt say", plus the categories that
 * actually turn up on the marketing sites this tool is pointed at.
 */

export const MAX_ALT_CHARS = 125;

/** Bumped whenever the prompt or rules change, so cached answers are not reused across versions. */
export const PROMPT_VERSION = 5;

interface KindRule {
  /** Shown to the model as the definition of the category. */
  definition: string;
  /** Shown to the model as what the alt must be for this category. */
  altRule: string;
}

export const KIND_RULES: Record<AltKind, KindRule> = {
  decorative: {
    definition:
      'Adds nothing a reader would miss: a spacer, a divider line, a background texture, a gradient, an abstract shape, a stock photo behind a heading that only sets a mood.',
    altRule: 'Leave alt empty. Write "" and nothing else.',
  },
  informative: {
    definition:
      'Shows something the reader is meant to take in — a scene, an event, an object, a situation that the surrounding words do not already state.',
    altRule:
      'Say what it shows, in the order someone would notice it. Lead with the subject. Include only detail that changes the meaning.',
  },
  functional: {
    definition:
      'Sits inside a link or a button and is the only thing identifying it. Its job is to be clicked. This wins over every category below it.',
    altRule:
      'Name where it goes or what it does, not what it looks like: "Open the pricing page", not "blue arrow icon". When it is a company logo or a project thumbnail linking to that company or project, the alt is just the name — "Udemy", "Keatech case study". Ignore carousel counters like "01/02" in the link text.',
  },
  logo: {
    definition: "An organisation's or product's mark or wordmark.",
    altRule:
      'Write "<Organisation> logo". If it is a link to that organisation\'s home page, write just "<Organisation>". Never describe the shapes or colours.',
  },
  text_image: {
    definition:
      'Almost entirely words set as a picture — a quote card, a pricing table, a banner whose message is typography. Remove the words and nothing is left worth describing. A photograph that happens to contain a sign, a logo or a number plate is NOT this.',
    altRule:
      'Transcribe the words exactly as they appear, in reading order. Do not summarise or re-punctuate them.',
  },
  portrait: {
    definition: 'A photograph of a person, usually a headshot or a team photo.',
    altRule:
      'If the page names the person, use their name, and their role when the page gives it: "Priya Sharma, Head of Design". If the page does not name them, describe them only as far as the page cares about, and never guess a name, gender, age, ethnicity or mood.',
  },
  product: {
    definition: 'A thing being sold, shipped or demonstrated.',
    altRule:
      'Name the product as the page names it, then the one visual detail that distinguishes this shot: colour, angle, what it is next to.',
  },
  chart: {
    definition: 'A chart, graph, diagram, flow, map or infographic — data or structure drawn out.',
    altRule:
      'The alt says what it is and what it shows overall: "Bar chart: revenue by quarter, rising through 2025". Put the numbers and the detail in long_description instead.',
  },
  screenshot: {
    definition:
      'A capture of software or a web page — an app, a dashboard, a settings pane, a website. A web page shown inside a browser window, a laptop, a phone or any device frame is a screenshot, however much photography or headline text that page itself contains. Agency and portfolio sites are largely made of these.',
    altRule:
      'Name the site or product — the words around the image almost always say which — and what the captured screen shows: "The Luca homepage: financing for Latino businesses". Do not describe the photograph inside the screenshot as though it were the image.',
  },
  icon: {
    definition: 'A small pictogram: an arrow, a tick, a social badge, a bullet marker.',
    altRule:
      'If a visible text label already says the same thing, it is decorative — leave alt empty. If the icon stands alone and does something, name the action.',
  },
};

/** Categories where an empty alt is the right answer. */
export const EMPTY_ALT_KINDS: ReadonlySet<AltKind> = new Set<AltKind>(['decorative']);

/** Categories a person should always glance at, however sure the model sounds. */
export const ALWAYS_REVIEW_KINDS: ReadonlySet<AltKind> = new Set<AltKind>(['chart', 'portrait']);

/**
 * The instruction. Deliberately one block of prose rather than a bulleted
 * pile: the categories are a decision, and the model reads a decision better
 * than it reads a checklist.
 */
export function systemPrompt(): string {
  const catalogue = (Object.keys(KIND_RULES) as AltKind[])
    .map((kind) => `${kind} — ${KIND_RULES[kind].definition}\n    alt: ${KIND_RULES[kind].altRule}`)
    .join('\n\n  ');

  return `You write alt text for a web accessibility audit. You are shown one image from a real website, together with what the page says around it.

Work in this order, and fill the JSON fields in the order they are listed.

1. observation — one plain sentence about what is literally in the image. Start by naming the medium: a photograph, a screenshot inside a browser or device frame, a logo or wordmark, a chart, or a graphic. No interpretation.
2. visible_text — every word legible in the image, transcribed exactly. Empty string if there are none.
3. kind — the single category the image belongs to, from this list:

  ${catalogue}

Work down that list in order and take the first category that fits. Two orderings matter and are not negotiable:
  - If the image sits inside a link and is the only thing identifying that link, it is functional, whatever it depicts. A company logo linking to that company is functional, and its alt is the company name.
  - Only call something text_image when the words ARE the image. A photograph containing a sign or a logo is informative or product, not text_image.
  - If the image has browser chrome, a device frame, a URL bar or a site navigation bar around it, it is a screenshot — not a photograph of whatever that page shows, and not a text image because the page has a big headline.

4. certainty — high if the category is obvious, medium if the context is thin, low if you are guessing.
5. alt — the alt attribute, following the rule for the category you chose.
6. long_description — only for charts and infographics: the detail the short alt cannot carry. Empty string otherwise.

Rules for alt, which override anything above:
- At most ${MAX_ALT_CHARS} characters. Shorter is better. Most good alt text is under twelve words.
- Never begin with "Image of", "Photo of", "Picture of", "Graphic of", "An illustration of", or the word "Image".
- Describe only what is visible. Do not infer a person's name, job, mood, age, gender or ethnicity that the page has not already told you.
- Do not repeat a caption or heading that a reader will already have read. If the surrounding words already say it, the image is decorative.
- Plain sentence case. No markdown, no quotation marks around the whole thing, no trailing "..".
- Write British-neutral plain English. No marketing language.

If the page context contradicts the picture, trust the page context for names and titles, and the picture for everything else.`;
}

/** The per-image message: what the page knows, then the image itself. */
export function userPrompt(context: ImageContext, facts?: { width: number; height: number }): string {
  const lines: string[] = [];
  const add = (label: string, value?: string | number | boolean) => {
    if (value === undefined || value === null || value === '') return;
    lines.push(`${label}: ${String(value).slice(0, 400)}`);
  };

  add('Site', context.siteName);
  add('Page title', context.pageTitle);
  add('Page URL', context.pageUrl);
  add('Nearest heading above the image', context.heading);
  add('Caption', context.caption);
  add('Title attribute', context.title);
  add('Text around the image', context.nearbyText);
  if (context.linkHref) {
    add('The image is inside a link to', context.linkHref);
    add('That link\'s own text', context.linkText || '(the image is the only thing in the link)');
  }
  add('Region of the page', context.region);
  add('CSS classes on the image', context.className);
  add('File name', fileNameOf(context.src));
  if (facts) add('Rendered size', `${facts.width}x${facts.height}`);
  if (context.pageCount && context.pageCount > 1) {
    add(
      'Appears on',
      `${context.pageCount} pages of this site, so it is part of a template rather than specific to one page`,
    );
  }
  if (context.markedPresentational) {
    add('Note', 'The markup already marks this image as presentational (role=presentation or aria-hidden)');
  }

  const context_block = lines.length > 0 ? lines.join('\n') : '(the page gives no context for this image)';
  return `What the page says around this image:\n${context_block}\n\nClassify the image and write its alt text.`;
}

export function fileNameOf(src: string): string {
  try {
    const path = new URL(src, 'https://example.invalid').pathname;
    const name = decodeURIComponent(path.split('/').filter(Boolean).pop() || '');
    // Webflow prefixes every asset with a 24-char id; it is noise to a reader.
    return name.replace(/^[0-9a-f]{24}_/i, '');
  } catch {
    return src;
  }
}

/**
 * The JSON schema handed to Ollama. Field order is load-bearing: constrained
 * decoding emits the keys in this order, so the model states what it sees and
 * reads the text out of the image *before* it commits to a category, and
 * commits to a category before it writes the alt. That is a reasoning chain
 * for the price of one call.
 */
export function judgmentSchema(kinds: readonly string[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      observation: { type: 'string' },
      visible_text: { type: 'string' },
      kind: { type: 'string', enum: [...kinds] },
      certainty: { type: 'string', enum: ['high', 'medium', 'low'] },
      alt: { type: 'string' },
      long_description: { type: 'string' },
    },
    required: ['observation', 'visible_text', 'kind', 'certainty', 'alt', 'long_description'],
  };
}
