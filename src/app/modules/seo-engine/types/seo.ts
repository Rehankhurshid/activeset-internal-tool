export interface Keyword {
  kw: string;
  vol: number;
  diff: number;
  intent: 'Commercial' | 'Informational' | 'Comparison';
  cpc: string;
  cluster: string;
  priority: 'high' | 'medium' | 'low';
}

export interface VerticalData {
  color: string;
  keywords: Keyword[];
  topics: string[];
}

export type KeywordDB = Record<string, VerticalData>;

export interface FlatKeyword extends Keyword {
  vertical: string;
  vColor: string;
}

export interface TopicItem {
  title: string;
  vertical: string;
  color: string;
}

export interface ContentTemplate {
  label: string;
  icon: string;
  words: string;
  seo: number;
  structure: string;
}

export interface InternalLink {
  text: string;
  suggestedUrl: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface BlogPost {
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  body: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  internalLinks: InternalLink[];
  faqSchema: FAQItem[];
  estimatedReadTime: string;
  seoScore: number;
}

export interface QueueItem extends BlogPost {
  id: number;
  template: string;
  vertical: string;
  status: 'ready' | 'published' | 'draft';
  createdAt: string;
  publishedAt?: string;
  wordCount: number;
}

export interface SEOConfig {
  siteId: string;
  collectionId: string;
  apiToken: string;
  claudeKey: string;
}

export interface AutomationConfig {
  enabled: boolean;
  time: string;
  perDay: number;
  autoPublish: boolean;
}
