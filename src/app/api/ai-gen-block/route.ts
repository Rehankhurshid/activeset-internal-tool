
import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function POST(request: NextRequest) {
    try {
        if (!GEMINI_API_KEY) {
            return NextResponse.json(
                { error: 'Gemini API key not configured.' },
                { status: 500 }
            );
        }

        const body = await request.json();
        const { blockType, notes, clientName, agencyName, clientWebsite, projectDeadline, projectBudget, currentData } = body;

        if (!notes) {
            return NextResponse.json(
                { error: 'Notes are required' },
                { status: 400 }
            );
        }

        // Optimized prompts for each block type
        const blockPrompts: Record<string, { system: string; user: string }> = {
            timeline: {
                system: `You are an expert project manager. Generate a realistic project timeline based on the provided information.

Return JSON in this exact format:
{
  "timelinePhases": [
    {
      "title": "Phase name (e.g., 'Discovery & Planning', 'Design', 'Development', 'Testing & Launch')",
      "description": "Detailed description of what happens in this phase",
      "duration": "Duration in weeks (e.g., '2 weeks', '4 weeks')",
      "startDate": "YYYY-MM-DD (calculate from today if not specified)",
      "endDate": "YYYY-MM-DD (calculate based on duration)"
    }
  ]
}

Guidelines:
- Create 3-5 phases that are logical and sequential
- If Project Deadline (${projectDeadline || 'Not provided'}) is provided, ensure all phases fit within the deadline
- Calculate realistic dates based on today's date
- Each phase should have clear deliverables
- Duration should be realistic (typically 1-6 weeks per phase)`,
                user: `Project Information:
${notes}

${clientName ? `Client: ${clientName}` : ''}
${agencyName ? `Agency: ${agencyName}` : ''}
${clientWebsite ? `Client Website: ${clientWebsite}` : ''}
${projectDeadline ? `Deadline: ${projectDeadline}` : ''}
${projectBudget ? `Budget: ${projectBudget}` : ''}

${currentData?.timeline?.phases?.length ? `Current Timeline:\n${JSON.stringify(currentData.timeline.phases, null, 2)}` : ''}

Generate an optimized timeline based on this information.`
            },
            pricing: {
                system: `You are an expert pricing strategist for web design agencies. Generate professional pricing based on the provided information.

Return JSON in this exact format:
{
  "pricingItems": [
    {
      "name": "Select ONLY from: 'Strategy & Copy', 'Branding', 'Website Design', 'Webflow Development'",
      "description": "Detailed description of what's included",
      "price": "Formatted price with currency (e.g., '$3,500', '€2,000')"
    }
  ],
  "pricingTotal": "Sum of all items (e.g., '$10,000')"
}

Guidelines:
- Use ONLY the specified service names
- If Project Budget (${projectBudget || 'Not provided'}) is provided, distribute it across items so the sum equals the budget
- Detect currency from budget (use same currency for all items)
- If no budget provided, use realistic pricing ($3,000-$15,000 range)
- Each item should have a clear, professional description
- Ensure pricingTotal equals the sum of all pricingItems`,
                user: `Project Information:
${notes}

${clientName ? `Client: ${clientName}` : ''}
${agencyName ? `Agency: ${agencyName}` : ''}
${clientWebsite ? `Client Website: ${clientWebsite}` : ''}
${projectBudget ? `Budget: ${projectBudget}` : ''}

${currentData?.pricing?.items?.length ? `Current Pricing:\n${JSON.stringify(currentData.pricing.items, null, 2)}` : ''}

Generate optimized pricing based on this information.`
            },
            clientDescription: {
                system: `You are an expert copywriter. Write a professional, compelling description of the client/company based on the provided information.

Return JSON in this exact format:
{
  "clientDescription": "A 2-3 sentence professional description of the client company, their industry, what they do, and their mission/values. Make it engaging and relevant to the project context."
}

Guidelines:
- Be professional and concise (2-3 sentences)
- Include industry, what they do, and their mission if available
- Use the client website (${clientWebsite || 'if provided'}) to gather insights
- Make it relevant to the project context
- Write in third person`,
                user: `Project Information:
${notes}

${clientName ? `Client Name: ${clientName}` : ''}
${clientWebsite ? `Client Website: ${clientWebsite}` : ''}
${agencyName ? `Agency: ${agencyName}` : ''}

${currentData?.clientDescription ? `Current Description: ${currentData.clientDescription}` : ''}

Generate an optimized client description based on this information.`
            },
            finalDeliverable: {
                system: `You are an expert proposal writer. Write a clear, professional description of the final deliverable for this project.

Return JSON in this exact format:
{
  "finalDeliverable": "A clear, professional description (2-3 sentences) of what the client will receive at the end of the project. Include key features, platform, and benefits."
}

Guidelines:
- Be specific about what will be delivered
- Mention the platform/technology (e.g., Webflow, WordPress)
- Include key features and benefits
- Keep it concise (2-3 sentences)
- Make it compelling and clear`,
                user: `Project Information:
${notes}

${clientName ? `Client: ${clientName}` : ''}
${agencyName ? `Agency: ${agencyName}` : ''}
${clientWebsite ? `Client Website: ${clientWebsite}` : ''}

${currentData?.finalDeliverable ? `Current Final Deliverable: ${currentData.finalDeliverable}` : ''}

Generate an optimized final deliverable description based on this information.`
            }
        };

        const prompt = blockPrompts[blockType];
        if (!prompt) {
            return NextResponse.json(
                { error: 'Invalid block type' },
                { status: 400 }
            );
        }

        // Initialize Google GenAI
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

        const response = await ai.models.generateContent({
            model: 'gemini-flash-latest',
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: prompt.system },
                        { text: prompt.user }
                    ]
                }
            ],
            config: {
                responseMimeType: 'application/json',
            }
        });

        const generatedText = response.text;

        if (!generatedText) {
            return NextResponse.json(
                { error: 'No content generated. Please try again.' },
                { status: 500 }
            );
        }

        let blockContent;
        try {
            blockContent = JSON.parse(generatedText);
        } catch (err) {
            const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                blockContent = JSON.parse(jsonMatch[0]);
            } else {
                return NextResponse.json(
                    { error: 'Failed to parse AI response.' },
                    { status: 500 }
                );
            }
        }

        return NextResponse.json({ success: true, data: blockContent });

    } catch (error: any) {
        console.error('AI block generation error:', error);
        return NextResponse.json(
            { error: error?.message || 'An unexpected error occurred. Please try again.' },
            { status: 500 }
        );
    }
}
