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
        const { content } = body;

        if (!content) {
            return NextResponse.json(
                { error: 'Page content is required' },
                { status: 400 }
            );
        }

        // Truncate content to avoid token limits if necessary (approx 30k chars is usually safe for flash)
        const truncatedContent = content.slice(0, 30000);

        const systemPrompt = `You are an expert SEO specialist. Analyze the provided website page content and generate optimized metadata.

Return ONLY a JSON object with the following fields:
{
  "title": "A compelling, SEO-friendly page title (30-60 characters)",
  "description": "A persuasive meta description (120-160 characters) summarizing the content",
  "ogTitle": "An engaging title for social sharing (usually similar to title but can be catchier)",
  "ogDescription": "A social-optimized description (can be same as description)"
}

Rules:
1. Ensure the title includes the main topic/keyword early.
2. The description should have a call to action if appropriate.
3. strictly adhere to character limits.
4. Do not include markdown formatting or explanations, just the JSON.`;

        const userPrompt = `Page Content:
${truncatedContent}

Generate SEO metadata.`;

        // Initialize Google GenAI
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
            return NextResponse.json(
                { error: 'No content generated.' },
                { status: 500 }
            );
        }

        let seoData;
        try {
            seoData = JSON.parse(generatedText);
        } catch (err) {
            console.error('JSON Parse Error:', err);
            // Simple fallback extraction if clean JSON isn't returned (though mimeType usually handles it)
            const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                seoData = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('Failed to parse AI response');
            }
        }

        return NextResponse.json({ success: true, data: seoData });

    } catch (error: any) {
        console.error('AI SEO generation error:', error);
        return NextResponse.json(
            { error: error.message || 'An unexpected error occurred.' },
            { status: 500 }
        );
    }
}
