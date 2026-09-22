/**
 * Types for the local alt-text classifier.
 *
 * Nothing here imports `server-only` or Node built-ins, so the app can render
 * a suggestion without pulling the generator in.
 */

/**
 * What kind of job the image is doing on the page. This is the decision that
 * matters: an empty alt is *correct* on a divider and wrong on a product
 * photo, and the right words for a logo inside a link are not a description
 * of the logo. Every other part of the pipeline follows from this.
 */
export type AltKind =
  /** Spacer, divider, texture, pure ornament. Correct alt is empty. */
  | 'decorative'
  /** Carries information a sighted reader gets from looking at it. */
  | 'informative'
  /** Inside a link or button: the alt names the destination, not the picture. */
  | 'functional'
  /** An organisation's mark. */
  | 'logo'
  /** The image is mostly words; the alt transcribes them. */
  | 'text_image'
  /** A person. Their name, when the page tells us it. */
  | 'portrait'
  /** A thing being sold or shown off. */
  | 'product'
  /** Chart, graph, diagram, infographic, map. Needs a long description too. */
  | 'chart'
  /** A screenshot of software. */
  | 'screenshot'
  /** A small pictogram. Decorative beside a text label, functional alone. */
  | 'icon';

export const ALT_KINDS: AltKind[] = [
  'decorative',
  'informative',
  'functional',
  'logo',
  'text_image',
  'portrait',
  'product',
  'chart',
  'screenshot',
  'icon',
];

/** How sure the classifier is. A discrete scale; models handle it far better than a float. */
export type Certainty = 'high' | 'medium' | 'low';

/**
 * Everything the page tells us about one image, gathered before the model is
 * asked anything. Alt text is a function of context, not just pixels — the
 * same headshot is "Priya Sharma" on a team page and "Read Priya's post" in a
 * blog card — so this is where most of the quality comes from.
 */
export interface ImageContext {
  /** Absolute URL of the image. */
  src: string;
  /** Page the image was found on. */
  pageUrl?: string;
  /** Page `<title>`. */
  pageTitle?: string;
  /** Nearest heading above the image. */
  heading?: string;
  /** `<figcaption>` text, when the image is in a `<figure>`. */
  caption?: string;
  /** `title` attribute. */
  title?: string;
  /** Short run of text immediately around the image. */
  nearbyText?: string;
  /** Set when the image is inside an `<a>`: where it goes. */
  linkHref?: string;
  /** The link's own text, when it has any besides the image. */
  linkText?: string;
  /** Landmark the image sits in. */
  region?: 'nav' | 'header' | 'footer' | 'main' | 'aside' | 'body';
  /** Class names — Webflow's are often descriptive ("team-member_photo"). */
  className?: string;
  /** `role="presentation"` or `aria-hidden="true"` already on the element. */
  markedPresentational?: boolean;
  /** The site or client this belongs to, for naming a logo. */
  siteName?: string;
  /** How many pages carry this same asset. A high number means a template image. */
  pageCount?: number;
  /**
   * Who or what the image is of, when a record says so for certain — the name
   * of the CMS item the image belongs to. A page's nearest heading is a guess
   * about that; a Teams item called "Numaan Ashraf" holding a headshot is not.
   */
  subject?: string;
}

/** What `sharp` and a few cheap rules can tell us without a model call. */
export interface ImageFacts {
  width: number;
  height: number;
  format: string;
  bytes: number;
  /** Longest-side-to-shortest-side ratio. */
  aspect: number;
  hasAlpha: boolean;
  /** Shannon entropy of the pixels. Near zero means a flat or near-flat image. */
  entropy: number;
  /** Highest per-channel standard deviation. Near zero means one colour. */
  maxChannelStdev: number;
}

/** A verdict the deterministic stage reached on its own, before any model call. */
export interface PrecheckVerdict {
  kind: AltKind;
  certainty: Certainty;
  reason: string;
}

/** The model's structured answer, before validation. */
export interface RawJudgment {
  observation: string;
  visible_text: string;
  kind: AltKind;
  certainty: Certainty;
  alt: string;
  long_description: string;
}

export interface AltSuggestion {
  /** Stable id for the image: `imageFingerprint(src)` from the audit domain. */
  fingerprint: string;
  src: string;
  kind: AltKind;
  certainty: Certainty;
  /** The alt attribute to write. Empty string is a real answer, not a failure. */
  alt: string;
  /** Text the model read out of the image, verbatim. */
  visibleText?: string;
  /** For charts and infographics: what the short alt cannot carry. */
  longDescription?: string;
  /** One clause on what the model saw, for a person deciding whether to trust it. */
  observation?: string;
  /** True when a person should look before this is used. */
  needsReview: boolean;
  /** Why it needs review, or what was repaired. Empty when nothing was wrong. */
  notes: string[];
  /** Agreement across samples when `consensus` was used: 1 means unanimous. */
  agreement?: number;
  /** Set when a verify pass ran: did the model stand by its own alt? */
  verified?: boolean;
  model: string;
  /** Milliseconds of wall clock, model calls included. */
  durationMs: number;
  /** True when the answer came from the on-disk cache. */
  cached: boolean;
  generatedAt: string;
  facts?: ImageFacts;
}
