/**
 * The deliverables SOPs: "SEO & AEO" and "Analytics & Tracking".
 *
 * Rehan, 2026-10-01: the project sheet should read like the Dreamteam Website
 * Plan (bands of numbered deliverables with owner, priority, status, week and
 * notes), with SEO and AEO on one tab. The deliverables come from that plan's
 * Technical SEO, Technical AEO and Analytics tabs, plus what the Peak XV &
 * Surge SEO + AEO trackers checked that the plan did not, made generic.
 *
 * Neither SOP is tagged with a service: picking a project's Development SOP
 * takes the first in that group, and these are added to a project on purpose.
 *
 *   npx tsx --tsconfig scripts/tsconfig.server-scripts.json scripts/seed-seo-aeo-sops.ts          # dry run
 *   … --write                                                                                    # create the missing ones
 *   … --write --replace                                                                          # replace their sections too
 */
import '@/lib/load-env';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import type { DeliverableOwner, DeliverablePriority, SOPTemplate } from '@/types';

const WRITE = process.argv.includes('--write');
const REPLACE = process.argv.includes('--replace');

type D = [title: string, priority: DeliverablePriority, week: string, notes?: string, owner?: DeliverableOwner];
interface S { title: string; emoji: string; sheetTab: string; summary: string; items: D[] }

function sop(name: string, icon: string, description: string, sections: S[]): Omit<SOPTemplate, 'id'> {
  return {
    name,
    icon,
    description,
    sections: sections.map((s, order) => ({
      title: s.title,
      emoji: s.emoji,
      sheetTab: s.sheetTab,
      summary: s.summary,
      order,
      items: s.items.map(([title, priority, week, notes, owner], i) => ({
        title,
        status: 'not_started' as const,
        order: i,
        priority,
        week,
        ...(notes ? { notes } : {}),
        ...(owner && owner !== 'activeset' ? { owner } : {}),
      })),
    })),
  } as Omit<SOPTemplate, 'id'>;
}

const SEO_AEO = sop('SEO & AEO', '🔎', 'Technical SEO and AEO deliverables, and the before/after measurement that shows they worked. Keyword, content and messaging strategy stay with the client.', [
  {
    title: 'Technical SEO',
    emoji: '🧭',
    sheetTab: 'SEO & AEO',
    summary: "Technical health only. Keyword and content strategy sit with the client's marketing.",
    items: [
      ['Crawl the site: URLs, status codes, canonicals, indexability', 'P0', '1', 'Crawl plus sitemap cross-check'],
      ['Title, meta description and H1 on every page', 'P0', '2', 'Copy approved by the client'],
      ['Sitemap validated, listed in robots.txt and submitted in Search Console', 'P0', '2'],
      ['Redirects and canonicals: trailing slash, www, http; no chains or loops; old URLs mapped one by one', 'P1', '2'],
      ['Real 404s; test, style-guide and staging pages noindexed and out of the sitemap', 'P1', '2'],
      ['Images: WebP/AVIF, width and height set, LCP image not lazy-loaded, descriptive file names and alt text', 'P1', '2'],
      ['Core Web Vitals audit and fixes: LCP, CLS, INP, per template', 'P0', '3'],
      ['Font loading, script deferral and unused CSS cleanup', 'P1', '3'],
      ['Open Graph and Twitter cards per page and CMS item', 'P1', '3'],
      ['Internal links: no orphan pages, descriptive anchor text, broken links fixed (CMS rich text included)', 'P1', '3'],
      ['Accessibility pass: form labels, keyboard use, skip link, named icon links, 48px tap targets, reduced motion', 'P1', '4'],
      ['Mobile layout checked at 320, 390, 768 and 1440px', 'P1', '4'],
      ['CMS lists crawlable without duplicate query-string URLs; thin CMS templates expanded', 'P2', '4'],
      ['Hosting headers: compression, HTML caching, HSTS', 'P2', '4'],
      ['Monthly technical SEO health check', 'P1', 'Monthly'],
    ],
  },
  {
    title: 'Technical AEO',
    emoji: '🤖',
    sheetTab: 'SEO & AEO',
    summary: "Crawl access, schema and structure so AI engines can read the site. Messaging sits with the client's marketing.",
    items: [
      ['AI crawler access: robots.txt, meta robots and headers for GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, Google-Extended, Bingbot', 'P0', '1', 'Ensure AI crawlers are not blocked; record the search vs training bot policy'],
      ['Baseline test: how ChatGPT, Perplexity, Gemini and Google AI Overviews describe the brand', 'P0', '1', 'Measurement only'],
      ['Organization and WebSite schema: one @id, sameAs links, logo at least 112px, legal name, founding date, address', 'P0', '2'],
      ['Product schema (SoftwareApplication or the right type) on product pages', 'P0', '2'],
      ['FAQPage schema on FAQ blocks, questions as headings, validated in the Rich Results Test', 'P0', '2'],
      ['Person schema for founders and authors', 'P1', '2'],
      ['BreadcrumbList schema with visible breadcrumbs', 'P1', '3'],
      ['Schema matches the page: nothing absent from it, nothing copied between pages, absolute URLs', 'P1', '3'],
      ['Clean HTML: one H1, semantic headings, content in the server-rendered HTML, no hidden duplicates', 'P1', '3'],
      ['Article or BlogPosting schema with published and modified dates and an author', 'P1', '4'],
      ['Facts consistent across copy, meta and schema, with as-of dates on numbers', 'P1', '4'],
      ['Schema on CMS templates and landing pages; VideoObject and ItemList where they fit', 'P1', '5-6'],
      ['llms.txt and a clean text sitemap for AI retrieval', 'P2', '5'],
      ['Monthly AI retrieval re-test', 'P1', 'Monthly', "Content actions decided by the client's marketing"],
    ],
  },
  {
    title: 'Measurement',
    emoji: '📈',
    sheetTab: 'SEO & AEO',
    summary: 'Before and after, so every fix shows its effect.',
    items: [
      ['Per-page baseline before changes: title, description, H1, status code, Core Web Vitals', 'P0', '1'],
      ['Change log that keeps saved, published and verified apart', 'P1', '1'],
      ['Re-scan after fixes with the same settings', 'P1', '4'],
      ['Search Console: matched 28-day comparison by page, device and country', 'P1', '6'],
      ['Field Core Web Vitals per template, with a 3-run lab median', 'P2', '6'],
    ],
  },
]);

