import type { Browser, Page } from 'puppeteer-core';

// Use puppeteer-core + @sparticuz/chromium in production (Vercel serverless
// can't run the full puppeteer package — bundled Chromium exceeds function
// limits and misses system libs). Locally, fall back to regular puppeteer so
// `npm run dev` still works without pulling down a separate Chromium.
const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

async function launchBrowser(): Promise<Browser> {
    if (isServerless) {
        const [{ default: chromium }, puppeteerCore] = await Promise.all([
            import('@sparticuz/chromium'),
            import('puppeteer-core'),
        ]);
        return puppeteerCore.default.launch({
            args: [...chromium.args, '--hide-scrollbars', '--disable-web-security'],
            defaultViewport: { width: 1280, height: 800 },
            executablePath: await chromium.executablePath(),
            headless: true,
        }) as unknown as Browser;
    }

    const puppeteer = (await import('puppeteer')).default;
    return puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
        ],
    }) as unknown as Browser;
}

export interface ScreenshotResult {
    screenshot: string; // Base64 encoded WebP
    fullPageScreenshot?: string; // Full page screenshot (optional)
    viewport: {
        width: number;
        height: number;
    };
    capturedAt: string;
}

export interface ResponsiveScreenshotResult {
    mobile: string; // Base64 WebP at 375px width
    tablet: string; // Base64 WebP at 768px width
    desktop: string; // Base64 WebP at 1280px width
    capturedAt: string;
}

/**
 * Service for capturing page screenshots using Puppeteer.
 * Scrolls the page first to trigger lazy-loaded content and animations.
 */
export class ScreenshotService {
    private browser: Browser | null = null;

    private async getBrowser(): Promise<Browser> {
        if (!this.browser || !this.browser.connected) {
            this.browser = await launchBrowser();
        }
        return this.browser;
    }

    /**
     * Capture a screenshot of a URL after scrolling to trigger animations.
     * @param url The page URL to capture
     * @param options Screenshot options
     */
    async captureScreenshot(
        url: string,
        options: {
            width?: number;
            height?: number;
            waitForSelector?: string;
            scrollDelay?: number;
            fullPage?: boolean;
        } = {}
    ): Promise<ScreenshotResult> {
        const {
            width = 1280,
            height = 800,
            scrollDelay = 100,
            fullPage = false
        } = options;

        const browser = await this.getBrowser();
        const page = await browser.newPage();

        try {
            // Set viewport
            await page.setViewport({ width, height });

            // Navigate to the page
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });

            // Scroll through the page to trigger lazy loading
            await this.scrollPage(page, scrollDelay);

            // Scroll back to top for the screenshot
            await page.evaluate(() => window.scrollTo(0, 0));
            await new Promise(resolve => setTimeout(resolve, 200));

            // Capture full page screenshot (captures entire scrollable page, not just viewport)
            const screenshotBuffer = await page.screenshot({
                type: 'webp',
                quality: 80,
                encoding: 'binary',
                fullPage: true
            }) as Buffer;

            const screenshot = screenshotBuffer.toString('base64');

            // Optionally capture full page screenshot
            let fullPageScreenshot: string | undefined;
            if (fullPage) {
                const fullPageBuffer = await page.screenshot({
                    type: 'webp',
                    quality: 80,
                    encoding: 'binary',
                    fullPage: true
                }) as Buffer;
                fullPageScreenshot = fullPageBuffer.toString('base64');
            }

