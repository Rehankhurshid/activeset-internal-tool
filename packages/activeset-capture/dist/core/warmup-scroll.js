"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.warmupPageByScrolling = warmupPageByScrolling;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Scroll the full page to trigger lazy-loaded content and scroll-based animations.
 * Runs one extra pass if page height grows during scrolling.
 */
async function warmupPageByScrolling(page, options = {}) {
    const stepRatio = options.stepRatio ?? 0.8;
    const delayMs = options.delayMs ?? 200;
    const maxPasses = options.maxPasses ?? 2;
    const settleMs = options.settleMs ?? 600;
    let previousHeight = 0;
    let passes = 0;
    for (let pass = 0; pass < maxPasses; pass += 1) {
        passes += 1;
        const result = (await page.evaluate(`
      (async () => {
        const ratio = ${JSON.stringify(stepRatio)};
        const waitMs = ${JSON.stringify(delayMs)};

        function getScrollHeight() {
          const bodyHeight = document.body && document.body.scrollHeight ? document.body.scrollHeight : 0;
          const docHeight = document.documentElement && document.documentElement.scrollHeight ? document.documentElement.scrollHeight : 0;
          return Math.max(bodyHeight, docHeight);
        }

        const viewportHeight = Math.max(window.innerHeight || 0, 1);
        const step = Math.max(Math.floor(viewportHeight * ratio), 100);
        let targetHeight = getScrollHeight();

        for (let scrollY = 0; scrollY <= targetHeight; scrollY += step) {
          window.scrollTo(0, scrollY);
          await new Promise((resolve) => setTimeout(resolve, waitMs));

          const currentHeight = getScrollHeight();
          if (currentHeight > targetHeight) {
            targetHeight = currentHeight;
          }
        }

        window.scrollTo(0, targetHeight);
        await new Promise((resolve) => setTimeout(resolve, waitMs));

        return { finalHeight: getScrollHeight() };
      })()
    `));
        if (result.finalHeight <= previousHeight && pass > 0) {
            previousHeight = result.finalHeight;
            break;
        }
        previousHeight = result.finalHeight;
    }
    await page.evaluate('window.scrollTo(0, 0)');
    await sleep(settleMs);
    return {
        passes,
        finalHeight: previousHeight,
    };
}
//# sourceMappingURL=warmup-scroll.js.map