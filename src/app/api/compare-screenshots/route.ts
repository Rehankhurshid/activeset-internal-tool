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
 * Convert a screenshot value to base64.
 * Handles both:
 * - URLs (fetches and converts to base64)
 * - Base64 strings (returns as-is)
 * - Data URLs (strips prefix and returns base64)
 */
async function toBase64(value: string): Promise<string> {
    // If it's a data URL, extract the base64 part
    if (value.startsWith('data:image/')) {
        const commaIndex = value.indexOf(',');
        if (commaIndex !== -1) {
            return value.substring(commaIndex + 1);
        }
    }
    
    // If it's an HTTP URL, fetch and convert
    if (value.startsWith('http://') || value.startsWith('https://')) {
        const response = await fetch(value);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer).toString('base64');
    }
    
    // Otherwise, assume it's already base64
    return value;
}

/**
 * Compare two screenshots and generate a diff image
 * POST body: { before: string (base64/URL), after: string (base64/URL) }
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

        // Convert URLs to base64 if needed
        const [beforeBase64, afterBase64] = await Promise.all([
            toBase64(before),
            toBase64(after)
        ]);

        const result = await compareImages(beforeBase64, afterBase64);

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
