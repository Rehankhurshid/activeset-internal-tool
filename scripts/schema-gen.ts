#!/usr/bin/env tsx
/**
 * Schema Markup generator CLI.
 *
 * Reads static Webflow pages, scrapes the live URL, runs them through a local
 * Ollama model (Gemma by default), and uploads the recommendations to
 * Firestore so the Webflow Pages dashboard picks them up from cache.
 *
 * Commands:
 *   list      — print static pages discovered for a site
 *   generate  — scrape + analyze + upload (static pages only)
 *
 * Env (.env.local):
 *   WEBFLOW_API_TOKEN
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID   (or FIREBASE_PROJECT_ID)
 *   FIREBASE_SERVICE_ACCOUNT_KEY      (JSON or base64)
 *   OLLAMA_BASE_URL                   (default http://127.0.0.1:11434)
 *   OLLAMA_MODEL                      (default gemma4:e4b)
 *
 * Example:
 *   npm run schema:gen -- generate \
 *     --site <webflowSiteId> \
 *     --project <firestoreProjectDocId> \
 *     --domain www.example.com
 */

import { Command } from 'commander';
import * as dotenv from 'dotenv';
import { db as adminDb } from '@/lib/firebase-admin';
import {
  scrapePageSignals,
  computeContentHash,
} from '@/services/SchemaMarkupService';
import type {
  SchemaAnalysisResult,
  SchemaPageSignals,
} from '@/types/schema-markup';

dotenv.config({ path: '.env.local' });
dotenv.config();

const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';
const SCHEMA_COLLECTION = 'schema_analyses';

// ─── types ──────────────────────────────────────────────────────────────────

interface WebflowPageLite {
  id: string;
  title: string;
  slug: string;
  publishedPath?: string;
  collectionId?: string;
  draft?: boolean;
  archived?: boolean;
}

interface ProjectDoc {
  webflowConfig?: {
    apiToken?: string;
    siteId?: string;
    siteName?: string;
    customDomain?: string;
  };
}

// ─── shared helpers ─────────────────────────────────────────────────────────

function requireEnv(name: string, fallback?: string): string {
  const v = process.env[name] || fallback;
  if (!v) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
  return v;
}

async function loadProjectConfig(projectId: string): Promise<ProjectDoc> {
  const snap = await adminDb.collection('projects').doc(projectId).get();
  if (!snap.exists) {
    console.error(`Project ${projectId} not found in Firestore`);
    process.exit(1);
  }
  return (snap.data() as ProjectDoc) ?? {};
}

