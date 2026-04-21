import { NextRequest, NextResponse } from 'next/server';
import { getScreenshotService } from '@/services/ScreenshotService';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const proposalId = searchParams.get('proposalId');

    if (!proposalId) {
        return NextResponse.json({ error: 'Proposal ID is required' }, { status: 400 });
    }

    try {
        const host = request.headers.get('host') || 'localhost:3000';
        const protocol = request.headers.get('x-forwarded-proto') || 'https';
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;
        // ?pdf=1 lets the page apply any PDF-only tweaks without changing
        // the shared view URL for humans. The viewer currently ignores it.
        const publicUrl = `${baseUrl}/view/${proposalId}?pdf=1`;

        const screenshotService = getScreenshotService();
        const pdfBuffer = await screenshotService.capturePdf(publicUrl, {
            format: 'A4',
            printBackground: true,
            margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
        });

        return new NextResponse(pdfBuffer as unknown as BodyInit, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="proposal-${proposalId}.pdf"`,
                'Cache-Control': 'private, no-store',
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error generating PDF:', message);
        return NextResponse.json(
            { error: 'Failed to generate PDF', details: message },
            { status: 500 }
        );
    }
}
