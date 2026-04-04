# CLAUDE.md — ActiveSet SEO Engine

## Project Overview

**ActiveSet SEO Engine** is an AI-powered content automation system that researches keywords, generates SEO-optimized blog posts using the Claude API, and publishes them to a Webflow CMS. It runs as a semi-automated daily pipeline: content is auto-generated and queued for human review before publishing.

**Owner:** Rehan Khurshid, Founder — ActiveSet Technologies
**Agency:** ActiveSet Technologies — Webflow Expert Partner agency (India)
**Site:** activeset.co (hosted on Webflow)
**Stack:** React dashboard (frontend) + Claude API (content generation) + Webflow CMS API v2 (publishing)

---

## Business Context

### About ActiveSet

ActiveSet is a Webflow Expert Partner agency based in India serving B2B SaaS, fintech, and financial services clients. The agency handles end-to-end web projects: strategy, design, Webflow development, SEO, content, and migrations.

**Key services:**
- Webflow design & development (including Enterprise)
- WordPress → Webflow migrations
- Programmatic SEO with Webflow CMS
- GSAP / SplitText / Lottie animations
- API integrations (Stripe, Zoho CRM, HubSpot, Webflow API)
- SEO auditing & content strategy
- Webflow maintenance & support

**Notable clients & projects:**
- Dhamma Capital — investor portal redesign (Zen-themed UI, Helvetica Neue + Playfair Display, navy/teal/steel blue palette)
- Privado.ai — SEO metadata audit (124 pages, avg score 89/100, Webflow API implementation)
- Nyuway.ai — AI security company website
- Orchid Pharma — website content (About Us, API Manufacturing pages)
- Kalaari Ventures — manifesto and website copy
- Presentations.AI — marketing copy (Black Friday campaign, homepage, blog)
- Limina — investment management software content (listicles, comparisons, landing pages)
- Repeat Builders — Webflow preloader animation (GSAP + Lottie, dot-flies-to-heading effect)
- Diamond Acquisitions — GCLID tracking implementation
- Interact Software — 1908-page migration analysis ($40K USD deal)
- Jen Clark Design — WordPress → Webflow migration with pSEO architecture

**Team size:** ~10 people
**Tech stack the team uses:** Webflow, Figma, GSAP, Stripe, Zoho CRM, HubSpot, ClickUp, Google Sheets

### SEO Goals

The engine exists to massively scale ActiveSet's organic presence by:
1. Targeting keywords potential clients search when looking for a Webflow agency
2. Publishing 1-3 SEO-optimized blog posts per day to the ActiveSet Webflow blog
3. Covering 3 target verticals: SaaS/B2B Tech, Fintech/Financial Services, General Webflow Agency
4. Ranking for both informational and commercial intent keywords
5. Optimizing for traditional SEO + Answer Engine Optimization (AEO) + Generative Engine Optimization (GEO)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   React Dashboard                        │
│  (Keyword Explorer → Content Generator → Review Queue)   │
└────────────┬──────────────────────┬─────────────────────┘
             │                      │
             ▼                      ▼
   ┌─────────────────┐    ┌─────────────────────┐
   │   Claude API     │    │   Webflow CMS API    │
   │  (Sonnet 4)      │    │   (v2 REST API)      │
   │                   │    │                      │
   │  System prompt    │    │  POST /collections/  │
   │  trained on       │    │  {id}/items          │
   │  ActiveSet brand  │    │                      │
   └─────────────────┘    └─────────────────────┘
```

### Data Flow

1. **Keyword Database** (embedded in app) → pre-researched keywords with volume, difficulty, CPC, intent, priority
2. **Topic Selection** → user picks from suggested topics OR enters custom topic + selects content template
3. **Claude API Call** → sends topic + template + system prompt → receives structured JSON blog post
4. **Review Queue** → generated post lands in queue with status "ready"
5. **Human Review** → preview with full content, SEO metadata sidebar, FAQ schema, internal links
6. **Publish to Webflow** → one-click POST to Webflow CMS collection via API v2
7. **Daily Automation** (configurable) → auto-picks topics from keyword DB, generates content, queues for review

---

## Claude API Integration

### Endpoint
```
POST https://api.anthropic.com/v1/messages
```

### Model
```
claude-sonnet-4-20250514
```

### System Prompt (critical — this is the "training")

The system prompt defines ActiveSet's brand voice, SEO rules, E-E-A-T guidelines, AEO/GEO optimization strategies, and output format. It must always be sent with every API call. Here is the full system prompt:

```
You are the senior content strategist and SEO writer for ActiveSet Technologies — a Webflow Expert Partner agency based in Bangalore, India.

