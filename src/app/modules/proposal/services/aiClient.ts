// Client-side AI helpers for the Proposal module.
// Calls the user's local Ollama directly from the browser so the feature
// works in production without the server ever needing network access to
// the model. Requires `OLLAMA_ORIGINS='*' ollama serve` on the user's machine.
//
// For the initial draft we split the work into three focused parallel
// calls (basics, pricing, timeline) instead of one massive JSON schema.
// Small models like gemma4:e4b handle narrow tasks with examples much
// better than a single 10-field mega-prompt. We also fetch the client
// website server-side first and feed distilled signals into the basics
// prompt so the client description, services, and deliverable are
// grounded in reality rather than guessed from the company name.

const DEFAULT_BASE_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_OLLAMA_BASE_URL) ||
  'http://127.0.0.1:11434';

const DEFAULT_MODEL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_OLLAMA_MODEL) ||
  'gemma4:e4b';

export interface AIDraftInput {
  meetingNotes: string;
  clientName?: string;
  agencyName?: string;
  clientWebsite?: string;
  projectDeadline?: string;
  projectBudget?: string;
}

export interface AIBlockInput {
  blockType: 'timeline' | 'pricing' | 'clientDescription' | 'finalDeliverable';
  notes: string;
  clientName?: string;
  agencyName?: string;
  clientWebsite?: string;
  projectDeadline?: string;
  projectBudget?: string;
  currentData?: Record<string, unknown>;
}

export interface AIDraftResult {
  title?: string;
  clientName?: string;
  overview?: string;
  clientDescription?: string;
  serviceKeys?: string[];
  finalDeliverable?: string;
  aboutUsTemplateId?: string;
  pricingItems?: Array<{ name: string; description?: string; price: string }>;
  pricingTotal?: string;
  timelinePhases?: Array<{
    title: string;
    description: string;
    duration: string;
    startDate?: string;
    endDate?: string;
  }>;
  projectType?: string;
}

export interface AIBlockResult {
  timelinePhases?: AIDraftResult['timelinePhases'];
  pricingItems?: AIDraftResult['pricingItems'];
  pricingTotal?: string;
  clientDescription?: string;
  finalDeliverable?: string;
}

export type DraftStage =
  | 'fetch-site'
  | 'site-fetched'
  | 'site-skipped'
  | 'basics-start'
  | 'basics-done'
  | 'basics-failed'
  | 'pricing-start'
  | 'pricing-done'
  | 'pricing-failed'
  | 'timeline-start'
  | 'timeline-done'
  | 'timeline-failed';

export interface DraftProgressEvent {
  stage: DraftStage;
  detail?: string;
}

interface SiteContext {
  url: string;
  title: string;
  description: string;
  headings: { h1: string[]; h2: string[] };
  bodyExcerpt: string;
}

// ---------------------------------------------------------------------------
// Low-level Ollama wrapper
// ---------------------------------------------------------------------------

interface CallOpts {
  signal?: AbortSignal;
  timeoutMs?: number;
  numCtx?: number;
}

async function callOllama(prompt: string, opts: CallOpts = {}): Promise<string> {
  const base = DEFAULT_BASE_URL.replace(/\/$/, '');
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const numCtx = opts.numCtx ?? 6144;

  // Chain the caller's signal with our own timeout so we abort on either.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  const onParentAbort = () => controller.abort(opts.signal?.reason);
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort(opts.signal.reason);
    else opts.signal.addEventListener('abort', onParentAbort, { once: true });
  }

  let res: Response;
  try {
    res = await fetch(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.25, num_ctx: numCtx },
      }),
    });
  } catch (err) {
    clearTimeout(timeoutId);
    opts.signal?.removeEventListener('abort', onParentAbort);
    if (err instanceof Error && (err.name === 'AbortError' || err.message === 'timeout')) {
      throw new Error(
        `Ollama timed out after ${Math.round(timeoutMs / 1000)}s. ` +
          `The model may be thrashing — try a smaller context, close other apps, or use a bigger model (gpt-oss:20b).`
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot reach Ollama at ${base} (${msg}). ` +
        `Start it with: OLLAMA_ORIGINS='*' ollama serve · ensure '${DEFAULT_MODEL}' is pulled.`
    );
  } finally {
    clearTimeout(timeoutId);
    opts.signal?.removeEventListener('abort', onParentAbort);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Ollama returned ${res.status}: ${body || res.statusText}. ` +
        `If this is CORS, restart Ollama with OLLAMA_ORIGINS='*' ollama serve.`
    );
  }

  const payload = (await res.json()) as { response?: string };
  const raw = payload.response?.trim() ?? '';
  if (!raw) throw new Error('Ollama returned an empty response');
  return raw;
}

function parseJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const stripped = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI response was not valid JSON');
    return JSON.parse(match[0]) as T;
  }
}

// ---------------------------------------------------------------------------
// Web context
// ---------------------------------------------------------------------------

async function fetchSiteContext(url: string): Promise<SiteContext | null> {
  try {
    const res = await fetch(`/api/site-context?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { context?: SiteContext };
    return data.context || null;
  } catch {
    return null;
  }
}

function formatContext(ctx: SiteContext | null): string {
  if (!ctx) return '(no website provided or fetch failed)';
  return [
    `URL: ${ctx.url}`,
    `Title: ${ctx.title || '-'}`,
    `Meta: ${ctx.description || '-'}`,
    `H1: ${ctx.headings.h1.slice(0, 3).join(' | ') || '-'}`,
    `H2: ${ctx.headings.h2.slice(0, 5).join(' | ') || '-'}`,
    `Body excerpt: ${ctx.bodyExcerpt.slice(0, 1400) || '-'}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Sub-prompts
// ---------------------------------------------------------------------------

const ALLOWED_TITLES = [
  'Website Proposal',
  'Website Design & Development Proposal',
  'Webflow Development Proposal',
  'Copy, Branding, Website Design & Development Proposal',
  'Website Development Proposal (Client-First)',
  'Webflow Website Proposal',
  'Web Design, Copy, and SEO Proposal',
] as const;

const ALLOWED_SERVICE_KEYS = [
  'webflow-dev',
  'website-design',
  'branding-design',
  'copy',
  'strategy-copy',
  'webflow-migration',
  'brochure-design',
  'full-webflow',
] as const;

const ALLOWED_ABOUT_US_IDS = ['activeset', 'standard', 'modern', 'corporate', 'creative'] as const;

const ALLOWED_PRICING_NAMES = [
  'Strategy & Copy',
  'Branding',
  'Website Design',
  'Webflow Development',
] as const;

const DELIVERABLE_A =
  'The final deliverable for this project will be a fully functional, responsive website. It will be built on Webflow in a stable and secure environment.';
const DELIVERABLE_B =
  'The final deliverable for this project will be a visually compelling, responsive website with a cohesive brand identity. Designed with a focus on aesthetics, usability, and consistency, the site will effectively communicate your brand and engage your audience across all devices.';

function basicsPrompt(input: AIDraftInput, ctx: SiteContext | null): string {
  return `You are a senior proposal writer at a web design agency. Produce the "basics" section of a proposal as strict JSON.

OUTPUT SHAPE:
{
  "title": string,            // one of: ${ALLOWED_TITLES.map((t) => `"${t}"`).join(', ')}
  "clientName": string,       // the client company name (deduce from website/notes if not provided)
  "clientDescription": string, // 2-3 professional sentences, third person. Must be grounded in the website context below — include industry, what they do, mission/value prop.
  "serviceKeys": string[],    // 2-5 items from: ${ALLOWED_SERVICE_KEYS.map((k) => `"${k}"`).join(', ')}
  "aboutUsTemplateId": string, // one of: ${ALLOWED_ABOUT_US_IDS.map((k) => `"${k}"`).join(', ')}
  "finalDeliverable": string, // a short paragraph describing what the client will receive. Prefer one of the two templates below unless the project clearly needs custom wording.
  "overview": string          // 2-3 paragraph project overview tying the client's goals to the scope.
}

DELIVERABLE TEMPLATES (prefer these exact strings):
A) "${DELIVERABLE_A}"
B) "${DELIVERABLE_B}"

SERVICE SELECTION RULES:
- If the brief mentions copy or strategy → include "strategy-copy" or "copy".
- If the brief mentions brand or logo → include "branding-design".
- If the project is a new build on Webflow → include "website-design" AND "webflow-dev".
- If migrating an existing site to Webflow → include "webflow-migration".
- Always include at least "website-design" and "webflow-dev" for website projects.
- Pick 2-5 services. Never return an empty array.

ABOUT-US TEMPLATE RULES:
- "activeset" = default agency voice (use if unsure).
- "modern" = tech/SaaS clients.
- "corporate" = B2B, enterprise, finance, legal.
- "creative" = design, media, arts.
- "standard" = generic fallback.

CLIENT CONTEXT (authoritative — use this to ground clientDescription and infer services):
${formatContext(ctx)}

MEETING NOTES / BRIEF:
${input.meetingNotes}

${input.clientName ? `Declared client name: ${input.clientName}` : ''}
${input.agencyName ? `Agency: ${input.agencyName}` : ''}
${input.clientWebsite ? `Website: ${input.clientWebsite}` : ''}

Respond with valid JSON only. No markdown fences.`;
}

function pricingPrompt(input: AIDraftInput): string {
  const budget = input.projectBudget?.trim();
  return `You generate a pricing section for a web design proposal as strict JSON.

OUTPUT SHAPE:
{
  "pricingItems": [
    { "name": string, "description": string, "price": string }
  ],
  "pricingTotal": string
}

RULES:
- "name" MUST be one of: ${ALLOWED_PRICING_NAMES.map((n) => `"${n}"`).join(', ')}. Never invent names.
- Return 3 or 4 items.
- "description" = one clear sentence about what's included.
- "price" = formatted currency string, e.g. "$3,500" or "€2,000".
- Detect currency from the provided budget if set; otherwise use USD.
${budget ? `- BUDGET CONSTRAINT: the sum of prices MUST equal exactly ${budget}. Distribute proportionally: Strategy & Copy ≈ 15%, Branding ≈ 20%, Website Design ≈ 30%, Webflow Development ≈ 35%. Adjust if a category isn't included.` : '- No budget provided. Use realistic numbers: total between $4,000 and $12,000.'}
- "pricingTotal" must equal the sum of pricingItems prices.

BRIEF:
${input.meetingNotes}

${input.clientName ? `Client: ${input.clientName}` : ''}
${budget ? `Budget: ${budget}` : 'Budget: not provided'}

Respond with valid JSON only.`;
}

function timelinePrompt(input: AIDraftInput): string {
  const deadline = input.projectDeadline?.trim();
  const today = new Date().toISOString().slice(0, 10);
  return `You generate a realistic project timeline for a web design proposal as strict JSON.

OUTPUT SHAPE:
{
  "timelinePhases": [
    {
      "title": string,
      "description": string,
      "duration": string,        // e.g. "2 weeks"
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD"
    }
  ]
}

RULES:
- Produce 3 to 5 sequential phases. Typical sequence:
  1) Discovery & Strategy (1-2 weeks)
  2) Design (2-3 weeks)
  3) Development (3-4 weeks)
  4) QA & Launch (1 week)
