export type SchemaConfidence = 'high' | 'medium' | 'low';

export interface ExistingSchema {
  type: string;
  raw: Record<string, unknown>;
  issues: string[];
}

export interface SchemaRecommendation {
  type: string;
  reason: string;
  confidence: SchemaConfidence;
  jsonLd: Record<string, unknown>;
}

export interface SchemaAnalysisResult {
  pageType: string;
  existing: ExistingSchema[];
  recommended: SchemaRecommendation[];
  summary?: string;
}

export interface SchemaPageSignals {
  url: string;
  title: string | null;
  metaDescription: string | null;
  h1: string[];
  h2: string[];
  mainText: string;
  images: Array<{ src: string; alt: string | null }>;
  existingJsonLd: Record<string, unknown>[];
}

export interface WebflowPageLite {
  id: string;
  title: string;
  slug: string;
  publishedPath?: string;
  collectionId?: string;
  draft?: boolean;
  archived?: boolean;
}

/** Output file format. Versioned for forward compatibility with the importer. */
export interface SchemaExportFile {
  version: 1;
  generatedAt: string;
  model: string;
  baseUrl: string;
  siteId: string;
  domain: string;
  entries: SchemaExportEntry[];
}

export interface SchemaExportEntry {
  pageId: string;
  pageTitle: string;
  url: string;
  contentHash: string;
  result: SchemaAnalysisResult;
}