## ABOUT ACTIVESET
- Webflow Expert Partner agency specializing in design, development, SEO, and migrations
- Serves SaaS, fintech, enterprise, and B2B clients globally
- Team of 10+ specialists covering Webflow development, GSAP animations, API integrations, SEO auditing, and content strategy
- Notable work includes: Webflow sites for investment platforms (Dhamma Capital), AI security companies (Nyuway.ai), privacy tech (Privado.ai), pharma (Orchid Pharma), VC firms (Kalaari Ventures), and SaaS tools (Presentations.AI, Slate, Limina)
- Technical capabilities: Webflow CMS architecture, programmatic SEO, GSAP/SplitText animations, Stripe integration, Zoho CRM forms, Chrome extensions for Webflow auditing, API-driven metadata auditing

## WRITING GUIDELINES
1. VOICE: Professional but approachable. Write like a senior developer explaining to a smart marketing director. No fluff, no filler paragraphs.
2. E-E-A-T: Every post must demonstrate Experience (reference real implementation details), Expertise (technical accuracy), Authoritativeness (cite specific tools, methods, metrics), and Trustworthiness (acknowledge limitations honestly).
3. SEO RULES:
   - Primary keyword in H1, first 100 words, one H2, meta title, and meta description
   - 2-3% keyword density (natural, never forced)
   - Include 3-5 LSI/related keywords throughout
   - Use question-based H2s where possible (targets featured snippets)
   - Include a FAQ section with 3-4 questions (targets PAA boxes)
   - Short paragraphs (2-3 sentences max)
   - Use <strong> for key terms, <em> for emphasis
4. STRUCTURE: Use proper HTML semantic tags. Every post needs:
   - A hook opening (stat, question, or bold claim)
   - Scannable subheadings every 200-300 words
   - At least one concrete example or mini case study
   - Actionable takeaways
   - A CTA mentioning ActiveSet's services
5. INTERNAL LINKING: Suggest 2-3 internal link placements pointing to ActiveSet service pages
6. CONTENT DIFFERENTIATION: Include at least ONE unique insight that competitors won't have — a specific Webflow technique, a real metric, a workflow tip from actual project experience
7. AEO/GEO OPTIMIZATION: Structure content with direct answers in the first paragraph under each H2, making it easy for AI search engines to extract and cite

## OUTPUT FORMAT
Return ONLY valid JSON (no backticks, no markdown, no preamble) with this exact structure:
{
  "title": "H1 title with primary keyword (50-65 chars ideal)",
  "slug": "url-slug-with-keyword",
  "metaTitle": "Meta title under 60 characters",
  "metaDescription": "Compelling meta description under 155 characters with keyword and CTA",
  "excerpt": "2-3 sentence excerpt for CMS cards and social sharing",
  "body": "Full HTML blog content with <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <blockquote> tags. Include FAQ section at end.",
  "primaryKeyword": "main target keyword",
  "secondaryKeywords": ["kw1", "kw2", "kw3", "kw4", "kw5"],
  "internalLinks": [{"text": "anchor text", "suggestedUrl": "/services/page"}],
  "faqSchema": [{"question": "Q?", "answer": "A"}],
  "estimatedReadTime": "X min read",
  "seoScore": 85
}
```

### User Message Template

```
Write a {template_label} about: "{topic}"

Target structure: {template_structure}
Target word count: {template_words}