- Start the first phase on ${today}.
- Each phase's startDate equals the previous phase's endDate (or +1 day).
${deadline ? `- DEADLINE: the last endDate MUST be on or before ${deadline}. Compress durations proportionally if needed.` : '- No deadline provided. Plan for a realistic 6-10 week total.'}
- "description" = one sentence about what happens in that phase.

BRIEF:
${input.meetingNotes}

Respond with valid JSON only.`;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface GenerateDraftOpts {
  signal?: AbortSignal;
  onProgress?: (event: DraftProgressEvent) => void;
}

export async function generateProposalDraft(
  input: AIDraftInput,
  opts: GenerateDraftOpts = {}
): Promise<AIDraftResult> {
  if (!input.meetingNotes?.trim()) throw new Error('Meeting notes are required');

  const emit = (stage: DraftStage, detail?: string) => opts.onProgress?.({ stage, detail });
  const result: AIDraftResult = {};

  // ---- Step 1: fetch website context (not AI, fast)
  let ctx: SiteContext | null = null;
  if (input.clientWebsite) {
    emit('fetch-site', input.clientWebsite);
    ctx = await fetchSiteContext(input.clientWebsite);
    emit('site-fetched', ctx ? 'ok' : 'failed');
  } else {
    emit('site-skipped');
  }

  // ---- Step 2: basics (critical path — throws if it fails)
  emit('basics-start');
  try {
    const raw = await callOllama(basicsPrompt(input, ctx), {
      signal: opts.signal,
      timeoutMs: 120_000, // basics is the biggest prompt
      numCtx: 6144,
    });
    Object.assign(result, parseJson<AIDraftResult>(raw));
    emit('basics-done');
  } catch (err) {
    emit('basics-failed', err instanceof Error ? err.message : String(err));
    throw err instanceof Error ? err : new Error(String(err));
  }

  // ---- Step 3: pricing (non-critical — partial results still useful)
  emit('pricing-start');
  try {
    const raw = await callOllama(pricingPrompt(input), {
      signal: opts.signal,
      timeoutMs: 60_000,
      numCtx: 3072,
    });
    const pricing = parseJson<AIDraftResult>(raw);
    if (pricing.pricingItems) result.pricingItems = pricing.pricingItems;
    if (pricing.pricingTotal) result.pricingTotal = pricing.pricingTotal;
    emit('pricing-done');
  } catch (err) {
    console.warn('[aiClient] pricing failed:', err);
    emit('pricing-failed', err instanceof Error ? err.message : String(err));
    // continue — user can regenerate the pricing block in the editor
  }

  // ---- Step 4: timeline (non-critical)
  emit('timeline-start');
  try {
    const raw = await callOllama(timelinePrompt(input), {
      signal: opts.signal,
      timeoutMs: 60_000,
      numCtx: 3072,
    });
    const timeline = parseJson<AIDraftResult>(raw);
    if (timeline.timelinePhases) result.timelinePhases = timeline.timelinePhases;
    emit('timeline-done');
  } catch (err) {
    console.warn('[aiClient] timeline failed:', err);
    emit('timeline-failed', err instanceof Error ? err.message : String(err));
  }

  // Sanity: force serviceKeys to the allowed set.
  if (result.serviceKeys) {
    result.serviceKeys = result.serviceKeys.filter((k) =>
      (ALLOWED_SERVICE_KEYS as readonly string[]).includes(k)
    );
    if (result.serviceKeys.length === 0) {
      result.serviceKeys = ['website-design', 'webflow-dev'];
    }
  }

  // Sanity: force aboutUsTemplateId to the allowed set.
  if (
    result.aboutUsTemplateId &&
    !(ALLOWED_ABOUT_US_IDS as readonly string[]).includes(result.aboutUsTemplateId)
  ) {
    result.aboutUsTemplateId = 'activeset';
  }

  return result;
}

// ---------------------------------------------------------------------------
// Block edits (unchanged shape — still a single focused call per block)
// ---------------------------------------------------------------------------

function buildBlockPrompt(input: AIBlockInput): string {
  const { blockType, notes, clientName, agencyName, clientWebsite, projectDeadline, projectBudget, currentData } = input;

  const common = `
