
import { createHash } from 'crypto';
import * as cheerio from 'cheerio';

async function debugScan(url: string) {
    console.log(`Scanning ${url} ...`);

    // Pass 1
    const t1 = await fetchAndClean(url);
    console.log(`Pass 1 Hash: ${t1.hash}`);

    console.log('Waiting 5 seconds...');
    await new Promise(r => setTimeout(r, 5000));

    // Pass 2
    const t2 = await fetchAndClean(url);
    console.log(`Pass 2 Hash: ${t2.hash}`);

    if (t1.hash === t2.hash) {
        console.log('SUCCESS: Hashes match. Stable with filtering!');
    } else {
        console.log('FAILURE: Hashes mismatch!');
        // Find first difference
        let firstDiffIdx = -1;
        const len = Math.min(t1.html.length, t2.html.length);
        for (let i = 0; i < len; i++) {
            if (t1.html[i] !== t2.html[i]) {
                firstDiffIdx = i;
                break;
            }
        }
        if (firstDiffIdx !== -1) {
            console.log(`Difference found at index ${firstDiffIdx}`);
            const start = Math.max(0, firstDiffIdx - 50);
            const end = Math.min(t1.html.length, firstDiffIdx + 100);

            console.log('--- PASS 1 CONTEXT ---');
            console.log(t1.html.substring(start, end));
            console.log('----------------------');
            console.log('--- PASS 2 CONTEXT ---');
            console.log(t2.html.substring(start, Math.min(t2.html.length, firstDiffIdx + 100)));
            console.log('----------------------');
            let caret = '';
            for (let k = 0; k < 50; k++) caret += ' ';
            caret += '^';
            console.log(caret);
        }
    }
}

async function fetchAndClean(url: string) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'ActiveSet-Audit-Bot/1.0 (+https://activeset.co)',
        },
    });
    const html = await response.text();

    const $ = cheerio.load(html);

    // Simulate PageScanner cleaning + FIX
    $('script, style, noscript, iframe, svg').remove();

    // NEW: Remove dynamic noise
    // The specific class from debug log was "stories-listing_item"
    $('.stories-listing_item').remove();
    $('.stories-listing-wrapper').remove();
    $('.w-dyn-list').remove();

    let cleanedHtml = $.html();
    cleanedHtml = cleanedHtml.replace(/<!--\s*Last Published:.*?-->/g, '');

    const hash = createHash('sha256').update(cleanedHtml).digest('hex');
    return { html: cleanedHtml, hash };
}

const targetUrl = process.argv[2] || 'https://www.tessell.com';
debugScan(targetUrl).catch(console.error);
