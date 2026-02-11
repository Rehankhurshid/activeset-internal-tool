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
        const { prompt } = body;

        if (!prompt) {
            return NextResponse.json(
                { error: 'Prompt is required' },
                { status: 400 }
            );
        }

        const systemPrompt = `You are an expert SOP and Checklist creator.
Generate a comprehensive, professional checklist based on the user's request.
Output MUST be a valid JSON object matching this TypeScript interface:

interface SOPTemplate {
  name: string;
  description: string;
  icon: string; // A relevant emoji
  sections: {
    title: string;
    emoji?: string; // Section emoji
    order: number;
    items: {
      title: string;
      emoji?: string; // Item emoji
      status: 'not_started';
      order: number;
      notes?: string; 
      referenceLink?: string; // Optional URL if relevant context is known
      hoverImage?: string; // Optional Image URL if relevant
    }[];
  }[];
}

Guidelines:
- Create logical sections (e.g., Preparation, Execution, Review).
- Use professional yet accessible language.
- Include 3-8 items per section.
- Use relevant emojis.
- Ensure 'order' fields are sequential (0, 1, 2...).
- Status should always be 'not_started'.
- If the request implies specific tools (e.g., Webflow, Shopify), include specific steps for them.
`;

        const userPrompt = `Request: ${prompt}`;

        // Dynamic import for GoogleGenAI
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

        const response = await ai.models.generateContent({
            model: 'gemini-flash-latest',
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: systemPrompt },
                        { text: userPrompt }
                    ]
                }
            ],
            config: {
                responseMimeType: 'application/json',
            }
        });

        const generatedText = response.text;

        if (!generatedText) {
            throw new Error('No content generated');
        }

        let checklistData;
        try {
            checklistData = JSON.parse(generatedText);
        } catch (e) {
            // Fallback: try to find JSON block
            const match = generatedText.match(/\{[\s\S]*\}/);
            if (match) {
                checklistData = JSON.parse(match[0]);
            } else {
                throw new Error('Failed to parse AI response as JSON');
            }
        }

        return NextResponse.json({ success: true, data: checklistData });

    } catch (error: any) {
        console.error('AI Checklist Generation Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to generate checklist' },
            { status: 500 }
        );
    }
}