async function fetchAllPages(
  siteId: string,
  token: string
): Promise<WebflowPageLite[]> {
  const pages: WebflowPageLite[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const res = await fetch(
      `${WEBFLOW_API_BASE}/sites/${siteId}/pages?limit=${limit}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' } }
    );
    if (!res.ok) {
      throw new Error(`Webflow pages ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as {
      pages: WebflowPageLite[];
      pagination?: { total?: number };
    };
    pages.push(...(json.pages ?? []));
    if (!json.pages?.length || pages.length >= (json.pagination?.total ?? 0)) {
      break;
    }
    offset += limit;
  }

  return pages;
}

function isStaticCandidate(page: WebflowPageLite): boolean {
  return !page.collectionId && !page.draft && !page.archived;
}

function buildLiveUrl(domain: string, page: WebflowPageLite): string {
  const path = page.publishedPath || `/${page.slug}`;
  const clean = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${clean}${path}`;
}

// ─── Ollama client (Node) ───────────────────────────────────────────────────

function buildPrompt(signals: SchemaPageSignals): string {
  return `You are an SEO expert specializing in Schema.org structured data (JSON-LD).

Return ONLY a JSON object (no prose, no markdown fences):

{
  "pageType": "article|product|localbusiness|faq|howto|event|organization|webpage|other",
  "summary": "1-2 sentence description",
  "existing": [{ "type": "SchemaType", "raw": { ... }, "issues": ["..."] }],
  "recommended": [
    {
      "type": "SchemaType",
      "reason": "why this applies",
      "confidence": "high|medium|low",
      "jsonLd": { "@context": "https://schema.org", "@type": "...", ... }
    }
  ]
}

Rules: use real page values, do not invent ratings/prices, each jsonLd must be standalone Schema.org JSON-LD.

PAGE DATA:
URL: ${signals.url}
Title: ${signals.title ?? '(none)'}
Meta description: ${signals.metaDescription ?? '(none)'}
H1: ${JSON.stringify(signals.h1)}
H2: ${JSON.stringify(signals.h2)}
Images: ${JSON.stringify(signals.images.slice(0, 8))}
Existing JSON-LD: ${JSON.stringify(signals.existingJsonLd)}
Main text: ${signals.mainText}
`;
}

function normalizeResult(raw: unknown): SchemaAnalysisResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const existing = Array.isArray(obj.existing) ? obj.existing : [];
  const recommended = Array.isArray(obj.recommended) ? obj.recommended : [];

  return {
    pageType: typeof obj.pageType === 'string' ? obj.pageType : 'webpage',
    summary: typeof obj.summary === 'string' ? obj.summary : undefined,
    existing: existing.map((e) => {
      const item = (e ?? {}) as Record<string, unknown>;
      return {
        type: typeof item.type === 'string' ? item.type : 'Unknown',
        raw: (item.raw as Record<string, unknown>) ?? {},
        issues: Array.isArray(item.issues)
          ? (item.issues as unknown[]).filter(
              (s): s is string => typeof s === 'string'
            )
          : [],
      };
    }),
    recommended: recommended.map((r) => {
      const item = (r ?? {}) as Record<string, unknown>;
      const conf = item.confidence;
      return {
        type: typeof item.type === 'string' ? item.type : 'Thing',
        reason: typeof item.reason === 'string' ? item.reason : '',
        confidence:
          conf === 'high' || conf === 'medium' || conf === 'low'
            ? conf
            : 'medium',
        jsonLd: (item.jsonLd as Record<string, unknown>) ?? {},
      };
    }),
  };
}

async function runOllama(
  signals: SchemaPageSignals,
  baseUrl: string,
  model: string
): Promise<SchemaAnalysisResult> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: buildPrompt(signals),
      stream: false,
      format: 'json',
      options: { temperature: 0.2 },
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  }

  const payload = (await res.json()) as { response?: string };
  const raw = payload.response?.trim() ?? '';
  if (!raw) throw new Error('Ollama returned empty response');

  try {
    return normalizeResult(JSON.parse(raw));
  } catch {
    const stripped = raw
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();
    return normalizeResult(JSON.parse(stripped));
  }
}

// ─── commands ───────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('schema-gen')
  .description('Generate Schema.org recommendations for Webflow static pages using local Ollama + Gemma');

program
  .command('list')
  .description('List static pages discovered for a site')
  .option('--project <id>', 'Firestore project doc id (auto-fills site/token/domain)')
  .option('--site <id>', 'Webflow site id')
  .option('--token <t>', 'Webflow API token')
  .action(async (opts: { project?: string; site?: string; token?: string }) => {
    let siteId = opts.site;
    let token = opts.token || process.env.WEBFLOW_API_TOKEN;

    if (opts.project) {
      const cfg = await loadProjectConfig(opts.project);
      siteId = siteId || cfg.webflowConfig?.siteId;
      token = token || cfg.webflowConfig?.apiToken;
    }
    if (!siteId) { console.error('Missing --site'); process.exit(1); }
    if (!token) { console.error('Missing --token / WEBFLOW_API_TOKEN'); process.exit(1); }

    const pages = await fetchAllPages(siteId, token);
    const statics = pages.filter(isStaticCandidate);
    console.log(`Found ${statics.length} published static page(s) (of ${pages.length} total):\n`);
    for (const p of statics) {
      console.log(`  ${p.id}  ${p.publishedPath || '/' + p.slug}  — ${p.title}`);
    }
  });

program
  .command('generate')
  .description('Scrape each static page, run Ollama, and upload results to Firestore')
  .requiredOption('--project <id>', 'Firestore project doc id (required for upload)')
  .option('--site <id>', 'Webflow site id (falls back to project config)')
  .option('--token <t>', 'Webflow API token (falls back to project config)')
  .option('--domain <d>', 'Custom domain for live URLs (falls back to project config)')
  .option('--only <slugs>', 'Comma-separated slugs or publishedPaths to include')
  .option('--model <m>', 'Ollama model', process.env.OLLAMA_MODEL || 'gemma4:e4b')
  .option('--ollama-host <url>', 'Ollama base URL', process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434')
  .option('--force', 'Re-analyze even if cached by content hash')
  .option('--dry-run', 'Scrape + analyze but do not write to Firestore')
  .option('--concurrency <n>', 'Pages analyzed in parallel (keep low — Ollama is single-GPU)', '1')
  .action(async (opts: {
    project: string;
    site?: string;
    token?: string;
    domain?: string;
    only?: string;
    model: string;
    ollamaHost: string;
    force?: boolean;
    dryRun?: boolean;
    concurrency: string;
  }) => {
    const cfg = await loadProjectConfig(opts.project);
    const siteId = opts.site || cfg.webflowConfig?.siteId;
    const token = opts.token || cfg.webflowConfig?.apiToken || process.env.WEBFLOW_API_TOKEN;
    const domain = opts.domain || cfg.webflowConfig?.customDomain;

    if (!siteId) { console.error('Missing --site (not found in project config either)'); process.exit(1); }
    if (!token) { console.error('Missing Webflow token'); process.exit(1); }
    if (!domain) { console.error('Missing --domain (custom domain required — no .webflow.io fallback)'); process.exit(1); }

    const onlyFilter = opts.only
      ? new Set(opts.only.split(',').map((s) => s.trim()).filter(Boolean))
      : null;

    console.log(`Fetching pages for site ${siteId}…`);
    const allPages = await fetchAllPages(siteId, token);
    let targets = allPages.filter(isStaticCandidate);

    if (onlyFilter) {
      targets = targets.filter(
        (p) => onlyFilter.has(p.slug) || onlyFilter.has(p.publishedPath ?? '')
      );
    }

    if (targets.length === 0) {
      console.log('No static pages to process.');
      return;
    }

    console.log(`Processing ${targets.length} page(s) with model '${opts.model}' at ${opts.ollamaHost}\n`);

    const concurrency = Math.max(1, parseInt(opts.concurrency, 10) || 1);
    let processed = 0;
    let cached = 0;
    let uploaded = 0;
    let failed = 0;

    async function worker(page: WebflowPageLite): Promise<void> {
      const url = buildLiveUrl(domain!, page);
      const label = `[${++processed}/${targets.length}] ${page.title}`;
      try {
        console.log(`${label} → scraping ${url}`);
        const signals = await scrapePageSignals(url);
        const contentHash = computeContentHash(signals);
        const docId = `${page.id}_${contentHash}`;

        if (!opts.force) {
          const existing = await adminDb
            .collection(SCHEMA_COLLECTION)
            .doc(docId)
            .get();
          if (existing.exists) {
            cached++;
            console.log(`${label} ✓ cached, skipping`);
            return;
          }
        }

        console.log(`${label} → Ollama (${opts.model})`);
        const result = await runOllama(signals, opts.ollamaHost, opts.model);

        if (opts.dryRun) {
          console.log(
            `${label} [dry-run] would write ${result.recommended.length} recs, pageType=${result.pageType}`
          );
          return;
        }

        await adminDb.collection(SCHEMA_COLLECTION).doc(docId).set({
          pageId: page.id,
          projectId: opts.project,
          contentHash,
          url,
          result,
          model: opts.model,
          createdAt: Date.now(),
          source: 'cli',
        });

        uploaded++;
        console.log(
          `${label} ✓ wrote ${result.recommended.length} rec(s), pageType=${result.pageType}`
        );
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`${label} ✗ ${msg}`);
      }
    }

    // Simple pool.
    const queue = [...targets];
    async function spawn(): Promise<void> {
      while (queue.length) {
        const next = queue.shift();
        if (next) await worker(next);
      }
    }
    await Promise.all(Array.from({ length: concurrency }, spawn));

    console.log(
      `\nDone. uploaded=${uploaded} cached=${cached} failed=${failed} total=${targets.length}`
    );
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
