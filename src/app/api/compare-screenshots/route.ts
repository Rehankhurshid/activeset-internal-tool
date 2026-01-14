import { NextRequest, NextResponse } from 'next/server';
import { compareImages } from '@/lib/image-diff';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * Compare two screenshots and generate a diff image
 * POST body: { before: string (base64), after: string (base64) }
 */
export async function POST(request: NextRequest) {
    try {
        const { before, after } = await request.json();

        if (!before || !after) {
            return NextResponse.json(
                { error: 'Missing before or after screenshot' },
                { status: 400, headers: corsHeaders }
            );
        }

        const result = await compareImages(before, after);

        return NextResponse.json({
            success: true,
            diffImage: result.diffImage,
            diffPercentage: result.diffPercentage,
            diffPixelCount: result.diffPixelCount,
            width: result.width,
            height: result.height
        }, { headers: corsHeaders });

    } catch (error) {
        console.error('[compare-screenshots] Failed:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to compare screenshots' },
            { status: 500, headers: corsHeaders }
        );
    }
}
