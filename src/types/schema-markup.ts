// Schema Markup Recommendation Types

export type SchemaConfidence = 'high' | 'medium' | 'low';

export interface ExistingSchema {
  /** Schema.org @type, e.g. "Article", "Organization". */
  type: string;
  /** Raw JSON-LD object as found on the page. */
  raw: Record<string, unknown>;
  /** Issues detected by the model (missing required props, deprecated, etc.). */
  issues: string[];
}

export interface SchemaRecommendation {
  /** Schema.org @type being recommended. */
  type: string;
  /** Human-readable explanation of why this applies to the page. */
  reason: string;
  confidence: SchemaConfidence;
  /** Ready-to-paste JSON-LD object. */
  jsonLd: Record<string, unknown>;
}

export interface SchemaAnalysisResult {
  /** Guessed page archetype: article, product, localbusiness, faq, etc. */
  pageType: string;
  existing: ExistingSchema[];
  recommended: SchemaRecommendation[];
  /** Short narrative summary from the model. */
  summary?: string;
}

export interface SchemaPageSignals {
  url: string;
  title: string | null;
  metaDescription: string | null;
  h1: string[];
  h2: string[];
  /** First ~4000 chars of visible text — enough for classification, bounded for prompt size. */
  mainText: string;
  images: Array<{ src: string; alt: string | null }>;
  /** Existing JSON-LD blocks found in the page. */
  existingJsonLd: Record<string, unknown>[];
}

export interface SchemaAnalysisDoc {
  pageId: string;
  projectId: string;
  contentHash: string;
  url: string;
  result: SchemaAnalysisResult;
  createdAt: number;
  model: string;
}
