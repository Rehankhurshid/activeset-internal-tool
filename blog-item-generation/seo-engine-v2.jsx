import { useState, useEffect, useCallback, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════════
   ACTIVESET SEO ENGINE — AI Content Automation for Webflow CMS
   Built for: ActiveSet Technologies (Webflow Expert Partner)
   Stack: Claude API → Review Dashboard → Webflow CMS API
   ═══════════════════════════════════════════════════════════════════ */

// ─── KEYWORD INTELLIGENCE DATABASE ────────────────────────────────
const KEYWORD_DB = {
  "SaaS & B2B Tech": {
    color: "#4ECDC4",
    keywords: [
      { kw: "webflow agency for saas", vol: 1900, diff: 42, intent: "Commercial", cpc: "$12.40", cluster: "Services", priority: "high" },
      { kw: "wordpress to webflow migration", vol: 2400, diff: 35, intent: "Informational", cpc: "$8.20", cluster: "Migration", priority: "high" },
      { kw: "webflow vs wordpress for saas", vol: 1800, diff: 38, intent: "Comparison", cpc: "$6.50", cluster: "Migration", priority: "high" },
      { kw: "webflow seo optimization", vol: 1600, diff: 30, intent: "Informational", cpc: "$5.80", cluster: "SEO", priority: "high" },
      { kw: "programmatic seo webflow", vol: 880, diff: 25, intent: "Informational", cpc: "$7.10", cluster: "SEO", priority: "medium" },
      { kw: "webflow enterprise development", vol: 720, diff: 52, intent: "Commercial", cpc: "$18.60", cluster: "Services", priority: "medium" },
      { kw: "saas website redesign agency", vol: 590, diff: 45, intent: "Commercial", cpc: "$22.30", cluster: "Services", priority: "medium" },
      { kw: "webflow cms for b2b", vol: 480, diff: 22, intent: "Informational", cpc: "$4.90", cluster: "CMS", priority: "medium" },
      { kw: "webflow gsap animations tutorial", vol: 390, diff: 18, intent: "Informational", cpc: "$2.10", cluster: "Dev", priority: "low" },
      { kw: "webflow api integration", vol: 520, diff: 20, intent: "Informational", cpc: "$3.40", cluster: "Dev", priority: "medium" },
      { kw: "best webflow agency india", vol: 1100, diff: 40, intent: "Commercial", cpc: "$9.80", cluster: "Services", priority: "high" },
      { kw: "webflow expert partner", vol: 440, diff: 28, intent: "Commercial", cpc: "$11.20", cluster: "Services", priority: "medium" },
      { kw: "webflow landing page optimization", vol: 670, diff: 26, intent: "Informational", cpc: "$5.40", cluster: "CRO", priority: "medium" },
      { kw: "webflow schema markup", vol: 320, diff: 15, intent: "Informational", cpc: "$2.80", cluster: "SEO", priority: "low" },
      { kw: "webflow core web vitals", vol: 540, diff: 22, intent: "Informational", cpc: "$4.20", cluster: "SEO", priority: "medium" },
      { kw: "webflow figma handoff", vol: 1300, diff: 20, intent: "Informational", cpc: "$3.60", cluster: "Design", priority: "high" },
      { kw: "webflow client first methodology", vol: 260, diff: 12, intent: "Informational", cpc: "$1.90", cluster: "Dev", priority: "low" },
      { kw: "answer engine optimization webflow", vol: 340, diff: 14, intent: "Informational", cpc: "$6.80", cluster: "SEO", priority: "medium" },
      { kw: "generative engine optimization", vol: 1200, diff: 18, intent: "Informational", cpc: "$8.50", cluster: "SEO", priority: "high" },
    ],
    topics: [
      "Why SaaS Companies Are Migrating from WordPress to Webflow in 2026",
      "The Complete Guide to Programmatic SEO with Webflow CMS",
      "How We Increased a SaaS Client's Organic Traffic by 340% Using Webflow",
      "Webflow vs WordPress: Definitive Comparison for B2B SaaS (2026)",
      "10 Webflow SEO Settings Most Agencies Get Wrong",
      "Building High-Converting SaaS Landing Pages in Webflow: A Developer's Playbook",
      "How to Implement Schema Markup in Webflow Without Custom Code",
      "Webflow CMS Architecture: Scalable Content Models for Enterprise",
      "GSAP Animation Performance in Webflow: Avoiding the Pitfalls",
      "Answer Engine Optimization: Preparing Your Webflow Site for AI Search",
      "Generative Engine Optimization (GEO): How to Rank in ChatGPT & Perplexity",
      "Figma to Webflow: The Complete Design-to-Dev Handoff Workflow",
      "The True 3-Year TCO: WordPress vs Webflow for Growing SaaS Companies",
    ],
  },
  "Fintech & Financial Services": {
    color: "#FFD93D",
    keywords: [
      { kw: "fintech website design agency", vol: 680, diff: 44, intent: "Commercial", cpc: "$24.50", cluster: "Services", priority: "high" },
      { kw: "webflow for financial services", vol: 420, diff: 28, intent: "Informational", cpc: "$8.90", cluster: "Industry", priority: "medium" },
      { kw: "investor portal webflow", vol: 190, diff: 16, intent: "Informational", cpc: "$12.30", cluster: "Dev", priority: "low" },
      { kw: "compliance website design", vol: 380, diff: 38, intent: "Commercial", cpc: "$16.70", cluster: "Industry", priority: "medium" },
      { kw: "fintech landing page design", vol: 520, diff: 32, intent: "Informational", cpc: "$14.20", cluster: "CRO", priority: "medium" },
      { kw: "stripe integration webflow", vol: 740, diff: 18, intent: "Informational", cpc: "$5.60", cluster: "Dev", priority: "high" },
      { kw: "wealth management website design", vol: 310, diff: 42, intent: "Commercial", cpc: "$28.40", cluster: "Industry", priority: "medium" },
    ],
    topics: [
      "Why Fintech Startups Choose Webflow Over Custom Development",
      "Building Investor Portals with Webflow: From Design to Deployment",
      "Stripe Payment Integration in Webflow: ACH, Cards & Subscription Billing",
      "Designing for Trust: Financial Services Website UX Best Practices",
      "How to Build a Compliance-Ready Fintech Website in Webflow",
      "Webflow for Wealth Management: Case Study & Implementation Guide",
    ],
  },
  "General Webflow Agency": {
    color: "#FF6B6B",
    keywords: [
      { kw: "hire webflow developer", vol: 2800, diff: 55, intent: "Commercial", cpc: "$15.80", cluster: "Services", priority: "high" },
      { kw: "webflow agency pricing", vol: 2200, diff: 48, intent: "Commercial", cpc: "$12.60", cluster: "Services", priority: "high" },
      { kw: "webflow development services", vol: 1800, diff: 52, intent: "Commercial", cpc: "$14.90", cluster: "Services", priority: "high" },
      { kw: "webflow migration services", vol: 960, diff: 38, intent: "Commercial", cpc: "$11.40", cluster: "Migration", priority: "high" },
      { kw: "webflow website maintenance", vol: 580, diff: 22, intent: "Commercial", cpc: "$8.20", cluster: "Services", priority: "medium" },
      { kw: "webflow ecommerce development", vol: 720, diff: 40, intent: "Commercial", cpc: "$13.50", cluster: "Services", priority: "medium" },
      { kw: "no code website agency", vol: 640, diff: 35, intent: "Commercial", cpc: "$10.80", cluster: "Services", priority: "medium" },
      { kw: "webflow accessibility wcag", vol: 280, diff: 15, intent: "Informational", cpc: "$3.20", cluster: "Dev", priority: "low" },
      { kw: "webflow custom code solutions", vol: 460, diff: 18, intent: "Informational", cpc: "$4.50", cluster: "Dev", priority: "medium" },
      { kw: "webflow zoho crm integration", vol: 210, diff: 12, intent: "Informational", cpc: "$6.30", cluster: "Dev", priority: "low" },
    ],
    topics: [
      "How Much Does a Webflow Website Cost in 2026? Complete Pricing Breakdown",
      "How to Choose the Right Webflow Agency (From an Agency Owner's Perspective)",
      "Webflow Accessibility: Achieving WCAG Compliance Without Custom Code",
      "Webflow E-commerce: Is It Ready for Serious Online Stores?",
      "The Complete Guide to Webflow Website Maintenance & Support",
      "Zoho CRM + Webflow: Complete Integration Guide for Lead Capture",
      "Why No-Code Agencies Are Replacing Traditional Dev Shops",
      "Webflow Custom Code: When You Need It and When You Don't",
    ],
  },
};

const TEMPLATES = {
  "how-to": { label: "How-To Guide", icon: "📘", words: "1,800–2,500", seo: 92, structure: "Problem → Steps → Result → CTA" },
  "comparison": { label: "Comparison", icon: "⚖️", words: "2,000–3,000", seo: 95, structure: "Context → Feature matrix → Verdict" },
  "case-study": { label: "Case Study", icon: "📊", words: "1,500–2,000", seo: 88, structure: "Challenge → Approach → Results → Takeaways" },
  "listicle": { label: "Listicle", icon: "📋", words: "2,000–3,500", seo: 85, structure: "Intro → Ranked items → Summary" },
  "thought-leader": { label: "Thought Leadership", icon: "💡", words: "1,200–1,800", seo: 78, structure: "Hot take → Evidence → Implications" },
  "technical": { label: "Technical Guide", icon: "🔧", words: "2,500–4,000", seo: 90, structure: "Problem → Context → Implementation → Code" },
  "pillar": { label: "Pillar Page", icon: "🏛️", words: "4,000–6,000", seo: 97, structure: "Overview → Deep sections → Internal links → FAQ" },
};

// ─── CLAUDE API SYSTEM PROMPT (the "training") ───────────────────
const SYSTEM_PROMPT = `You are the senior content strategist and SEO writer for ActiveSet Technologies — a Webflow Expert Partner agency based in Bangalore, India.

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
}`;

// ─── UTILITY COMPONENTS ──────────────────────────────────────────
const Pill = ({ children, bg = "rgba(255,255,255,0.06)", color = "#999", ...props }) => (
  <span style={{ padding: "3px 9px", borderRadius: "4px", fontSize: "10px", fontWeight: 600, letterSpacing: "0.4px", background: bg, color, display: "inline-block", ...props.style }}>{children}</span>
);

const DiffBar = ({ value }) => {
  const c = value < 25 ? "#4ECDC4" : value < 40 ? "#FFD93D" : value < 55 ? "#FF8C42" : "#FF6B6B";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div style={{ width: "48px", height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.06)" }}>
        <div style={{ width: `${value}%`, height: "100%", borderRadius: "2px", background: c, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: "10px", color: c, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace", minWidth: "20px" }}>{value}</span>
    </div>
  );
};

const Spinner = () => (
  <span style={{ display: "inline-block", width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.15)", borderTopColor: "#4ECDC4", borderRadius: "50%", animation: "spin 0.8s linear infinite", verticalAlign: "middle" }} />
);

// ─── MAIN APP ────────────────────────────────────────────────────
export default function ActiveSetSEO() {
  const [tab, setTab] = useState("dashboard");
  const [vertical, setVertical] = useState("all");
  const [search, setSearch] = useState("");
  const [queue, setQueue] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState("");
  const [selectedTopic, setSelectedTopic] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("how-to");
  const [previewItem, setPreviewItem] = useState(null);
  const [config, setConfig] = useState({ siteId: "", collectionId: "", apiToken: "", claudeKey: "" });
  const [showConfig, setShowConfig] = useState(false);
  const [automation, setAutomation] = useState({ enabled: false, time: "09:00", perDay: 1, autoPublish: false });
  const [publishingId, setPublishingId] = useState(null);
  const [sortBy, setSortBy] = useState("priority");
  const [editingContent, setEditingContent] = useState(null);

  // Flatten all keywords
  const allKws = Object.entries(KEYWORD_DB).flatMap(([v, d]) =>
    d.keywords.map(k => ({ ...k, vertical: v, vColor: d.color }))
  );

  const filteredKws = allKws
    .filter(k => (vertical === "all" || k.vertical === vertical) && (!search || k.kw.includes(search.toLowerCase())))
    .sort((a, b) => {
      if (sortBy === "volume") return b.vol - a.vol;
      if (sortBy === "difficulty") return a.diff - b.diff;
      if (sortBy === "cpc") return parseFloat(b.cpc.replace("$", "")) - parseFloat(a.cpc.replace("$", ""));
      const p = { high: 3, medium: 2, low: 1 };
      return (p[b.priority] || 0) - (p[a.priority] || 0);
    });

  const allTopics = Object.entries(KEYWORD_DB).flatMap(([v, d]) =>
    d.topics.map(t => ({ title: t, vertical: v, color: d.color }))
  );

  const stats = {
    keywords: allKws.length,
    highPriority: allKws.filter(k => k.priority === "high").length,
    queued: queue.filter(q => q.status === "ready").length,
    published: queue.filter(q => q.status === "published").length,
    totalWords: queue.reduce((s, q) => s + (q.wordCount || 0), 0),
  };

  // ─── CONTENT GENERATION ──────────────────────────────────────
  const generateContent = async (topic, template) => {
    if (!topic) return;
    setGenerating(true);
    setGenProgress("Analyzing keyword intent & competition...");

    try {
      await new Promise(r => setTimeout(r, 800));
      setGenProgress("Generating SEO-optimized content via Claude API...");

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          messages: [{
            role: "user",
            content: `Write a ${TEMPLATES[template]?.label || "blog post"} about: "${topic}"

Target structure: ${TEMPLATES[template]?.structure || "Intro → Body → CTA"}
Target word count: ${TEMPLATES[template]?.words || "1,800-2,500"}

Requirements:
- This must rank on Google for the target keyword
- Include genuine Webflow-specific insights that show real expertise
- Add FAQ section with schema-ready Q&As
- Suggest internal links to ActiveSet's services
- Make the opening hook impossible to skip
- Every section should provide actionable value`
          }],
        }),
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const data = await response.json();
      const text = data.content?.map(i => i.text || "").join("") || "";
      const clean = text.replace(/```json|```/g, "").trim();

      setGenProgress("Parsing and scoring content...");

      let parsed;
      try {
        parsed = JSON.parse(clean);
      } catch {
        parsed = {
          title: topic,
          slug: topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
          metaTitle: topic.substring(0, 60),
          metaDescription: `Expert guide on ${topic} from ActiveSet, a Webflow Expert Partner agency.`,
          excerpt: `A comprehensive guide about ${topic} by ActiveSet Technologies.`,
          body: `<h2>${topic}</h2>${text.split("\n").map(p => `<p>${p}</p>`).join("")}`,
          primaryKeyword: topic.toLowerCase(),
          secondaryKeywords: [],
          internalLinks: [],
          faqSchema: [],
          estimatedReadTime: "5 min",
          seoScore: 72,
        };
      }

      const item = {
        id: Date.now(),
        ...parsed,
        template,
        vertical: Object.entries(KEYWORD_DB).find(([_, d]) => d.topics.includes(topic))?.[0] || "General",
        status: "ready",
        createdAt: new Date().toISOString(),
        wordCount: (parsed.body || "").split(/\s+/).length,
      };

      setQueue(prev => [item, ...prev]);
      setPreviewItem(item);
      setTab("preview");
      setGenProgress("");
      setGenerating(false);
      return item;

    } catch (err) {
      console.error(err);
      setGenProgress(`Error: ${err.message}. Check your Claude API key in settings.`);
      setTimeout(() => { setGenerating(false); setGenProgress(""); }, 3000);
    }
  };

  // ─── WEBFLOW PUBLISH ─────────────────────────────────────────
  const publishToWebflow = async (item) => {
    if (!config.siteId || !config.collectionId || !config.apiToken) {
      setShowConfig(true);
      return;
    }

    setPublishingId(item.id);

    try {
      const res = await fetch(
        `https://api.webflow.com/v2/collections/${config.collectionId}/items`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${config.apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            isArchived: false,
            isDraft: false,
            fieldData: {
              name: item.title,
              slug: item.slug,
              "post-body": item.body,
              "post-summary": item.excerpt,
              "meta-title": item.metaTitle,
              "meta-description": item.metaDescription,
            },
          }),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Webflow API returned ${res.status}`);
      }

      setQueue(prev => prev.map(q =>
        q.id === item.id ? { ...q, status: "published", publishedAt: new Date().toISOString() } : q
      ));
      if (previewItem?.id === item.id) setPreviewItem(p => ({ ...p, status: "published", publishedAt: new Date().toISOString() }));

    } catch (err) {
      console.error(err);
      alert(`Publish failed: ${err.message}\n\nMake sure your field slugs match: name, slug, post-body, post-summary, meta-title, meta-description`);
    }

    setPublishingId(null);
  };

  // ─── STYLES ──────────────────────────────────────────────────
  const css = {
    root: { minHeight: "100vh", background: "#08080C", color: "#D4D4DC", fontFamily: "'Outfit', 'Satoshi', system-ui, sans-serif" },
    card: { background: "rgba(255,255,255,0.025)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.05)" },
    input: { width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.3)", color: "#D4D4DC", fontSize: "13px", fontFamily: "inherit", boxSizing: "border-box", outline: "none" },
    btnPrimary: { padding: "10px 20px", borderRadius: "8px", border: "none", background: "linear-gradient(135deg, #4ECDC4, #2AB7AD)", color: "#08080C", fontSize: "13px", fontWeight: 700, cursor: "pointer", letterSpacing: "0.2px" },
    btnGhost: { padding: "6px 14px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#888", fontSize: "11px", fontWeight: 600, cursor: "pointer" },
    accent: "#4ECDC4",
    muted: "#555560",
    dim: "#333340",
  };

  const tabs = [
    { id: "dashboard", label: "Overview", icon: "◆" },
    { id: "keywords", label: "Keywords", icon: "◈" },
    { id: "generate", label: "Generate", icon: "✦" },
    { id: "queue", label: "Queue", count: stats.queued },
    { id: "preview", label: "Preview", hide: !previewItem },
    { id: "settings", label: "Settings", icon: "⚙" },
  ];

  return (
    <div style={css.root}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.5 } }
        input:focus, textarea:focus, select:focus { border-color: rgba(78,205,196,0.4) !important; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
        ::selection { background: rgba(78,205,196,0.25); }
      `}</style>

      {/* ─── HEADER ─────────────────────────────────────────────── */}
      <header style={{ padding: "16px 28px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(8,8,12,0.95)", position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(12px)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: "1280px", margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "linear-gradient(135deg, #4ECDC4, #2AB7AD)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 800, color: "#08080C" }}>A</div>
            <div>
              <h1 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#EDEDF0", letterSpacing: "-0.3px" }}>ActiveSet SEO Engine</h1>
              <p style={{ margin: 0, fontSize: "10px", color: css.muted, fontWeight: 500, letterSpacing: "0.5px" }}>CLAUDE API → REVIEW → WEBFLOW CMS</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ padding: "5px 12px", borderRadius: "6px", fontSize: "10px", fontWeight: 600, background: automation.enabled ? "rgba(78,205,196,0.1)" : "rgba(255,255,255,0.03)", color: automation.enabled ? "#4ECDC4" : css.muted, border: `1px solid ${automation.enabled ? "rgba(78,205,196,0.2)" : "rgba(255,255,255,0.05)"}` }}>
              {automation.enabled ? `● Daily at ${automation.time} IST` : "○ Manual mode"}
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ display: "flex", gap: "2px", marginTop: "14px", maxWidth: "1280px", margin: "14px auto 0" }}>
          {tabs.filter(t => !t.hide).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "7px 14px", borderRadius: "6px", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer",
              background: tab === t.id ? "rgba(78,205,196,0.1)" : "transparent",
              color: tab === t.id ? "#4ECDC4" : "#666",
              transition: "all 0.15s",
            }}>
              {t.icon && <span style={{ marginRight: "4px", fontSize: "10px" }}>{t.icon}</span>}
              {t.label}
              {t.count > 0 && <span style={{ marginLeft: "5px", padding: "1px 6px", borderRadius: "8px", background: "rgba(78,205,196,0.15)", fontSize: "9px", color: "#4ECDC4" }}>{t.count}</span>}
            </button>
          ))}
        </nav>
      </header>

      {/* ─── CONTENT ────────────────────────────────────────────── */}
      <main style={{ padding: "24px 28px 60px", maxWidth: "1280px", margin: "0 auto" }}>

        {/* ══ DASHBOARD ══ */}
        {tab === "dashboard" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px", marginBottom: "28px" }}>
              {[
                { label: "Keywords", value: stats.keywords, sub: `${stats.highPriority} high priority`, color: "#4ECDC4" },
                { label: "In Queue", value: stats.queued, sub: "Ready for review", color: "#FFD93D" },
                { label: "Published", value: stats.published, sub: "Live on Webflow", color: "#66BB6A" },
                { label: "Total Words", value: stats.totalWords.toLocaleString(), sub: "Generated content", color: "#BB86FC" },
                { label: "Verticals", value: Object.keys(KEYWORD_DB).length, sub: "Target markets", color: "#FF8C42" },
              ].map((s, i) => (
                <div key={i} style={{ ...css.card, padding: "18px" }}>
                  <p style={{ margin: 0, fontSize: "10px", color: css.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px" }}>{s.label}</p>
                  <p style={{ margin: "6px 0 2px", fontSize: "28px", fontWeight: 800, color: s.color, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "-1px" }}>{s.value}</p>
                  <p style={{ margin: 0, fontSize: "10px", color: css.dim }}>{s.sub}</p>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              {/* Today's recommendations */}
              <div style={{ ...css.card, padding: "20px" }}>
                <h3 style={{ margin: "0 0 14px", fontSize: "12px", fontWeight: 700, color: "#4ECDC4", textTransform: "uppercase", letterSpacing: "1px" }}>Recommended Topics Today</h3>
                {allTopics.slice(0, 6).map((t, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < 5 ? "1px solid rgba(255,255,255,0.03)" : "none" }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: "12px", fontWeight: 500, lineHeight: 1.4 }}>{t.title}</p>
                      <Pill bg={`${t.color}18`} color={t.color} style={{ marginTop: "4px" }}>{t.vertical}</Pill>
                    </div>
                    <button onClick={() => { setSelectedTopic(t.title); setTab("generate"); }} style={{ ...css.btnGhost, color: "#4ECDC4", borderColor: "rgba(78,205,196,0.2)" }}>Write →</button>
                  </div>
                ))}
              </div>

              {/* Quick actions + recent */}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ ...css.card, padding: "20px" }}>
                  <h3 style={{ margin: "0 0 14px", fontSize: "12px", fontWeight: 700, color: "#4ECDC4", textTransform: "uppercase", letterSpacing: "1px" }}>Quick Actions</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    {[
                      { label: "Generate Post", icon: "✦", action: () => setTab("generate") },
                      { label: "Browse Keywords", icon: "◈", action: () => setTab("keywords") },
                      { label: "Review Queue", icon: "☰", action: () => setTab("queue") },
                      { label: "Configure API", icon: "⚙", action: () => setTab("settings") },
                    ].map((a, i) => (
                      <button key={i} onClick={a.action} style={{ ...css.card, padding: "14px", textAlign: "left", cursor: "pointer", color: "#D4D4DC", transition: "border-color 0.15s" }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(78,205,196,0.2)"}
                        onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)"}
                      >
                        <span style={{ fontSize: "18px" }}>{a.icon}</span>
                        <p style={{ margin: "6px 0 0", fontSize: "12px", fontWeight: 600 }}>{a.label}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Keyword opportunity */}
                <div style={{ ...css.card, padding: "20px", flex: 1 }}>
                  <h3 style={{ margin: "0 0 14px", fontSize: "12px", fontWeight: 700, color: "#FFD93D", textTransform: "uppercase", letterSpacing: "1px" }}>Top Keyword Opportunities</h3>
                  {allKws.filter(k => k.priority === "high").sort((a, b) => b.vol - a.vol).slice(0, 5).map((k, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.03)" : "none" }}>
                      <span style={{ fontSize: "12px", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500 }}>{k.kw}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontSize: "10px", color: "#4ECDC4", fontFamily: "'IBM Plex Mono', monospace" }}>{k.vol.toLocaleString()}/mo</span>
                        <DiffBar value={k.diff} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ KEYWORDS ══ */}
        {tab === "keywords" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Keyword Intelligence</h2>
              <div style={{ display: "flex", gap: "6px" }}>
                {["all", ...Object.keys(KEYWORD_DB)].map(v => (
                  <button key={v} onClick={() => setVertical(v)} style={{
                    ...css.btnGhost,
                    borderColor: vertical === v ? "rgba(78,205,196,0.3)" : undefined,
                    color: vertical === v ? "#4ECDC4" : undefined,
                    background: vertical === v ? "rgba(78,205,196,0.06)" : undefined,
                  }}>{v === "all" ? "All" : v}</button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter keywords..." style={{ ...css.input, flex: 1 }} />
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...css.input, width: "160px" }}>
                <option value="priority">Sort: Priority</option>
                <option value="volume">Sort: Volume ↓</option>
                <option value="difficulty">Sort: Difficulty ↑</option>
                <option value="cpc">Sort: CPC ↓</option>
              </select>
            </div>

            <div style={{ ...css.card, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 72px 72px 80px 72px 72px 60px", padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: "9px", fontWeight: 700, color: css.muted, textTransform: "uppercase", letterSpacing: "0.8px" }}>
                <span>Keyword</span><span>Volume</span><span>KD</span><span>Intent</span><span>CPC</span><span>Priority</span><span></span>
              </div>
              <div style={{ maxHeight: "520px", overflow: "auto" }}>
                {filteredKws.map((k, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 72px 72px 80px 72px 72px 60px", padding: "10px 16px", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.02)", transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <div>
                      <span style={{ fontSize: "12px", fontWeight: 500, fontFamily: "'IBM Plex Mono', monospace" }}>{k.kw}</span>
                      <div style={{ marginTop: "2px" }}><Pill bg={`${k.vColor}15`} color={k.vColor}>{k.cluster}</Pill></div>
                    </div>
                    <span style={{ fontSize: "12px", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: "#EDEDF0" }}>{k.vol.toLocaleString()}</span>
                    <DiffBar value={k.diff} />
                    <Pill bg={k.intent === "Commercial" ? "rgba(255,217,61,0.1)" : k.intent === "Comparison" ? "rgba(255,107,107,0.1)" : "rgba(78,205,196,0.1)"} color={k.intent === "Commercial" ? "#FFD93D" : k.intent === "Comparison" ? "#FF6B6B" : "#4ECDC4"}>{k.intent}</Pill>
                    <span style={{ fontSize: "11px", fontFamily: "'IBM Plex Mono', monospace", color: "#66BB6A" }}>{k.cpc}</span>
                    <Pill bg={k.priority === "high" ? "rgba(78,205,196,0.1)" : k.priority === "medium" ? "rgba(255,217,61,0.08)" : "rgba(255,255,255,0.03)"} color={k.priority === "high" ? "#4ECDC4" : k.priority === "medium" ? "#FFD93D" : "#666"}>{k.priority}</Pill>
                    <button onClick={() => { setSelectedTopic(k.kw); setTab("generate"); }} style={{ ...css.btnGhost, fontSize: "10px", color: "#4ECDC4", borderColor: "rgba(78,205,196,0.15)", padding: "4px 8px" }}>Write</button>
                  </div>
                ))}
              </div>
            </div>
            <p style={{ marginTop: "10px", fontSize: "10px", color: css.muted }}>{filteredKws.length} keywords · Click "Write" to generate content for any keyword</p>
          </div>
        )}

        {/* ══ GENERATE ══ */}
        {tab === "generate" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <h2 style={{ margin: "0 0 20px", fontSize: "16px", fontWeight: 700 }}>Generate SEO Content</h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {/* Topic input */}
                <div style={{ ...css.card, padding: "20px" }}>
                  <label style={{ fontSize: "10px", fontWeight: 700, color: "#4ECDC4", textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: "8px" }}>Target Topic / Keyword</label>
                  <textarea value={selectedTopic} onChange={e => setSelectedTopic(e.target.value)} placeholder='e.g. "WordPress to Webflow migration guide for SaaS companies"' rows={3} style={{ ...css.input, resize: "vertical", lineHeight: 1.5 }} />
                </div>

                {/* Template selection */}
                <div style={{ ...css.card, padding: "20px" }}>
                  <label style={{ fontSize: "10px", fontWeight: 700, color: "#4ECDC4", textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: "10px" }}>Content Template</label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                    {Object.entries(TEMPLATES).map(([k, t]) => (
                      <button key={k} onClick={() => setSelectedTemplate(k)} style={{
                        ...css.card, padding: "12px", textAlign: "left", cursor: "pointer", color: "#D4D4DC",
                        borderColor: selectedTemplate === k ? "rgba(78,205,196,0.3)" : undefined,
                        background: selectedTemplate === k ? "rgba(78,205,196,0.05)" : undefined,
                      }}>
                        <div style={{ fontSize: "18px" }}>{t.icon}</div>
                        <div style={{ fontSize: "11px", fontWeight: 600, marginTop: "4px" }}>{t.label}</div>
                        <div style={{ fontSize: "9px", color: css.muted, marginTop: "2px" }}>{t.words}</div>
                        <div style={{ marginTop: "4px", width: "100%", height: "3px", borderRadius: "2px", background: "rgba(255,255,255,0.04)" }}>
                          <div style={{ width: `${t.seo}%`, height: "100%", borderRadius: "2px", background: `hsl(${t.seo * 1.2}, 70%, 55%)` }} />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Generate button */}
                <button onClick={() => generateContent(selectedTopic, selectedTemplate)} disabled={!selectedTopic || generating} style={{
                  ...css.btnPrimary, width: "100%", padding: "14px",
                  opacity: !selectedTopic || generating ? 0.4 : 1,
                  cursor: !selectedTopic || generating ? "not-allowed" : "pointer",
                }}>
                  {generating ? <><Spinner /> <span style={{ marginLeft: "10px" }}>{genProgress}</span></> : "✦  Generate SEO Blog Post"}
                </button>
              </div>

              {/* Topic suggestions sidebar */}
              <div style={{ ...css.card, padding: "16px", maxHeight: "580px", overflow: "auto" }}>
                <h4 style={{ margin: "0 0 12px", fontSize: "10px", fontWeight: 700, color: "#FFD93D", textTransform: "uppercase", letterSpacing: "0.8px" }}>Suggested Topics</h4>
                {allTopics.map((t, i) => (
                  <button key={i} onClick={() => setSelectedTopic(t.title)} style={{
                    display: "block", width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: "4px",
                    borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "11px", fontWeight: 500, lineHeight: 1.4,
                    background: selectedTopic === t.title ? "rgba(78,205,196,0.08)" : "transparent",
                    color: selectedTopic === t.title ? "#4ECDC4" : "#999",
                    transition: "all 0.1s",
                  }}
                    onMouseEnter={e => { if (selectedTopic !== t.title) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                    onMouseLeave={e => { if (selectedTopic !== t.title) e.currentTarget.style.background = "transparent"; }}
                  >
                    <Pill bg={`${t.color}15`} color={t.color} style={{ marginBottom: "4px" }}>{t.vertical}</Pill>
                    <br />{t.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ QUEUE ══ */}
        {tab === "queue" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Content Queue</h2>
              <span style={{ fontSize: "11px", color: css.muted }}>{queue.length} total · {stats.queued} ready · {stats.published} published</span>
            </div>

            {queue.length === 0 ? (
              <div style={{ ...css.card, textAlign: "center", padding: "60px 20px" }}>
                <p style={{ fontSize: "36px", marginBottom: "8px" }}>✦</p>
                <p style={{ color: css.muted, fontSize: "13px" }}>No content generated yet</p>
                <button onClick={() => setTab("generate")} style={{ ...css.btnGhost, marginTop: "12px", color: "#4ECDC4", borderColor: "rgba(78,205,196,0.2)" }}>Generate your first post →</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {queue.map(item => (
                  <div key={item.id} style={{ ...css.card, padding: "18px", animation: "fadeIn 0.3s ease" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                          <Pill bg={item.status === "ready" ? "rgba(255,217,61,0.1)" : item.status === "published" ? "rgba(102,187,106,0.1)" : "rgba(255,255,255,0.05)"} color={item.status === "ready" ? "#FFD93D" : item.status === "published" ? "#66BB6A" : "#888"}>
                            {item.status === "ready" ? "● Ready for Review" : item.status === "published" ? "✓ Published" : item.status}
                          </Pill>
                          <span style={{ fontSize: "10px", color: css.dim, fontFamily: "'IBM Plex Mono', monospace" }}>{new Date(item.createdAt).toLocaleDateString()}</span>
                        </div>
                        <h3 style={{ margin: "0 0 4px", fontSize: "14px", fontWeight: 600, color: "#EDEDF0", lineHeight: 1.3 }}>{item.title}</h3>
                        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "6px" }}>
                          <span style={{ fontSize: "10px", color: css.muted }}>📝 {item.wordCount} words</span>
                          <span style={{ fontSize: "10px", color: css.muted }}>⏱ {item.estimatedReadTime}</span>
                          <span style={{ fontSize: "10px", color: css.muted }}>🎯 {item.seoScore || "—"}/100 SEO</span>
                          <span style={{ fontSize: "10px", color: css.muted, fontFamily: "'IBM Plex Mono', monospace" }}>/{item.slug}</span>
                        </div>
                        {item.secondaryKeywords?.length > 0 && (
                          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "8px" }}>
                            {item.secondaryKeywords.slice(0, 6).map((kw, ki) => <Pill key={ki} bg="rgba(78,205,196,0.06)" color="#4ECDC4">{kw}</Pill>)}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: "6px", marginLeft: "16px" }}>
                        <button onClick={() => { setPreviewItem(item); setTab("preview"); }} style={{ ...css.btnGhost, color: "#BB86FC", borderColor: "rgba(187,134,252,0.2)" }}>Preview</button>
                        {item.status === "ready" && (
                          <button onClick={() => publishToWebflow(item)} disabled={publishingId === item.id} style={{
                            ...css.btnPrimary, fontSize: "11px", padding: "6px 14px",
                            opacity: publishingId === item.id ? 0.5 : 1,
                          }}>{publishingId === item.id ? "Publishing..." : "Publish →"}</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ PREVIEW ══ */}
        {tab === "preview" && previewItem && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <button onClick={() => setTab("queue")} style={{ ...css.btnGhost }}>← Back to Queue</button>
              <div style={{ display: "flex", gap: "8px" }}>
                {previewItem.status === "ready" && (
                  <button onClick={() => publishToWebflow(previewItem)} style={css.btnPrimary}>Publish to Webflow →</button>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "16px" }}>
              {/* Content preview */}
              <div style={{ ...css.card, padding: "28px" }}>
                <Pill bg={previewItem.status === "ready" ? "rgba(255,217,61,0.1)" : "rgba(102,187,106,0.1)"} color={previewItem.status === "ready" ? "#FFD93D" : "#66BB6A"} style={{ marginBottom: "12px" }}>
                  {previewItem.status === "ready" ? "● Ready for Review" : "✓ Published"}
                </Pill>
                <h1 style={{ margin: "8px 0 16px", fontSize: "22px", fontWeight: 800, color: "#EDEDF0", lineHeight: 1.3, letterSpacing: "-0.3px" }}>{previewItem.title}</h1>
                <div style={{ display: "flex", gap: "16px", marginBottom: "20px", paddingBottom: "16px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: "11px", color: css.muted }}>📝 {previewItem.wordCount} words</span>
                  <span style={{ fontSize: "11px", color: css.muted }}>⏱ {previewItem.estimatedReadTime}</span>
                  <span style={{ fontSize: "11px", color: css.muted }}>🎯 SEO Score: {previewItem.seoScore || "—"}/100</span>
                </div>
                <div style={{
                  fontSize: "14px", lineHeight: 1.8, color: "#B8B8C4",
                  maxHeight: "600px", overflow: "auto",
                }} dangerouslySetInnerHTML={{ __html: `<style>h2{font-size:18px;font-weight:700;color:#EDEDF0;margin:24px 0 10px;letter-spacing:-0.2px}h3{font-size:15px;font-weight:600;color:#D4D4DC;margin:18px 0 8px}p{margin:0 0 12px}ul,ol{margin:0 0 14px;padding-left:20px}li{margin-bottom:6px}strong{color:#EDEDF0}em{color:#4ECDC4}blockquote{border-left:3px solid #4ECDC4;margin:16px 0;padding:12px 16px;background:rgba(78,205,196,0.04);border-radius:0 6px 6px 0;font-style:italic}</style>${previewItem.body}` }} />
              </div>

              {/* SEO Sidebar */}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ ...css.card, padding: "16px" }}>
                  <h4 style={{ margin: "0 0 10px", fontSize: "10px", fontWeight: 700, color: "#4ECDC4", textTransform: "uppercase", letterSpacing: "0.8px" }}>SEO Metadata</h4>
                  <div style={{ marginBottom: "10px" }}>
                    <label style={{ fontSize: "9px", color: css.muted, fontWeight: 600, textTransform: "uppercase" }}>Meta Title</label>
                    <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#EDEDF0", fontWeight: 500 }}>{previewItem.metaTitle}</p>
                    <div style={{ height: "3px", borderRadius: "2px", background: "rgba(255,255,255,0.04)", marginTop: "4px" }}>
                      <div style={{ width: `${Math.min((previewItem.metaTitle?.length || 0) / 60 * 100, 100)}%`, height: "100%", borderRadius: "2px", background: (previewItem.metaTitle?.length || 0) > 60 ? "#FF6B6B" : "#66BB6A" }} />
                    </div>
                    <span style={{ fontSize: "9px", color: css.dim }}>{previewItem.metaTitle?.length || 0}/60 chars</span>
                  </div>
                  <div style={{ marginBottom: "10px" }}>
                    <label style={{ fontSize: "9px", color: css.muted, fontWeight: 600, textTransform: "uppercase" }}>Meta Description</label>
                    <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#B8B8C4", lineHeight: 1.4 }}>{previewItem.metaDescription}</p>
                    <span style={{ fontSize: "9px", color: css.dim }}>{previewItem.metaDescription?.length || 0}/155 chars</span>
                  </div>
                  <div>
                    <label style={{ fontSize: "9px", color: css.muted, fontWeight: 600, textTransform: "uppercase" }}>Slug</label>
                    <p style={{ margin: "2px 0 0", fontSize: "11px", fontFamily: "'IBM Plex Mono', monospace", color: "#4ECDC4" }}>/{previewItem.slug}</p>
                  </div>
                </div>

                <div style={{ ...css.card, padding: "16px" }}>
                  <h4 style={{ margin: "0 0 10px", fontSize: "10px", fontWeight: 700, color: "#FFD93D", textTransform: "uppercase", letterSpacing: "0.8px" }}>Target Keywords</h4>
                  <Pill bg="rgba(78,205,196,0.1)" color="#4ECDC4" style={{ marginBottom: "8px" }}>{previewItem.primaryKeyword}</Pill>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "8px" }}>
                    {(previewItem.secondaryKeywords || []).map((kw, i) => <Pill key={i}>{kw}</Pill>)}
                  </div>
                </div>

                {previewItem.faqSchema?.length > 0 && (
                  <div style={{ ...css.card, padding: "16px" }}>
                    <h4 style={{ margin: "0 0 10px", fontSize: "10px", fontWeight: 700, color: "#BB86FC", textTransform: "uppercase", letterSpacing: "0.8px" }}>FAQ Schema</h4>
                    {previewItem.faqSchema.map((faq, i) => (
                      <div key={i} style={{ marginBottom: "10px", paddingBottom: "10px", borderBottom: i < previewItem.faqSchema.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none" }}>
                        <p style={{ margin: 0, fontSize: "11px", fontWeight: 600, color: "#EDEDF0" }}>{faq.question}</p>
                        <p style={{ margin: "4px 0 0", fontSize: "10px", color: "#888", lineHeight: 1.4 }}>{faq.answer?.substring(0, 120)}...</p>
                      </div>
                    ))}
                  </div>
                )}

                {previewItem.internalLinks?.length > 0 && (
                  <div style={{ ...css.card, padding: "16px" }}>
                    <h4 style={{ margin: "0 0 10px", fontSize: "10px", fontWeight: 700, color: "#FF8C42", textTransform: "uppercase", letterSpacing: "0.8px" }}>Internal Links</h4>
                    {previewItem.internalLinks.map((link, i) => (
                      <div key={i} style={{ marginBottom: "6px" }}>
                        <p style={{ margin: 0, fontSize: "11px", color: "#4ECDC4" }}>{link.text}</p>
                        <p style={{ margin: "1px 0 0", fontSize: "9px", color: css.dim, fontFamily: "'IBM Plex Mono', monospace" }}>{link.suggestedUrl}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══ SETTINGS ══ */}
        {tab === "settings" && (
          <div style={{ animation: "fadeIn 0.3s ease", maxWidth: "680px" }}>
            <h2 style={{ margin: "0 0 20px", fontSize: "16px", fontWeight: 700 }}>Configuration</h2>

            {/* Claude API */}
            <div style={{ ...css.card, padding: "22px", marginBottom: "14px" }}>
              <h3 style={{ margin: "0 0 4px", fontSize: "13px", fontWeight: 700, color: "#4ECDC4" }}>Claude API</h3>
              <p style={{ margin: "0 0 14px", fontSize: "11px", color: css.muted }}>The dashboard uses Claude Sonnet to generate content. Your API key is sent directly from the browser and never stored on a server.</p>
              <label style={{ fontSize: "10px", fontWeight: 600, color: "#888", display: "block", marginBottom: "4px" }}>API Key (optional — already configured via artifact)</label>
              <input type="password" value={config.claudeKey} onChange={e => setConfig(p => ({ ...p, claudeKey: e.target.value }))} placeholder="sk-ant-..." style={css.input} />
              <div style={{ marginTop: "10px", padding: "10px", borderRadius: "6px", background: "rgba(78,205,196,0.04)", border: "1px solid rgba(78,205,196,0.1)" }}>
                <p style={{ margin: 0, fontSize: "10px", color: "#4ECDC4", lineHeight: 1.5 }}>
                  ✦ Content generation uses the system prompt trained on ActiveSet's brand, services, and writing guidelines. The prompt includes E-E-A-T signals, AEO/GEO optimization, and FAQ schema generation.
                </p>
              </div>
            </div>

            {/* Webflow Config */}
            <div style={{ ...css.card, padding: "22px", marginBottom: "14px" }}>
              <h3 style={{ margin: "0 0 4px", fontSize: "13px", fontWeight: 700, color: "#FFD93D" }}>Webflow CMS</h3>
              <p style={{ margin: "0 0 14px", fontSize: "11px", color: css.muted }}>Connect to publish blog posts directly to your Webflow CMS collection.</p>
              {[
                { label: "Site ID", key: "siteId", placeholder: "Go to Project Settings → General → Site ID" },
                { label: "Blog Collection ID", key: "collectionId", placeholder: "CMS → Blog Posts collection → Settings → Collection ID" },
                { label: "API Token (v2)", key: "apiToken", placeholder: "webflow.com/dashboard → Integrations → Generate API Token", type: "password" },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: "10px" }}>
                  <label style={{ fontSize: "10px", fontWeight: 600, color: "#888", display: "block", marginBottom: "4px" }}>{f.label}</label>
                  <input type={f.type || "text"} value={config[f.key]} onChange={e => setConfig(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} style={css.input} />
                </div>
              ))}
              <div style={{ marginTop: "10px", padding: "10px", borderRadius: "6px", background: "rgba(255,217,61,0.04)", border: "1px solid rgba(255,217,61,0.1)" }}>
                <p style={{ margin: 0, fontSize: "10px", color: "#FFD93D", lineHeight: 1.5 }}>
                  ⚡ Your CMS Blog collection needs these field slugs: <code style={{ background: "rgba(0,0,0,0.3)", padding: "1px 4px", borderRadius: "3px", fontSize: "10px" }}>name</code>, <code style={{ background: "rgba(0,0,0,0.3)", padding: "1px 4px", borderRadius: "3px", fontSize: "10px" }}>slug</code>, <code style={{ background: "rgba(0,0,0,0.3)", padding: "1px 4px", borderRadius: "3px", fontSize: "10px" }}>post-body</code>, <code style={{ background: "rgba(0,0,0,0.3)", padding: "1px 4px", borderRadius: "3px", fontSize: "10px" }}>post-summary</code>, <code style={{ background: "rgba(0,0,0,0.3)", padding: "1px 4px", borderRadius: "3px", fontSize: "10px" }}>meta-title</code>, <code style={{ background: "rgba(0,0,0,0.3)", padding: "1px 4px", borderRadius: "3px", fontSize: "10px" }}>meta-description</code>
                </p>
              </div>
            </div>

            {/* Automation */}
            <div style={{ ...css.card, padding: "22px" }}>
              <h3 style={{ margin: "0 0 4px", fontSize: "13px", fontWeight: 700, color: "#BB86FC" }}>Daily Automation</h3>
              <p style={{ margin: "0 0 14px", fontSize: "11px", color: css.muted }}>Auto-generate content daily. Posts land in the queue for your review before publishing.</p>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", marginBottom: "14px" }}>
                <input type="checkbox" checked={automation.enabled} onChange={e => setAutomation(p => ({ ...p, enabled: e.target.checked }))} style={{ accentColor: "#4ECDC4" }} />
                <span style={{ fontSize: "13px", fontWeight: 600 }}>Enable daily auto-generation</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "10px", fontWeight: 600, color: "#888", display: "block", marginBottom: "4px" }}>Time (IST)</label>
                  <input type="time" value={automation.time} onChange={e => setAutomation(p => ({ ...p, time: e.target.value }))} style={css.input} />
                </div>
                <div>
                  <label style={{ fontSize: "10px", fontWeight: 600, color: "#888", display: "block", marginBottom: "4px" }}>Posts / Day</label>
                  <select value={automation.perDay} onChange={e => setAutomation(p => ({ ...p, perDay: +e.target.value }))} style={css.input}>
                    <option value={1}>1 post</option>
                    <option value={2}>2 posts</option>
                    <option value={3}>3 posts</option>
                  </select>
                </div>
              </div>
              <div style={{ marginTop: "12px", padding: "10px", borderRadius: "6px", background: "rgba(187,134,252,0.04)", border: "1px solid rgba(187,134,252,0.1)" }}>
                <p style={{ margin: 0, fontSize: "10px", color: "#BB86FC", lineHeight: 1.5 }}>
                  🔄 Semi-automated mode: Topics are auto-selected from your keyword database, content is generated via Claude API, and posts land in your queue for review. You click "Publish" when ready.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}