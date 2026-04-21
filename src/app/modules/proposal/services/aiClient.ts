// Client-side AI helpers for the Proposal module.
// Calls the user's local Ollama directly from the browser so the feature
// works in production without the server ever needing network access to
// the model. Requires `OLLAMA_ORIGINS='*' ollama serve` on the user's machine.

// Use 127.0.0.1 (not localhost) — on many machines localhost resolves to IPv6
// ::1 first, while Ollama only binds to IPv4. Matches the schema/alt-text
// features which have been working on prod for a while.
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

async function callOllama(prompt: string, signal?: AbortSignal): Promise<string> {
  const base = DEFAULT_BASE_URL.replace(/\/$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.3, num_ctx: 8192 },
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot reach Ollama at ${base} (${msg}). ` +
        `Start it on your machine with:  OLLAMA_ORIGINS='*' ollama serve  ` +
        `and ensure '${DEFAULT_MODEL}' is pulled (ollama pull ${DEFAULT_MODEL}).`
    );
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

function buildDraftPrompt(input: AIDraftInput): string {
  const { meetingNotes, clientName, agencyName, clientWebsite, projectDeadline, projectBudget } = input;
  return `You are an expert proposal writer for a web design agency. Based on the meeting notes provided, generate professional proposal content.

Extract and generate the following in JSON format:
{
  "title": "Select one of the following exact titles: 'Website Proposal', 'Website Design & Development Proposal', 'Webflow Development Proposal', 'Copy, Branding, Website Design & Development Proposal', 'Website Development Proposal (Client-First)', 'Webflow Website Proposal', 'Web Design, Copy, and SEO Proposal'. Do not invent a new title.",
  "clientName": "Deduce client/company name from transcript/notes if not explicitly provided.",
  "overview": "A 2-3 paragraph professional project overview summarizing the scope, goals, and approach.",
  "clientDescription": "A professional description of the client. If clientWebsite (${clientWebsite || 'none'}) is provided, use it to infer details. Otherwise deduce from transcript.",
  "serviceKeys": ["Select from these exact keys: 'webflow-dev', 'website-design', 'branding-design', 'copy', 'strategy-copy', 'webflow-migration', 'brochure-design', 'full-webflow'"],
  "finalDeliverable": "Select one of these exact texts or a custom one: 'The final deliverable for this project will be a fully functional, responsive website. It will be built on Webflow in a stable and secure environment.' OR 'The final deliverable for this project will be a visually compelling, responsive website with a cohesive brand identity. Designed with a focus on aesthetics, usability, and consistency, the site will effectively communicate your brand and engage your audience across all devices.'",
  "aboutUsTemplateId": "Select 'activeset', 'standard', 'modern', 'corporate', or 'creative' based on tone.",
  "pricingItems": [
    {
      "name": "Select ONLY from these titles: 'Strategy & Copy', 'Branding', 'Website Design', 'Webflow Development'",
      "description": "Fill details via Transcript.",
      "price": "Formatted price (e.g., $1,500). If Project Budget (${projectBudget || 'Not provided'}) is set, distribute it logically across items so the sum equals the budget."
    }
  ],
  "pricingTotal": "The sum of all pricing items (e.g., '$3,000'). Must equal Project Budget if provided.",
  "timelinePhases": [
    { "title": "Phase name", "description": "What happens", "duration": "e.g., '2 weeks'", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }
  ],
  "projectType": "Type of project"
}

Guidelines:
- Be professional and concise.
- If Project Budget is provided (${projectBudget || ''}), detect the currency and distribute the total so item prices sum to it.
- If Project Deadline is provided (${projectDeadline || 'Not provided'}), all phases fit within today and the deadline.
- Use realistic dates starting from today.

Meeting Notes:
${meetingNotes}

${clientName ? `Client Name: ${clientName}` : ''}
${agencyName ? `Agency Name: ${agencyName}` : ''}
${clientWebsite ? `Client Website: ${clientWebsite}` : ''}
${projectDeadline ? `Project Deadline: ${projectDeadline}` : ''}
${projectBudget ? `Project Budget: ${projectBudget}` : ''}

Respond with valid JSON only.`;
}

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

export async function generateProposalDraft(
  input: AIDraftInput,
  signal?: AbortSignal
): Promise<AIDraftResult> {
  if (!input.meetingNotes?.trim()) throw new Error('Meeting notes are required');
  const raw = await callOllama(buildDraftPrompt(input), signal);
  return parseJson<AIDraftResult>(raw);
}

export async function generateProposalBlock(
  input: AIBlockInput,
  signal?: AbortSignal
): Promise<AIBlockResult> {
  if (!input.notes?.trim()) throw new Error('Notes are required');
  const raw = await callOllama(buildBlockPrompt(input), signal);
  return parseJson<AIBlockResult>(raw);
}
