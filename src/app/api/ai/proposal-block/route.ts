import { NextRequest, NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { z } from 'zod';
import {
    blockTimelineSchema,
    blockPricingSchema,
    blockClientDescriptionSchema,
    blockFinalDeliverableSchema,
    type BlockType,
} from '@/lib/proposal-ai/schemas';
import { fetchSiteContext, formatContextForPrompt } from '@/lib/proposal-ai/site-context';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DEFAULT_MODEL = process.env.PROPOSAL_AI_MODEL || 'google/gemini-2.5-flash';

interface BlockRequest {
    blockType: BlockType;
    notes: string;
    clientName?: string;
    agencyName?: string;
    clientWebsite?: string;
    projectDeadline?: string;
    projectBudget?: string;
    currentData?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
    let body: BlockRequest;
    try {
        body = (await request.json()) as BlockRequest;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body.notes?.trim()) {
        return NextResponse.json({ error: 'Notes are required' }, { status: 400 });
    }

    const schema = selectSchema(body.blockType);
    if (!schema) {
        return NextResponse.json({ error: 'Invalid blockType' }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const budget = body.projectBudget?.trim();
    const deadline = body.projectDeadline?.trim();

    let sitePrompt = '';
    if (body.blockType === 'clientDescription' && body.clientWebsite) {
        const ctx = await fetchSiteContext(body.clientWebsite);
        sitePrompt = `\n\nCLIENT WEBSITE CONTEXT\n${formatContextForPrompt(ctx)}`;
    }

    const instructions: Record<BlockType, string> = {
        timeline: `Generate 3–5 sequential project phases. First phase startDate = ${today}. Each phase's startDate equals the previous endDate (or +1 day). ${deadline ? `Last endDate MUST be on or before ${deadline} — compress durations as needed.` : 'Plan for a realistic 6–10 week total.'}`,
        pricing: `Generate 2–4 pricing items from the allowed service names. ${budget ? `BUDGET ${budget}: items MUST sum exactly to the budget using its currency. Distribute proportionally — Strategy & Copy ≈15%, Branding ≈20%, Website Design ≈30%, Webflow Development ≈35% — adjusting for omitted categories.` : 'Use realistic numbers. Total between $4,000 and $12,000 USD.'}`,
        clientDescription: `Write 2–3 professional sentences in third person grounded in the website context. Include industry, what the company does, and mission/value prop.`,
        finalDeliverable: `Write 2–3 sentences describing what the client will receive. Mention the platform (Webflow) and key benefits. Be specific to this project.`,
    };

    const prompt = `${instructions[body.blockType]}

BRIEF / NOTES
${body.notes}

${body.clientName ? `Client: ${body.clientName}` : ''}
${body.agencyName ? `Agency: ${body.agencyName}` : ''}
${body.clientWebsite ? `Website: ${body.clientWebsite}` : ''}
${budget ? `Budget: ${budget}` : ''}
${deadline ? `Deadline: ${deadline}` : ''}

${body.currentData ? `CURRENT VALUES (for reference — produce an improved version):\n${JSON.stringify(body.currentData, null, 2)}` : ''}
${sitePrompt}`;

    try {
        const { object } = await generateObject({
            model: DEFAULT_MODEL,
            schema: schema as unknown as z.ZodType<unknown>,
            prompt,
            temperature: 0.3,
        });
        return NextResponse.json({ success: true, data: object });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[proposal-block/${body.blockType}] generateObject failed:`, message);
        return NextResponse.json(
            { error: 'AI block generation failed', details: message },
            { status: 502 }
        );
    }
}

function selectSchema(blockType: BlockType) {
    switch (blockType) {
        case 'timeline':
            return blockTimelineSchema;
        case 'pricing':
            return blockPricingSchema;
        case 'clientDescription':
            return blockClientDescriptionSchema;
        case 'finalDeliverable':
            return blockFinalDeliverableSchema;
        default:
            return null;
    }
}