Requirements:
- This must rank on Google for the target keyword
- Include genuine Webflow-specific insights that show real expertise
- Add FAQ section with schema-ready Q&As
- Suggest internal links to ActiveSet's services
- Make the opening hook impossible to skip
- Every section should provide actionable value
```

### Expected JSON Response Shape

```typescript
interface BlogPost {
  title: string;           // H1 title, 50-65 chars, includes primary keyword
  slug: string;            // URL-friendly slug
  metaTitle: string;       // Under 60 chars
  metaDescription: string; // Under 155 chars
  excerpt: string;         // 2-3 sentences for CMS cards
  body: string;            // Full HTML content with semantic tags
  primaryKeyword: string;
  secondaryKeywords: string[];
  internalLinks: { text: string; suggestedUrl: string }[];
  faqSchema: { question: string; answer: string }[];
  estimatedReadTime: string;
  seoScore: number;        // 0-100
}
```

---

## Webflow CMS API Integration

### Endpoint
```
POST https://api.webflow.com/v2/collections/{collectionId}/items
```

### Auth
```
Authorization: Bearer {WEBFLOW_API_TOKEN}
Content-Type: application/json
```

### Required CMS Collection Field Slugs

The Webflow Blog Posts collection MUST have these fields with these exact slugs:

| Field Name       | Slug               | Type      | Maps to              |
|------------------|---------------------|-----------|----------------------|
| Name             | `name`              | PlainText | `title`              |
| Slug             | `slug`              | PlainText | `slug`               |
| Post Body        | `post-body`         | RichText  | `body`               |
| Post Summary     | `post-summary`      | PlainText | `excerpt`            |
| Meta Title       | `meta-title`        | PlainText | `metaTitle`          |
| Meta Description | `meta-description`  | PlainText | `metaDescription`    |

### Publish Request Body

```json
{
  "isArchived": false,
  "isDraft": false,
  "fieldData": {
    "name": "Blog Post Title",
    "slug": "blog-post-slug",
    "post-body": "<h2>...</h2><p>...</p>",
    "post-summary": "Excerpt text",
    "meta-title": "Meta Title Here",
    "meta-description": "Meta description here"
  }
}
```

### Credentials Needed (user has these ready)
- `WEBFLOW_SITE_ID` — from Project Settings → General
- `WEBFLOW_COLLECTION_ID` — from CMS → Blog Posts → Collection Settings
- `WEBFLOW_API_TOKEN` — from webflow.com/dashboard → Integrations → API Token (v2)

---

## Keyword Database

### Structure

3 verticals, 36+ keywords total. Each keyword has:

```typescript
interface Keyword {
  kw: string;        // The keyword phrase
  vol: number;       // Monthly search volume estimate
  diff: number;      // Keyword difficulty (0-100)
  intent: string;    // "Commercial" | "Informational" | "Comparison"
  cpc: string;       // Cost per click estimate
  cluster: string;   // Topic cluster grouping
  priority: string;  // "high" | "medium" | "low"
}
```

### Verticals & Key Keywords

**SaaS & B2B Tech** (19 keywords)
- High priority: `webflow agency for saas` (1900/mo), `wordpress to webflow migration` (2400/mo), `webflow vs wordpress for saas` (1800/mo), `webflow seo optimization` (1600/mo), `best webflow agency india` (1100/mo), `webflow figma handoff` (1300/mo), `generative engine optimization` (1200/mo)

**Fintech & Financial Services** (7 keywords)
- High priority: `fintech website design agency` (680/mo), `stripe integration webflow` (740/mo)

**General Webflow Agency** (10 keywords)
- High priority: `hire webflow developer` (2800/mo), `webflow agency pricing` (2200/mo), `webflow development services` (1800/mo), `webflow migration services` (960/mo)

### Pre-Built Blog Topics (27 total)

Topics are organized by vertical and mapped to content templates. Examples:
- "Why SaaS Companies Are Migrating from WordPress to Webflow in 2026"
- "The Complete Guide to Programmatic SEO with Webflow CMS"
- "Webflow vs WordPress: Definitive Comparison for B2B SaaS (2026)"
- "Answer Engine Optimization: Preparing Your Webflow Site for AI Search"
- "How Much Does a Webflow Website Cost in 2026? Complete Pricing Breakdown"
- "Building Investor Portals with Webflow: From Design to Deployment"

---

## Content Templates

7 template types available:

| Template          | Word Count    | SEO Score | Structure                                    |
|-------------------|---------------|-----------|----------------------------------------------|
| How-To Guide      | 1,800–2,500   | 92        | Problem → Steps → Result → CTA               |
| Comparison        | 2,000–3,000   | 95        | Context → Feature matrix → Verdict            |
| Case Study        | 1,500–2,000   | 88        | Challenge → Approach → Results → Takeaways    |
| Listicle          | 2,000–3,500   | 85        | Intro → Ranked items → Summary                |
| Thought Leadership| 1,200–1,800   | 78        | Hot take → Evidence → Implications             |
| Technical Guide   | 2,500–4,000   | 90        | Problem → Context → Implementation → Code     |
| Pillar Page       | 4,000–6,000   | 97        | Overview → Deep sections → Internal links → FAQ|

---

## Daily Automation Workflow

### Mode: Semi-Automated (generate daily → human reviews → manual publish)

```
┌──────────────────────────────────────────────────┐
│  DAILY CRON (configurable time, default 9 AM IST) │
│                                                    │
│  1. Pick N topics from keyword DB                  │
│     (rotate through verticals, prioritize          │
│      high-priority unused keywords)                │
│                                                    │
│  2. For each topic:                                │
│     → Select best-fit content template             │
│     → Call Claude API with system prompt            │
│     → Parse JSON response                          │
│     → Validate: title length, meta desc length,    │
│       slug format, body word count                 │
│     → Add to queue with status "ready"             │
│                                                    │
│  3. Notify (optional): send Slack/email that       │
│     N posts are ready for review                   │
│                                                    │
│  4. HUMAN REVIEWS in dashboard:                    │
│     → Read content in preview mode                 │
│     → Check SEO metadata sidebar                   │
│     → Edit if needed                               │
│     → Click "Publish to Webflow"                   │
└──────────────────────────────────────────────────┘
```

### Configuration

```typescript
interface AutomationConfig {
  enabled: boolean;
  time: string;       // "09:00" (IST)
  postsPerDay: number; // 1-3
  autoPublish: boolean; // false (semi-auto mode)
}
```

---

## File Structure (recommended for full project)

```
activeset-seo-engine/
├── CLAUDE.md                    # This file — project context
├── package.json
├── .env                         # API keys (never commit)
│   ├── ANTHROPIC_API_KEY=sk-ant-...
│   ├── WEBFLOW_API_TOKEN=...
│   ├── WEBFLOW_SITE_ID=...
│   └── WEBFLOW_COLLECTION_ID=...
├── src/
│   ├── App.jsx                  # Main dashboard (React)
│   ├── components/
│   │   ├── Dashboard.jsx        # Overview stats & quick actions
│   │   ├── KeywordExplorer.jsx  # Keyword table with filters/sort
│   │   ├── ContentGenerator.jsx # Topic input + template selection + generate
│   │   ├── ContentQueue.jsx     # Queue list with status management
│   │   ├── ContentPreview.jsx   # Full preview with SEO sidebar
│   │   └── Settings.jsx         # API config + automation settings
│   ├── lib/
│   │   ├── claude.js            # Claude API wrapper
│   │   ├── webflow.js           # Webflow CMS API wrapper
│   │   ├── keywords.js          # Keyword database + selection logic
│   │   └── templates.js         # Content template definitions
│   ├── prompts/
│   │   └── system-prompt.txt    # The trained system prompt (versioned)
│   └── data/
│       └── keywords.json        # Keyword database
├── scripts/
│   ├── daily-generate.js        # Node.js cron script for daily generation
│   └── bulk-publish.js          # Batch publish all "ready" posts
└── README.md
```

---

## Environment Variables

```env
# Claude API
ANTHROPIC_API_KEY=sk-ant-api03-...

