import { NextRequest, NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { proposalDraftSchema, normalizeDraft } from '@/lib/proposal-ai/schemas';
import { fetchSiteContext, formatContextForPrompt } from '@/lib/proposal-ai/site-context';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DEFAULT_MODEL = process.env.PROPOSAL_AI_MODEL || 'google/gemini-2.5-flash';

interface DraftRequest {
  meetingNotes: string;
  clientName?: string;
  agencyName?: string;
  clientWebsite?: string;
  projectDeadline?: string;
  projectBudget?: string;
}

export async function POST(request: NextRequest) {
  let body: DraftRequest;
  try {
    body = (await request.json()) as DraftRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.meetingNotes?.trim()) {
    return NextResponse.json({ error: 'Meeting notes are required' }, { status: 400 });
  }

  const ctx = body.clientWebsite ? await fetchSiteContext(body.clientWebsite) : null;
  const today = new Date().toISOString().slice(0, 10);
  const budget = body.projectBudget?.trim();
  const deadline = body.projectDeadline?.trim();

  const prompt = `You are a senior proposal writer at a web design agency. Draft a structured proposal.

TODAY'S DATE: ${today}

RULES
- Client description must be grounded in the website context below — do not invent facts.
- Services: always include "website-design" and "webflow-dev" for website builds. Add "strategy-copy" or "copy" if the brief mentions strategy/copy. Add "branding-design" if it mentions brand/logo. Use "webflow-migration" only when migrating an existing site.
- About-us template: activeset=default; modern=tech/SaaS; corporate=B2B/enterprise/finance/legal; creative=design/media/arts; standard=generic.
${budget
      ? `- BUDGET ${budget}: pricing items MUST sum exactly to the budget, using the budget's currency. Distribute proportionally — Strategy & Copy ≈15%, Branding ≈20%, Website Design ≈30%, Webflow Development ≈35% — adjust for omitted categories so totals match.`
      : `- No budget provided. Use realistic numbers; total between $4,000 and $12,000 USD.`}
${deadline
      ? `- DEADLINE ${deadline}: the last phase's endDate MUST be on or before the deadline. Compress durations if needed.`
      : `- No deadline. Plan for a realistic 6–10 week total.`}
- Timeline: first phase startDate = ${today}. Each next phase startDate equals the previous endDate (or +1 day).
- Overview: 2–3 paragraphs that tie the client's goals (from the website/brief) to the scope of work.

CLIENT WEBSITE CONTEXT
${formatContextForPrompt(ctx)}

MEETING NOTES / BRIEF
${body.meetingNotes}

${body.clientName ? `Declared client name: ${body.clientName}` : ''}
${body.agencyName ? `Agency: ${body.agencyName}` : ''}
${body.clientWebsite ? `Website: ${body.clientWebsite}` : ''}`;

  try {
    const { object } = await generateObject({
      model: DEFAULT_MODEL,
      schema: proposalDraftSchema,
      prompt,
      temperature: 0.3,
    });
    const normalized = normalizeDraft(object);
    return NextResponse.json({ success: true, data: normalized, siteContextFetched: !!ctx });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[proposal-draft] generateObject failed:', message);
    return NextResponse.json(
      { error: 'AI draft failed', details: message },
      { status: 502 }
    );
  }
}
