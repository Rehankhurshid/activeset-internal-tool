// Client-side AI dispatcher for the Proposal module.
//
// Default: call our server route → Vercel AI Gateway → a fast hosted
// model (Gemini 2.5 Flash by default). Typical end-to-end ~2-4s with
// strict zod-validated JSON. This is the right answer for a structured
// task run dozens of times a month.
//
// Fallback: set NEXT_PUBLIC_AI_SOURCE=ollama to bypass the server and
// call the user's local Ollama directly. Useful for offline, privacy,
// or experimenting.

const AI_SOURCE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_AI_SOURCE) || 'gateway';

const OLLAMA_BASE_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_OLLAMA_BASE_URL) ||
  'http://127.0.0.1:11434';

const OLLAMA_MODEL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_OLLAMA_MODEL) ||
  'gemma4:e4b';

// ---------------------------------------------------------------------------
// Public types (kept stable so callers don't need to change)
// ---------------------------------------------------------------------------

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
  | 'timeline-failed'
  | 'gateway-start'
  | 'gateway-done'
  | 'gateway-failed';

export interface DraftProgressEvent {
  stage: DraftStage;
  detail?: string;
}

export interface GenerateDraftOpts {
  signal?: AbortSignal;
  onProgress?: (event: DraftProgressEvent) => void;
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

export async function generateProposalDraft(
  input: AIDraftInput,
  opts: GenerateDraftOpts = {}
): Promise<AIDraftResult> {
  if (!input.meetingNotes?.trim()) throw new Error('Meeting notes are required');
  if (AI_SOURCE === 'ollama') return draftViaOllama(input, opts);
  return draftViaGateway(input, opts);
}

async function draftViaGateway(
  input: AIDraftInput,
  opts: GenerateDraftOpts
): Promise<AIDraftResult> {
  const emit = (stage: DraftStage, detail?: string) => opts.onProgress?.({ stage, detail });

  emit('gateway-start');
  let res: Response;
  try {
    res = await fetch('/api/ai/proposal-draft', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: opts.signal,
      body: JSON.stringify(input),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emit('gateway-failed', msg);
    throw new Error(`AI request failed: ${msg}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let detail = body;
    try {
      const parsed = JSON.parse(body);
      detail = parsed.details || parsed.error || body;
    } catch {
      // not JSON
    }
    emit('gateway-failed', detail);
    throw new Error(`AI draft failed (${res.status}): ${detail}`);
  }

  const payload = (await res.json()) as {
    success: boolean;
    data: AIDraftResult;
    siteContextFetched?: boolean;
  };
  emit('gateway-done', payload.siteContextFetched ? 'site-context' : 'no-site');
  return payload.data;
}

// ---------------------------------------------------------------------------
// Block
// ---------------------------------------------------------------------------

export async function generateProposalBlock(
  input: AIBlockInput,
  signal?: AbortSignal
): Promise<AIBlockResult> {
  if (!input.notes?.trim()) throw new Error('Notes are required');
  if (AI_SOURCE === 'ollama') return blockViaOllama(input, signal);

  const res = await fetch('/api/ai/proposal-block', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let detail = body;
    try {
      const parsed = JSON.parse(body);
      detail = parsed.details || parsed.error || body;
    } catch {
      // not JSON
    }
    throw new Error(`AI block failed (${res.status}): ${detail}`);
  }
  const payload = (await res.json()) as { data: AIBlockResult };
  return payload.data;
}

// ---------------------------------------------------------------------------
// Ollama fallback (legacy path — kept for offline/local-only usage)
// ---------------------------------------------------------------------------

interface OllamaCallOpts {
  signal?: AbortSignal;
  timeoutMs?: number;
  numCtx?: number;
}

async function callOllama(prompt: string, opts: OllamaCallOpts = {}): Promise<string> {
  const base = OLLAMA_BASE_URL.replace(/\/$/, '');
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const numCtx = opts.numCtx ?? 6144;

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
        model: OLLAMA_MODEL,
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
      throw new Error(`Ollama timed out after ${Math.round(timeoutMs / 1000)}s.`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot reach Ollama at ${base} (${msg}).`);
  } finally {
    clearTimeout(timeoutId);
    opts.signal?.removeEventListener('abort', onParentAbort);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ollama returned ${res.status}: ${body || res.statusText}`);
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

async function draftViaOllama(
  input: AIDraftInput,
  opts: GenerateDraftOpts
): Promise<AIDraftResult> {
  const emit = (stage: DraftStage, detail?: string) => opts.onProgress?.({ stage, detail });
  emit('basics-start');
  // Single coarse call to keep local fallback simple — used to be 3 calls
  // but the Gateway path is the happy path now.
  const prompt = `You are a senior proposal writer. Return valid JSON only matching this shape:
{ "title": string, "clientName": string, "clientDescription": string, "serviceKeys": string[], "aboutUsTemplateId": string, "finalDeliverable": string, "overview": string, "pricingItems": [{ "name": string, "description": string, "price": string }], "pricingTotal": string, "timelinePhases": [{ "title": string, "description": string, "duration": string, "startDate": string, "endDate": string }] }

BRIEF:
${input.meetingNotes}

${input.clientName ? `Client: ${input.clientName}` : ''}
${input.clientWebsite ? `Website: ${input.clientWebsite}` : ''}
${input.projectBudget ? `Budget: ${input.projectBudget}` : ''}
${input.projectDeadline ? `Deadline: ${input.projectDeadline}` : ''}`;
  try {
    const raw = await callOllama(prompt, { signal: opts.signal, timeoutMs: 180_000, numCtx: 6144 });
    const result = parseJson<AIDraftResult>(raw);
    emit('basics-done');
    return result;
  } catch (err) {
    emit('basics-failed', err instanceof Error ? err.message : String(err));
    throw err instanceof Error ? err : new Error(String(err));
  }
}

async function blockViaOllama(
  input: AIBlockInput,
  signal?: AbortSignal
): Promise<AIBlockResult> {
  const prompt = `Return valid JSON only for a proposal ${input.blockType} block based on these notes:
${input.notes}

${input.clientName ? `Client: ${input.clientName}` : ''}
${input.projectBudget ? `Budget: ${input.projectBudget}` : ''}
${input.projectDeadline ? `Deadline: ${input.projectDeadline}` : ''}
${input.currentData ? `Current: ${JSON.stringify(input.currentData)}` : ''}`;
  const raw = await callOllama(prompt, { signal, timeoutMs: 90_000 });
  return parseJson<AIBlockResult>(raw);
}
