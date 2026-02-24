import type { Page } from 'puppeteer';
export interface WarmupScrollOptions {
    stepRatio?: number;
    delayMs?: number;
    maxPasses?: number;
    settleMs?: number;
}
/**
 * Scroll the full page to trigger lazy-loaded content and scroll-based animations.
 * Runs one extra pass if page height grows during scrolling.
 */
export declare function warmupPageByScrolling(page: Page, options?: WarmupScrollOptions): Promise<{
    passes: number;
    finalHeight: number;
}>;