Project Information:
${notes}

${clientName ? `Client: ${clientName}` : ''}
${agencyName ? `Agency: ${agencyName}` : ''}
${clientWebsite ? `Client Website: ${clientWebsite}` : ''}
${projectDeadline ? `Deadline: ${projectDeadline}` : ''}
${projectBudget ? `Budget: ${projectBudget}` : ''}
`;

  if (blockType === 'timeline') {
    return `You are an expert project manager. Generate a realistic project timeline based on the provided information.

Return JSON in this exact format:
{
  "timelinePhases": [
    { "title": "Phase name", "description": "Details", "duration": "e.g., '2 weeks'", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }
  ]
}

Guidelines:
- 3-5 sequential phases
- If Deadline (${projectDeadline || 'Not provided'}) is given, fit within it
- Start dates calculated from today
${common}
${currentData?.timeline ? `Current Timeline: ${JSON.stringify(currentData.timeline)}` : ''}

Respond with valid JSON only.`;
  }

  if (blockType === 'pricing') {
    return `You are an expert pricing strategist for web design agencies.

Return JSON in this exact format:
{
  "pricingItems": [
    { "name": "Select ONLY from: 'Strategy & Copy', 'Branding', 'Website Design', 'Webflow Development'", "description": "What's included", "price": "Formatted price (e.g., '$3,500')" }
  ],
  "pricingTotal": "Sum of items"
}

Guidelines:
- Use only the allowed service names
- If Budget (${projectBudget || 'Not provided'}) is given, item prices must sum to the budget, using the budget's currency
- Otherwise realistic pricing in the $3,000–$15,000 range
${common}
${currentData?.pricing ? `Current Pricing: ${JSON.stringify(currentData.pricing)}` : ''}

Respond with valid JSON only.`;
  }

  if (blockType === 'clientDescription') {
    return `You are an expert copywriter.

Return JSON in this exact format:
{ "clientDescription": "2-3 sentence professional description of the client in third person." }

Guidelines:
- Professional, concise
- Mention industry, what they do, mission
- Use client website (${clientWebsite || 'if provided'}) for insight
${common}
${currentData?.clientDescription ? `Current Description: ${currentData.clientDescription}` : ''}

Respond with valid JSON only.`;
  }

  // finalDeliverable
  return `You are an expert proposal writer.

Return JSON in this exact format:
{ "finalDeliverable": "2-3 sentence description of what the client receives. Include platform and key benefits." }

Guidelines:
- Specific, compelling, clear
- Mention platform (e.g., Webflow)
${common}
${currentData?.finalDeliverable ? `Current: ${currentData.finalDeliverable}` : ''}

Respond with valid JSON only.`;
}

export async function generateProposalBlock(
  input: AIBlockInput,
  signal?: AbortSignal
): Promise<AIBlockResult> {
  if (!input.notes?.trim()) throw new Error('Notes are required');

  // If editing clientDescription and a website is provided, fetch context
  // so the rewrite stays grounded — same treatment as the initial draft.
  let prompt = buildBlockPrompt(input);
  if (input.blockType === 'clientDescription' && input.clientWebsite) {
    const ctx = await fetchSiteContext(input.clientWebsite);
    if (ctx) prompt += `\n\nWEBSITE CONTEXT:\n${formatContext(ctx)}`;
  }

  const raw = await callOllama(prompt, { signal, timeoutMs: 90_000 });
  return parseJson<AIBlockResult>(raw);
}