# Webflow CMS
WEBFLOW_SITE_ID=...
WEBFLOW_COLLECTION_ID=...
WEBFLOW_API_TOKEN=...

# Automation
DAILY_GENERATE_TIME=09:00        # IST
POSTS_PER_DAY=1
AUTO_PUBLISH=false               # Semi-auto: queue for review
```

---

## Key Implementation Notes

1. **Claude API calls are made from the browser** in the current React dashboard artifact. For the production Node.js cron version, calls should be server-side with the API key in `.env`.

2. **Content parsing**: Claude sometimes wraps JSON in backticks or adds preamble. Always strip ```json and ``` before parsing. Have a fallback that creates a basic structure from raw text if JSON parsing fails.

3. **Webflow field mapping**: The CMS field slugs (`post-body`, `post-summary`, `meta-title`, `meta-description`) must exactly match the slugs in the Webflow collection. If the user's collection has different slugs, the mapping needs updating.

4. **Rate limits**: Claude API has rate limits based on the user's plan. Webflow API v2 has a rate limit of 60 requests/minute. Build in retry logic with exponential backoff.

5. **Topic rotation**: The daily automation should track which topics/keywords have been used and rotate through unused ones. Avoid generating duplicate content for the same keyword.

6. **SEO differentiation**: The system prompt instructs Claude to include at least one unique insight per post that competitors won't have — this is critical for E-E-A-T and ranking. Rehan should periodically update the system prompt with new project case studies, metrics, and techniques from real client work.

7. **FAQ Schema**: Generated posts include `faqSchema` array. On the Webflow side, this should be injected as JSON-LD structured data in the blog post template's custom code section.

8. **AEO/GEO optimization**: Content is structured with direct answers in the first paragraph under each H2. This makes it extractable by AI search engines (ChatGPT, Perplexity, Google AI Overviews). This is a major SEO trend for 2026.

---

## Future Enhancements

- [ ] Google Search Console API integration for real keyword data
- [ ] Webflow Analytics API for tracking published post performance
- [ ] Auto-update keyword database from Google Keyword Planner API
- [ ] Slack/Discord notifications when content is queued
- [ ] A/B test different title variants via Claude API
- [ ] Image generation (DALL-E / Flux) for featured images
- [ ] Auto-generate social media posts (LinkedIn, Twitter) from blog content
- [ ] Content calendar view with drag-and-drop scheduling
- [ ] Competitor content gap analysis via web scraping
- [ ] Internal link graph visualization
- [ ] Webflow MCP server integration for direct site manipulation