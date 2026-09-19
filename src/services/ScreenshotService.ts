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

// Chrome's WebP encoder refuses any side longer than this, and page.screenshot
// hands back an empty buffer rather than throwing. Long marketing pages
// (activeset.co is ~19,800px) were silently uploading 0-byte files.
const WEBP_MAX_DIMENSION = 16383;

// After the scroll walk, keep waiting only while lazy images are still
// landing. Locally the ones that are going to arrive do so within ~100ms of
// each other; the quiet window leaves headroom for Lambda's colder network
// path, and the budget is a backstop so a stalled page cannot eat the scan.
const LAZY_QUIET_MS = 400;
const LAZY_BUDGET_MS = 1500;

export interface ScreenshotResult {
    screenshot: Uint8Array; // WebP bytes, ready for uploadBytes
    viewport: {
        width: number;
        height: number;
    };
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
     * Capture a full-page screenshot of a URL after walking it so lazy content loads.
     * @param url The page URL to capture
     * @param options Screenshot options
     */
    async captureScreenshot(
        url: string,
        options: {
            width?: number;
            height?: number;
        } = {}
    ): Promise<ScreenshotResult> {
        const {
            width = 1280,
            height = 800
        } = options;

        const browser = await this.getBrowser();
        const page = await browser.newPage();

        try {
            await page.setViewport({ width, height });

            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });

            await this.triggerLazyContent(page);

            // Shrink the render scale just enough for the whole page to fit under
            // the encoder's limit. Cropping would lose the footer, and going via
            // PNG + sharp costs a second encode for the same result.
            const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
            if (pageHeight > WEBP_MAX_DIMENSION) {
                const deviceScaleFactor = Math.floor((WEBP_MAX_DIMENSION / pageHeight) * 100) / 100;
                await page.setViewport({ width, height, deviceScaleFactor });
            }

            // Full page on purpose: the UI shows current vs previous at full width,
            // so a viewport-only shot would miss changes below the fold.
            const screenshot = await page.screenshot({
                type: 'webp',
                quality: 80,
                fullPage: true
            });

            if (screenshot.byteLength === 0) {
                throw new Error(`Screenshot of ${url} came back empty (page height ${pageHeight}px)`);
            }

            return {
                screenshot,
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
     * Walk the page so lazy content starts loading before the full-page capture.
     *
     * Native loading="lazy" and IntersectionObserver-driven images only start
     * once they come near the viewport, and fullPage capture does not scroll
     * for us. Yielding one frame per step is what lets those observers fire;
     * the fixed 100ms sleeps this replaces were a proxy for that plus download
     * time. Download time is now waited for explicitly, and adaptively: some
     * images never finish (marquee clones, hidden slides, Framer's own lazy
     * swap), so "all pending images loaded" is not a condition that can be
     * waited for. Instead the wait ends once nothing new has landed for a
     * quiet window.
     */
    private async triggerLazyContent(page: Page): Promise<void> {
        await page.evaluate(async (quietMs, budgetMs) => {
            // rAF can stall on a throttled tab; a stuck frame must not hang the scan.
            const frame = () =>
                new Promise<void>((resolve) => {
                    let done = false;
                    const finish = () => {
                        if (!done) {
                            done = true;
                            resolve();
                        }
                    };
                    requestAnimationFrame(finish);
                    setTimeout(finish, 50);
                });

            const step = window.innerHeight;
            // Re-read the height each step: lazy content grows the page as it lands.
            for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
                window.scrollTo(0, y);
                await frame();
            }
            window.scrollTo(0, document.documentElement.scrollHeight);
            await frame();

            window.scrollTo(0, 0);
            await frame();

            // Only images that occupy layout can show up in the shot; display:none
            // ones stay pending forever and would only stretch the wait.
            const pending = Array.from(document.images).filter((img) => {
                if (img.complete) return false;
                const rect = img.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            });
            if (pending.length === 0) return;

            const start = performance.now();
            let lastLanded = start;
            let remaining = pending.length;
            const landed = () => {
                remaining -= 1;
                lastLanded = performance.now();
            };
            for (const img of pending) {
                img.addEventListener('load', landed, { once: true });
                img.addEventListener('error', landed, { once: true });
            }

            while (
                remaining > 0 &&
                performance.now() - lastLanded < quietMs &&
                performance.now() - start < budgetMs
            ) {
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
            await frame();
        }, LAZY_QUIET_MS, LAZY_BUDGET_MS);
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
