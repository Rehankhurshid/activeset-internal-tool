import { NextRequest, NextResponse } from 'next/server';
import { getScreenshotService } from '@/services/ScreenshotService';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const proposalId = searchParams.get('proposalId');

    if (!proposalId) {
        return NextResponse.json({ error: 'Proposal ID is required' }, { status: 400 });
    }

    try {
        // Construct the public view URL
        // In a real app, this should be the absolute URL for the public view
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const publicUrl = `${baseUrl}/view/${proposalId}`;

        const screenshotService = getScreenshotService();
        const pdfBuffer = await screenshotService.capturePdf(publicUrl, {
            format: 'A4',
            printBackground: true,
            margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
        });

        return new NextResponse(pdfBuffer as any, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="proposal-${proposalId}.pdf"`,
            },
        });
    } catch (error) {
        console.error('Error generating PDF:', error);
        return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
    }
}
