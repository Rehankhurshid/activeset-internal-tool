// Webflow API Response Types

export interface WebflowLocale {
  id: string;
  cmsLocaleId: string;
  tag: string;
  displayName: string;
  redirect: boolean;
  subdir: string | null;
}

export interface WebflowSite {
  id: string;
  workspaceId: string;
  shortName: string;
  displayName: string;
  previewUrl: string;
  timezone: string;
  database: string | null;
  createdOn: string;
  lastPublished: string | null;
  customDomains: unknown[];
  locales: {
    primary: WebflowLocale;
    secondary: WebflowLocale[];
  };
}

export interface WebflowSEO {
  title?: string;
  description?: string;
}

export interface WebflowOpenGraph {
  title?: string;
  titleCopied?: boolean;
  description?: string;
  descriptionCopied?: boolean;
}

export interface WebflowPage {
  id: string;
  siteId: string;
  title: string;
  slug: string;
  parentId?: string;
  collectionId?: string; // If present, it's a CMS page template
  createdOn: string;
  lastUpdated: string;
  archived: boolean;
  draft: boolean;
  localeId?: string; // Adding localeId support
  publishedPath?: string; // Optional full path
  seo?: WebflowSEO;
  openGraph?: WebflowOpenGraph;
}

export interface SEOIssue {
  field: string;
  type: 'missing' | 'too_short' | 'too_long' | 'duplicate';
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface SEOHealthScore {
  score: number;
  status: 'good' | 'warning' | 'critical';
}

export interface WebflowPageWithQC extends WebflowPage {
  seoHealth?: SEOHealthScore;
  issues: SEOIssue[];
}

export interface WebflowSiteHealth {
  totalPages: number;
  staticPages: number;
  cmsPages: number;
  averageScore: number;
  issuesCount: {
    critical: number;
    warning: number;
    info: number;
  };
  totalIssues: number;
  pagesWithIssues: number;
  criticalPages: number;
  distribution: {
    good: number;
    warning: number;
    critical: number;
  };
}

export interface UpdateWebflowPageSEO {
  localeId?: string;
  title?: string;
  slug?: string;
  seo?: WebflowSEO;
  openGraph?: WebflowOpenGraph;
}

export interface AISEOGeneratedData {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  reasoning?: string;
}

export interface WebflowConfig {
  siteId: string;
  apiToken: string;
  siteName?: string;
  customDomain?: string;
  lastSyncedAt?: string;
}

export interface CollectionField {
  id: string;
  isEditable: boolean;
  isRequired: boolean;
  type: string;
  slug: string;
  displayName: string;
  helpText?: string;
}