const ANALYTICS = sop('Analytics & Tracking', '📊', "Measurement setup so the client's marketing has clean data: access, GA4 and GTM, events, conversions, heatmaps and CRM routing.", [
  {
    title: 'Analytics & Tracking',
    emoji: '📊',
    sheetTab: 'Analytics & Tracking',
    summary: "Measurement setup so the client's marketing has clean data. ActiveSet implements; the client decides what to do with it.",
    items: [
      ['Grant access: GA4 (Editor), GTM (Publish), Search Console (Full), Webflow (Site Manager)', 'P0', '1', 'Blocker for everything below', 'client'],
      ['Audit the GTM container: tags, triggers, variables', 'P0', '1'],
      ['Verify the GA4 property, data streams and cross-domain settings', 'P0', '1'],
      ['Form submission events on the success state', 'P0', '2', 'Counts real submissions only'],
      ['Conversions marked in GA4, with a source > landing page > conversion report', 'P0', '2'],
      ['Scroll depth and section visibility events on key pages', 'P1', '2'],
      ['Video engagement events: play, 50%, complete', 'P1', '2'],
      ['Webflow Analytics on and reconciled with GA4', 'P1', '2'],
      ['Microsoft Clarity heatmaps and session recordings', 'P1', '2', "Access shared with the client's marketing"],
      ['Form routing to the CRM with source, UTM and page fields', 'P0', '3', 'Client confirms the destination', 'joint'],
      ['A/B test setup with conversion goals, ready for marketing to use', 'P1', '3'],
    ],
  },
]);

async function main() {
  const existing = await db.collection(COLLECTIONS.SOP_TEMPLATES).get();
  for (const template of [SEO_AEO, ANALYTICS]) {
    const found = existing.docs.find((d) => d.get('name') === template.name);
    const count = template.sections.reduce((n, s) => n + s.items.length, 0);
    if (found && !REPLACE) {
      console.log(`· ${template.name} exists (${found.id}); pass --replace to rewrite its sections`);
      continue;
    }
    console.log(`${WRITE ? '✓' : '·'} ${found ? 'Replace' : 'Create'} ${template.name}: ${template.sections.map((s) => `${s.title} (${s.items.length})`).join(', ')} = ${count}`);
    if (!WRITE) continue;
    const data = JSON.parse(JSON.stringify(template));
    if (found) await found.ref.update({ sections: data.sections, description: data.description, icon: data.icon });
    else await db.collection(COLLECTIONS.SOP_TEMPLATES).add({ ...data, createdAt: Timestamp.now() });
  }
  if (!WRITE) console.log('\nDry run. Pass --write to apply.');
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
