import { NextRequest, NextResponse } from 'next/server';
import chromium from '@sparticuz/chromium';
import puppeteerCore from 'puppeteer-core';

export const maxDuration = 60; // 60 seconds
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    console.log("PDF Generation Request Received");
    let html;

    try {
        const body = await req.json();
        html = body.html;
    } catch (e) {
        console.error("Error parsing request body:", e);
        return NextResponse.json({ error: 'Invalid request body or payload too large' }, { status: 400 });
    }

    if (!html) {
        return NextResponse.json({ error: 'HTML content is required' }, { status: 400 });
    }

    let browser;
    try {
        console.log("Launching Puppeteer...");

        if (process.env.NODE_ENV === 'production') {
            // Production (Vercel)
            // @sparticuz/chromium specific args
            chromium.setGraphicsMode = false;

            browser = await puppeteerCore.launch({
                args: chromium.args,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                defaultViewport: (chromium as any).defaultViewport,
                executablePath: await chromium.executablePath(),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                headless: (chromium as any).headless,
            });
        } else {
            // Local Development or Container
            // Dynamic import to avoid bundling 'puppeteer' in production build if user moves it to devDependencies
            const puppeteer = await import('puppeteer').then(m => m.default);
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
        }

        const page = await browser.newPage();

        // 60s timeout
        page.setDefaultNavigationTimeout(60000);
        page.setDefaultTimeout(60000);

        // Set viewport to approximate A4 width (at 96 DPI, A4 is ~794px wide)
        await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });

        console.log("Setting content...");
        // Use networkidle2 (wait for <= 2 connections) which is more robust than networkidle0
        await page.setContent(html, { waitUntil: 'networkidle2', timeout: 60000 });

        console.log("Generating PDF...");
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '0px',
                bottom: '0px',
                left: '0px',
                right: '0px',
            },
            timeout: 60000
        });

        await browser.close();
        console.log("PDF Generated Successfully");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new NextResponse(new Blob([pdfBuffer as any]), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="proposal.pdf"',
            },
        });
    } catch (error: unknown) {
        console.error('Error generating PDF:', error);
        if (browser) {
            await browser.close().catch(console.error);
        }
        return NextResponse.json({
            error: (error as Error).message || 'Failed to generate PDF',
            details: (error as Error).stack
        }, { status: 500 });
    }
}
