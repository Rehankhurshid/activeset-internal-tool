#!/usr/bin/env node
"use strict";
/**
 * @activeset/schema-gen
 *
 * Generate Schema.org JSON-LD recommendations for a Webflow site's static
 * pages using a local Ollama model. Output is a portable JSON file you can
 * upload via the dashboard's "Import schema analyses" button.
 *
 * Commands:
 *   list      — list discovered static pages
 *   generate  — scrape, analyze, write JSON file
 *
 * Auth:
 *   --token <Webflow API token> or env WEBFLOW_API_TOKEN (.env or .env.local)
 *
 * Ollama:
 *   ollama serve
 *   ollama pull gemma4:e4b  (or gemma3:4b for a smaller/faster model)
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const node_fs_1 = require("node:fs");
const path = __importStar(require("node:path"));
const dotenv = __importStar(require("dotenv"));
const webflow_1 = require("./webflow");
const scrape_1 = require("./scrape");
const hash_1 = require("./hash");
const ollama_1 = require("./ollama");
dotenv.config({ path: '.env.local' });
dotenv.config();
function requireEnv(opts, key, envName) {
    const v = opts[key] || process.env[envName];
    if (!v) {
        console.error(`Missing --${key} or ${envName}`);
        process.exit(1);
    }
    return v;
}
const program = new commander_1.Command();
program
    .name('schema-gen')
    .description('Generate Schema.org JSON-LD recommendations for Webflow static pages using local Ollama')
    .version('0.1.0');
program
    .command('list')
    .description('List discovered static pages for a site')
    .requiredOption('--site <id>', 'Webflow site id')
    .option('--token <t>', 'Webflow API token (or env WEBFLOW_API_TOKEN)')
    .action(async (opts) => {
    const token = requireEnv(opts, 'token', 'WEBFLOW_API_TOKEN');
    const pages = await (0, webflow_1.fetchAllStaticPages)(opts.site, token);
    console.log(`Found ${pages.length} published static page(s):\n`);
    for (const p of pages) {
        console.log(`  ${p.id}  ${p.publishedPath || '/' + p.slug}  — ${p.title}`);
    }
});
program
    .command('generate')
    .description('Scrape + analyze + write JSON file (no network upload)')
    .requiredOption('--site <id>', 'Webflow site id')
    .requiredOption('--domain <d>', 'Custom live domain (e.g. www.example.com) — no .webflow.io')
    .option('--token <t>', 'Webflow API token (or env WEBFLOW_API_TOKEN)')
    .option('--out <file>', 'Output JSON path', 'schema-output.json')
    .option('--only <slugs>', 'Comma-separated slugs or paths to include')
    .option('--model <m>', 'Ollama model', process.env.OLLAMA_MODEL || 'gemma4:e4b')
    .option('--ollama-host <url>', 'Ollama base URL', process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434')
    .option('--concurrency <n>', 'Pages analyzed in parallel (single-GPU: keep low)', '1')
    .action(async (opts) => {
    const token = requireEnv(opts, 'token', 'WEBFLOW_API_TOKEN');
    console.log(`Fetching pages for site ${opts.site}…`);
    let targets = await (0, webflow_1.fetchAllStaticPages)(opts.site, token);
    if (opts.only) {
        const filter = new Set(opts.only.split(',').map((s) => s.trim()).filter(Boolean));
        targets = targets.filter((p) => filter.has(p.slug) || filter.has(p.publishedPath ?? ''));
    }
    if (targets.length === 0) {
        console.log('No static pages to process.');
        return;
    }
    console.log(`Processing ${targets.length} page(s) with model '${opts.model}' at ${opts.ollamaHost}\n`);
    const concurrency = Math.max(1, parseInt(opts.concurrency, 10) || 1);
    const entries = [];
    let processed = 0;
    let failed = 0;
    const queue = [...targets];
    async function worker() {
        while (queue.length) {
            const page = queue.shift();
            if (!page)
                return;
            const url = (0, webflow_1.buildLiveUrl)(opts.domain, page);
            const label = `[${++processed}/${targets.length}] ${page.title}`;
            try {
                console.log(`${label} → scrape ${url}`);
                const signals = await (0, scrape_1.scrapePageSignals)(url);
                const contentHash = (0, hash_1.computeContentHash)(signals);
                console.log(`${label} → ollama (${opts.model})`);
                const result = await (0, ollama_1.runOllama)(signals, {
                    baseUrl: opts.ollamaHost,
                    model: opts.model,
                });
                entries.push({
                    pageId: page.id,
                    pageTitle: page.title,
                    url,
                    contentHash,
                    result,
                });
                console.log(`${label} ✓ ${result.recommended.length} rec(s), pageType=${result.pageType}`);
            }
            catch (err) {
                failed++;
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`${label} ✗ ${msg}`);
            }
        }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    const file = {
        version: 1,
        generatedAt: new Date().toISOString(),
        model: opts.model,
        baseUrl: opts.ollamaHost,
        siteId: opts.site,
        domain: opts.domain,
        entries,
    };
    const outPath = path.resolve(process.cwd(), opts.out);
    await node_fs_1.promises.writeFile(outPath, JSON.stringify(file, null, 2), 'utf8');
    console.log(`\nDone. wrote=${entries.length} failed=${failed} → ${outPath}\n` +
        `Upload via the dashboard's "Import schema analyses" button (Webflow Pages tab).`);
});
program.parseAsync(process.argv).catch((err) => {
    console.error(err);
    process.exit(1);
});