            return {
                screenshot,
                fullPageScreenshot,
                viewport: { width, height },
                capturedAt: new Date().toISOString()
            };

        } finally {
            await page.close();
        }
    }

    /**
     * Capture a PDF of a URL.
     * @param url The page URL to capture
     * @param options PDF options
     */
    async capturePdf(
        url: string,
        options: {
            width?: number;
            height?: number;
            margin?: { top?: string; right?: string; bottom?: string; left?: string };
            format?: 'A4' | 'Letter';
            printBackground?: boolean;
        } = {}
    ): Promise<Buffer> {
        const {
            width = 1200,
            height = 800,
            margin = { top: '0px', right: '0px', bottom: '0px', left: '0px' },
            format = 'A4',
            printBackground = true
        } = options;

        const browser = await this.getBrowser();
        const page = await browser.newPage();

        try {
            await page.setViewport({ width, height, deviceScaleFactor: 2 });

            // Emulate print BEFORE navigating so the page hydrates with print
            // styles active and next/font CSS is requested for print-safe faces.
            await page.emulateMediaType('print');

            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 60000,
            });

            // 1) Wait for DOM to be complete.
            await page.waitForFunction(() => document.readyState === 'complete', {
                timeout: 15000,
            });

            // 2) Wait for Next.js font loading to finish. next/font writes
            //    CSS variables + @font-face rules; the browser promise
            //    document.fonts.ready resolves once all are downloaded and
            //    rendered. Without this, the PDF ships before Funnel Sans
            //    arrives and falls back to serif.
            await page
                .evaluate(
                    () =>
                        new Promise<void>((resolve) => {
                            const done = () => resolve();
                            if ('fonts' in document) {
                                (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready
                                    .then(done)
                                    .catch(done);
                            } else {
                                done();
                            }
                        })
                )
                .catch(() => undefined);

            // 3) Wait for all <img> tags to finish loading (or error out).
            await page
                .evaluate(
                    () =>
                        Promise.all(
                            Array.from(document.images).map((img) =>
                                img.complete && img.naturalHeight !== 0
                                    ? Promise.resolve()
                                    : new Promise<void>((resolve) => {
                                          img.addEventListener('load', () => resolve(), { once: true });
                                          img.addEventListener('error', () => resolve(), { once: true });
                                      })
                            )
                        )
                )
                .catch(() => undefined);

            // 4) Give layout one more frame to settle after late fonts.
            await new Promise((resolve) => setTimeout(resolve, 500));

            const pdfBuffer = await page.pdf({
                format: format as 'A4' | 'Letter',
                margin,
                printBackground,
                preferCSSPageSize: true,
            });

            return Buffer.from(pdfBuffer);
        } finally {
            await page.close();
        }
    }

    /**
     * Scroll through the page to trigger lazy loading
     */
    private async scrollPage(page: Page, delay: number): Promise<void> {
        await page.evaluate(async (scrollDelay) => {
            const scrollHeight = document.body.scrollHeight;
            const viewportHeight = window.innerHeight;
            const scrollStep = viewportHeight * 1.5;

            // Scroll down in steps
            for (let scrollPos = 0; scrollPos < scrollHeight; scrollPos += scrollStep) {
                window.scrollTo(0, scrollPos);
                await new Promise(r => setTimeout(r, scrollDelay));
            }

            // Scroll to absolute bottom
            window.scrollTo(0, scrollHeight);
            await new Promise(r => setTimeout(r, scrollDelay));
        }, delay);
    }

    /**
     * Capture screenshots at multiple viewport sizes for responsive testing.
     * @param url The page URL to capture
     */
    async captureResponsiveScreenshots(url: string): Promise<ResponsiveScreenshotResult> {
        const viewports = [
            { name: 'mobile', width: 375, height: 812 },   // iPhone X
            { name: 'tablet', width: 768, height: 1024 },  // iPad
            { name: 'desktop', width: 1280, height: 800 }  // Desktop
        ] as const;

        const browser = await this.getBrowser();
        const page = await browser.newPage();

        const screenshots: Record<string, string> = {};

        try {
            for (const { name, width, height } of viewports) {
                // Set viewport
                await page.setViewport({ width, height });

                // Navigate to the page (or just reload if already loaded)
                if (name === 'mobile') {
                    await page.goto(url, {
                        waitUntil: 'networkidle2',
                        timeout: 30000
                    });
                    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 10000 });
                } else {
                    // Just resize and wait for layout to settle
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                // Scroll to trigger lazy loading
                await this.scrollPage(page, 300);

                // Scroll back to top
                await page.evaluate(() => window.scrollTo(0, 0));
                await new Promise(resolve => setTimeout(resolve, 300));

                // Capture full page screenshot
                const screenshotBuffer = await page.screenshot({
                    type: 'webp',
                    quality: 80,
                    encoding: 'binary',
                    fullPage: true
                }) as Buffer;

                screenshots[name] = screenshotBuffer.toString('base64');
            }

            return {
                mobile: screenshots.mobile,
                tablet: screenshots.tablet,
                desktop: screenshots.desktop,
                capturedAt: new Date().toISOString()
            };

        } finally {
            await page.close();
        }
    }

    /**
     * Close the browser instance
     */
    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}

// Singleton instance for reuse
let screenshotService: ScreenshotService | null = null;

export function getScreenshotService(): ScreenshotService {
    if (!screenshotService) {
        screenshotService = new ScreenshotService();
    }
    return screenshotService;
}
