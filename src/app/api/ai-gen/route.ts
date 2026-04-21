
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:e4b';

async function ollamaFetch(path: string, init: RequestInit): Promise<Response> {
    const candidates = [OLLAMA_BASE_URL, 'http://localhost:11434', 'http://[::1]:11434'];
    const tried = new Set<string>();
    let lastErr: unknown = null;
    for (const base of candidates) {
        if (tried.has(base)) continue;
        tried.add(base);
        try {
            return await fetch(`${base.replace(/\/$/, '')}${path}`, init);
        } catch (err) {
            lastErr = err;
            console.warn(`[ollama] fetch failed for ${base}:`, err instanceof Error ? err.message : err);
        }
    }
    throw lastErr ?? new Error('All Ollama hosts unreachable');
}

export async function POST(request: NextRequest) {
    try {
        console.log('API Route (ai-gen) caught request — using Ollama', OLLAMA_MODEL);
        const body = await request.json();
        const { meetingNotes, clientName, agencyName, clientWebsite, projectDeadline, projectBudget } = body;

        if (!meetingNotes) {
            return NextResponse.json(
                { error: 'Meeting notes are required' },
                { status: 400 }
            );
        }

        const systemPrompt = `You are an expert proposal writer for a web design agency. Based on the meeting notes provided, generate professional proposal content.

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
      "price": "Formatted price (e.g., $1,500). If Project Budget (${projectBudget || 'Not provided'}) is set, distribute it logically across items so the sum equals the budget. Use the same currency as the budget." 
    }
  ],
  "pricingTotal": "The sum of all pricing items (e.g., '$3,000'). Validation: Must equal Project Budget if provided.",
  "timelinePhases": [
    { 
      "title": "Phase name", 
      "description": "What happens in this phase", 
      "duration": "Calculated duration (e.g., '2 weeks')",
      "startDate": "YYYY-MM-DD (Calculate based on start date today)",
      "endDate": "YYYY-MM-DD (Calculate based on duration)"
    }
  ],
  "projectType": "Type of project"
}

Guidelines:
- Be professional and concise.
- **Client Name**: Deduce if missing.
- **Pricing**: 
  - Use ONLY the specified titles.
  - **Budget & Currency**: If Project Budget is provided ('${projectBudget || ''}'), detect the currency (e.g., '$' or '€'). Distribute the total budget across the selected pricing items. Ensure the sum of all item prices equals the Project Budget.
  - If no budget is provided, use realistic inputs ($3,000-$15,000 range).
- **Timeline**: 
  - If Project Deadline is provided (${projectDeadline || 'Not provided'}), adjust phases to strictly fit within today and the deadline.
  - Calculate realistic 'startDate', 'endDate', and 'duration' for each phase. 
  - Ensure the total timeline ends by the deadline.
- **Services**: Select relevant keys from the provided list.
- **About Us**: Select the most appropriate template ID.`;

        const userPrompt = `Meeting Notes:
${meetingNotes}

${clientName ? `Client Name: ${clientName}` : ''}
${agencyName ? `Agency Name: ${agencyName}` : ''}
${clientWebsite ? `Client Website: ${clientWebsite}` : ''}
${projectDeadline ? `Project Deadline: ${projectDeadline}` : ''}
${projectBudget ? `Project Budget: ${projectBudget}` : ''}

Generate the proposal content based on these notes.`;

        try {
            const ollamaRes = await ollamaFetch('/api/generate', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    model: OLLAMA_MODEL,
                    prompt: `${systemPrompt}\n\n${userPrompt}\n\nRespond with valid JSON only, matching the schema above.`,
                    stream: false,
                    format: 'json',
                    options: { temperature: 0.3, num_ctx: 8192 },
                }),
            });

            if (!ollamaRes.ok) {
                const errBody = await ollamaRes.text().catch(() => '');
                return NextResponse.json(
                    { error: `Ollama request failed (${ollamaRes.status}): ${errBody || ollamaRes.statusText}` },
                    { status: 500 }
                );
            }

            const payload = (await ollamaRes.json()) as { response?: string };
            const generatedText = payload.response?.trim() ?? '';

            if (!generatedText) {
                return NextResponse.json(
                    { error: 'No content generated. Please try again.' },
                    { status: 500 }
                );
            }

            let proposalContent;
            try {
                proposalContent = JSON.parse(generatedText);
            } catch {
                const stripped = generatedText.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
                const jsonMatch = stripped.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        proposalContent = JSON.parse(jsonMatch[0]);
                    } catch {
                        return NextResponse.json({ error: 'Failed to parse AI response.' }, { status: 500 });
                    }
                } else {
                    return NextResponse.json({ error: 'Failed to parse AI response.' }, { status: 500 });
                }
            }

            return NextResponse.json({ success: true, data: proposalContent });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (apiError: any) {
            const message = apiError?.message || String(apiError);
            console.error(`Ollama execution error: ${message}`);
            return NextResponse.json(
                { error: `Cannot reach Ollama at ${OLLAMA_BASE_URL}. Start it with \`ollama serve\` and ensure \`${OLLAMA_MODEL}\` is pulled. (${message})` },
                { status: 500 }
            );
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error('AI generation error:', error);
        return NextResponse.json(
            { error: 'An unexpected error occurred. Please try again.' },
            { status: 500 }
        );
    }
}
