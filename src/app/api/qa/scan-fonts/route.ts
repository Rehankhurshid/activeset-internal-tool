import { NextRequest, NextResponse } from 'next/server';
import { PageScanner } from '@/services/PageScanner';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get('url');

    if (!url) {
        return NextResponse.json(
            { success: false, details: 'Missing "url" query parameter' },
            { status: 400 }
        );
    }

    try {
        const scanner = new PageScanner();
        const result = await scanner.scanFonts(url);
        return NextResponse.json(result);
    } catch (error) {
        console.error('Font scan error:', error);
        return NextResponse.json(
            {
                success: false,
                details: 'Internal server error during font scan',
                error: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}
