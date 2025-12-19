
import { NextRequest, NextResponse } from 'next/server';
import { projectsService } from '@/services/database';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function POST(request: NextRequest) {
    try {
        console.log('API Route (audit) caught request');

        if (!GEMINI_API_KEY) {
            console.error('Missing API Key');
            return NextResponse.json(
                { error: 'Gemini API key not configured.' },
                { status: 500 }
            );
        }

        const body = await request.json();
        const { text, url, projectId, linkId } = body;

        if (!text) {
            return NextResponse.json(
                { error: 'Content text is required' },
                { status: 400 }
            );
        }

        const systemPrompt = `You are a Technical Editor and Proofreader. Analyze the provided website content text.
        
        Generate a JSON response with the following structure:
        {
            "score": number (0-100),
            "summary": "Short 2-3 sentence overview of the content's technical accuracy and spelling.",
            "strengths": ["List spelling errors found (e.g., 'Typo: recive -> receive')"], 
            "improvements": ["List technical or formatting issues (e.g., 'Inconsistent capitalization')"]
        }

        STRICT INSTRUCTIONS:
        1. **Spelling & Grammar**: List EVERY spelling mistake or major grammatical error in the "strengths" array. Label them clearly.
        2. **Technical Accuracy**: Check for professional consistency (e.g., capitalization of proper nouns, spacing). List these in "improvements".
        3. **Score**: Deduct points heavily for spelling errors. 100 = Perfect.
        4. **Do NOT** comment on tone, engagement, or marketing effectiveness. Only objective correctness.
        `;

        const userPrompt = `Analyze this content from ${url || 'the website'}:\n\n${text.substring(0, 10000)}`;

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
            throw new Error("No response from AI");
        }

        let auditResult;
        try {
            auditResult = JSON.parse(generatedText);
            // Add timestamp
            auditResult.lastRun = new Date().toISOString();
        } catch (e) {
            console.error("Failed to parse JSON", generatedText);
            // Fallback text parsing if JSON fails (simple heuristic)
            auditResult = {
                score: 50,
                summary: "AI analysis completed but returned raw text.",
                strengths: ["Content provided"],
                improvements: ["Retry analysis for structured data"],
                lastRun: new Date().toISOString()
            };
        }

        // Save to Firebase if IDs are provided
        if (projectId && linkId) {
            try {
                await projectsService.updateLink(projectId, linkId, { auditResult });
            } catch (dbError) {
                console.error("Failed to save to database", dbError);
                // Don't fail the request if just saving fails
            }
        }

        return NextResponse.json({ success: true, data: auditResult });

    } catch (error: any) {
        console.error('Audit API error:', error);
        return NextResponse.json(
            { error: error.message || 'An unexpected error occurred.' },
            { status: 500 }
        );
    }
}
