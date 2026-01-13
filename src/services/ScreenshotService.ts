import puppeteer, { Browser, Page } from 'puppeteer';

export interface ScreenshotResult {
    screenshot: string; // Base64 encoded PNG
    fullPageScreenshot?: string; // Full page screenshot (optional)
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
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: true,
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process'
                ]
            });
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
            scrollDelay = 500,
            fullPage = false
        } = options;

        const browser = await this.getBrowser();
        const page = await browser.newPage();

        try {
            // Set viewport
            await page.setViewport({ width, height });

            // Navigate to the page
            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Wait for page to be fully loaded
            await page.waitForFunction(() => document.readyState === 'complete', { timeout: 10000 });

            // Scroll through the page to trigger lazy loading and animations
            await this.scrollPage(page, scrollDelay);

            // Wait a bit more for animations to settle
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Scroll back to top for the main screenshot
            await page.evaluate(() => window.scrollTo(0, 0));
            await new Promise(resolve => setTimeout(resolve, 300));

            // Capture screenshot
            const screenshotBuffer = await page.screenshot({
                type: 'png',
                encoding: 'binary',
                fullPage: false
            }) as Buffer;

            const screenshot = screenshotBuffer.toString('base64');

            // Optionally capture full page screenshot
            let fullPageScreenshot: string | undefined;
            if (fullPage) {
                const fullPageBuffer = await page.screenshot({
                    type: 'png',
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
            // Set viewport
            await page.setViewport({ width, height });

            // Navigate to the page
            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 60000
            });

            // Wait for page to be fully loaded
            await page.waitForFunction(() => document.readyState === 'complete', { timeout: 10000 });

            // Wait for any specific selectors if needed (can be added to options)

            // Add extra wait for fonts and images to settle
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Generate PDF
            await page.emulateMediaType('print');
            const pdfBuffer = await page.pdf({
                format: format as any,
                margin,
                printBackground,
                preferCSSPageSize: true
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
            const scrollStep = viewportHeight * 0.8;

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
