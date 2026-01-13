import { NextRequest, NextResponse } from 'next/server';
import puppeteerCore from 'puppeteer-core';

export const maxDuration = 60; // 60 seconds
export const dynamic = 'force-dynamic';

// Check if we're in Vercel production environment
// Vercel sets VERCEL=1
// Railway and other container platforms should use regular puppeteer
const isVercelProduction = process.env.VERCEL === '1';

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
        console.log("Environment:", { 
            NODE_ENV: process.env.NODE_ENV, 
            VERCEL: process.env.VERCEL,
            RAILWAY: process.env.RAILWAY_ENVIRONMENT,
            isVercelProduction 
        });

        // Use @sparticuz/chromium only for Vercel serverless
        // For Railway and other container platforms, use regular puppeteer
        if (isVercelProduction) {
            // Production (Vercel) - try @sparticuz/chromium first
            try {
                const chromium = await import('@sparticuz/chromium');
                // Type assertion for chromium API (TypeScript types may be incomplete)
                const chromiumApi = chromium as any;
                
                // Get executable path with error handling
                let executablePath: string;
                try {
                    // Try to get the executable path
                    // If it fails with the brotli error, we'll catch it and provide a better message
                    executablePath = await chromiumApi.executablePath();
                    console.log("Chromium executable path:", executablePath);
                    
                    // Verify the path exists (basic check)
                    if (!executablePath || executablePath.includes('does not exist')) {
                        throw new Error('Chromium executable path is invalid or missing');
                    }
                } catch (pathError) {
                    const errorMessage = (pathError as Error).message;
                    console.error("Error getting chromium executable path:", pathError);
                    
                    // Check if it's the brotli files error
                    if (errorMessage.includes('brotli') || errorMessage.includes('does not exist')) {
                        throw new Error(
                            `Chromium binary not found. This usually means @sparticuz/chromium package is not properly installed or configured. ` +
                            `Please ensure the package is correctly installed and the brotli files are available. ` +
                            `Original error: ${errorMessage}`
                        );
                    }
                    throw new Error(`Failed to get Chromium executable path: ${errorMessage}`);
                }

                browser = await puppeteerCore.launch({
                    args: [...(chromiumApi.args || []), '--disable-dev-shm-usage'],
                    defaultViewport: chromiumApi.defaultViewport,
                    executablePath: executablePath,
                    headless: chromiumApi.headless !== false,
                });
                console.log("Successfully launched browser with @sparticuz/chromium");
            } catch (chromiumError) {
                const errorMessage = (chromiumError as Error).message;
                console.error("Error with @sparticuz/chromium:", chromiumError);
                
                // If it's a brotli/files error, provide helpful guidance
                if (errorMessage.includes('brotli') || errorMessage.includes('does not exist')) {
                    console.log("Chromium package issue detected. This might be a deployment configuration problem.");
                    console.log("Attempting fallback to regular puppeteer (may not work on Vercel)...");
                } else {
                    console.log("Falling back to regular puppeteer...");
                }
                
                // Fallback to regular puppeteer if chromium fails
                // Note: This might not work on Vercel, but it's worth trying
                try {
                    const puppeteer = await import('puppeteer').then(m => m.default);
                    browser = await puppeteer.launch({
                        headless: true,
                        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
                    });
                    console.log("Successfully launched browser with puppeteer fallback");
                } catch (fallbackError) {
                    console.error("Fallback to puppeteer also failed:", fallbackError);
                    // Provide a more helpful error message
                    const isBrotliError = errorMessage.includes('brotli') || errorMessage.includes('does not exist');
                    const helpfulMessage = isBrotliError
                        ? `PDF generation failed: @sparticuz/chromium package is not properly configured. The Chromium binary files (brotli) are missing. Please check your deployment configuration and ensure @sparticuz/chromium is properly installed.`
                        : `PDF generation failed: ${errorMessage}`;
                    throw new Error(helpfulMessage);
                }
            }
        } else {
            // Local Development, Railway, or other Container platforms
            // Railway containers can use regular puppeteer with full Chrome installation
            // Dynamic import to avoid bundling 'puppeteer' in production build if user moves it to devDependencies
            const puppeteer = await import('puppeteer').then(m => m.default);
            
            // Check if PUPPETEER_EXECUTABLE_PATH is set (from Dockerfile)
            const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
            
            const launchOptions: Parameters<typeof puppeteer.launch>[0] = {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-software-rasterizer',
                ],
            };
            
            // Use the executable path from environment if available (Docker/Railway)
            if (executablePath) {
                launchOptions.executablePath = executablePath;
                console.log(`Using Chromium from: ${executablePath}`);
            }
            
            browser = await puppeteer.launch(launchOptions);
            console.log("Successfully launched browser with puppeteer (Railway/Container mode)");
        }

        const page = await browser.newPage();

        // 60s timeout
        page.setDefaultNavigationTimeout(60000);
        page.setDefaultTimeout(60000);

        // Set viewport to match web view container width (max-w-4xl = 896px)
        // This ensures consistent spacing between web view and PDF
        await page.setViewport({ width: 896, height: 1123, deviceScaleFactor: 2 });

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
