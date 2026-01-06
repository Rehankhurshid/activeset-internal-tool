import { pageScanner } from '../src/services/PageScanner';
import * as fs from 'fs';
import * as path from 'path';

const TARGET_URL = 'https://www.activeset.co/agency/webflow-maintenance-agency';
const NUM_SCANS = 5;
const DELAY_MS = 2000;

async function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    console.log(`Starting reproduction scan for ${TARGET_URL}`);

    const results: any[] = [];

    for (let i = 0; i < NUM_SCANS; i++) {
        console.log(`Scan ${i + 1}/${NUM_SCANS}...`);
        try {
            const result = await pageScanner.scan(TARGET_URL);
            results.push(result);
            console.log(`  Hash: ${result.fullHash} (Words: ${result.contentSnapshot.wordCount})`);

            // Additional inspection for Scan 1
            if (i === 0) {
                const $ = (await import('cheerio')).load(result.htmlSource);
                const scripts = $('script').length;
                const styles = $('style').length;
                const dynamicItems = $('.stories-listing_item, .stories-listing-wrapper').length;
                console.log(`  [Inspection] Removed approx: ${scripts} scripts, ${styles} styles`);
                console.log(`  [Inspection] Found known dynamic items (.stories-listing_item, etc): ${dynamicItems}`);

                fs.writeFileSync(path.join(__dirname, 'scan-output.html'), result.htmlSource);
                console.log(`  [Inspection] Saved raw HTML to scripts/scan-output.html`);
            }
        } catch (e) {
            console.error(`  Scan failed:`, e);
        }

        if (i < NUM_SCANS - 1) await wait(DELAY_MS);
    }

    // Compare results
    const baseResult = results[0];
    let hasDrift = false;
    let hasRawDiff = false;

    for (let i = 1; i < results.length; i++) {
        const current = results[i];

        // Check raw HTML diff
        if (current.htmlSource !== baseResult.htmlSource) {
            console.log(`\nRAW HTML MISMATCH between Scan 1 and Scan ${i + 1}`);
            hasRawDiff = true;
            // Simple length comparison
            console.log(`  Length: ${baseResult.htmlSource.length} vs ${current.htmlSource.length}`);
        }

        if (current.fullHash !== baseResult.fullHash) {
            console.log(`\nPROCESSED HASH MISMATCH detected between Scan 1 and Scan ${i + 1}`);
            hasDrift = true;

            // Compare fields to see what changed in contentSnapshot
            const keys = Object.keys(baseResult.contentSnapshot) as Array<keyof typeof baseResult.contentSnapshot>;

            for (const key of keys) {
                // Skip large text fields usually, but for specific debugging we might need them
                // For now, let's just JSON stringify and compare
                const v1 = JSON.stringify(baseResult.contentSnapshot[key]);
                const v2 = JSON.stringify(current.contentSnapshot[key]);

                if (v1 !== v2) {
                    console.log(`  Field '${String(key)}' changed:`);
                    if (v1.length < 200 && v2.length < 200) {
                        console.log(`    Base: ${v1}`);
                        console.log(`    Curr: ${v2}`);
                    } else {
                        console.log(`    (Value too long to print, length ${v1.length} vs ${v2.length})`);
                        // Determine difference index?
                    }
                }
            }
        }
    }

    if (!hasDrift) {
        console.log('\nNo drift detected in PROCESSED CONTENT. Hashes are stable.');
    } else {
        console.log('\nDrift detected in PROCESSED CONTENT.');
    }

    if (hasRawDiff) {
        console.log('However, RAW HTML did change between scans.');
    }
}

run().catch(console.error);
