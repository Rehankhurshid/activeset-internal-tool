#!/usr/bin/env node
"use strict";
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
exports.runCaptureLocalCli = runCaptureLocalCli;
const os = __importStar(require("node:os"));
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const node_child_process_1 = require("node:child_process");
const promises_1 = require("node:readline/promises");
const engine_1 = require("../core/engine");
const io_1 = require("../core/io");
function printHelp() {
    console.log(`
Local-first responsive screenshot capture

Usage:
  activeset-capture run --project "My Project" --sitemap https://example.com/sitemap.xml
  activeset-capture run --project "My Project" [--urls "https://a.com,https://b.com"] [options]
  activeset-capture run --project "My Project" --file ./urls.txt [options]
  cat urls.txt | activeset-capture run --project "My Project" [options]

Required:
  --project <name>         Manual project/run name
  One input source: --sitemap, --urls, --file, or stdin

Options:
  --sitemap <url>          Fetch URLs from a sitemap.xml (supports index + hreflang)
  --out <dir>              Base output directory (default: ./captures)
  --concurrency <n>        Parallel URL workers (default: 3)
  --timeout-ms <n>         Per navigation timeout in ms (default: 45000)
  --retries <n>            Retries per URL after first attempt (default: 1)
  --devices <list>         desktop,mobile (default: desktop,mobile)
  --format <webp|png>      Screenshot format (default: webp)
  --warmup <always|off>    Scroll-first warmup mode (default: always)
  --upload <url>           Upload captures and get a shareable link
  --no-open                Don't open the output folder after capture
  --help                   Show this help

Output:
  <out>/<project-slug>-<timestamp>/manifest.json
  <out>/<project-slug>-<timestamp>/desktop/*.webp|png
  <out>/<project-slug>-<timestamp>/mobile/*.webp|png
  <out>/<project-slug>-<timestamp>/errors.json (if partial/failed URLs)
`);
}
function parseInteger(value, flag) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) {
        throw new Error(`Invalid value for ${flag}: ${value}`);
    }
    return parsed;
}
function parseDevices(value) {
    const parsed = value
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length > 0);
    if (parsed.length === 0) {
        throw new Error('The --devices flag requires at least one value.');
    }
    const unique = Array.from(new Set(parsed));
    const invalid = unique.filter((item) => item !== 'desktop' && item !== 'mobile');
    if (invalid.length > 0) {
        throw new Error(`Unsupported devices: ${invalid.join(', ')}`);
    }
    return unique;
}
function parseFormat(value) {
    const normalized = value.trim().toLowerCase();
    if (normalized !== 'webp' && normalized !== 'png') {
        throw new Error(`Unsupported format: ${value}`);
    }
    return normalized;
}
function parseWarmup(value) {
    const normalized = value.trim().toLowerCase();
    if (normalized !== 'always' && normalized !== 'off') {
        throw new Error(`Unsupported warmup mode: ${value}`);
    }
    return normalized;
}
function parseArgs(argv) {
    const parsed = { help: false };
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === '--help' || token === '-h') {
            parsed.help = true;
            continue;
        }
        if (token === '--no-open') {
            parsed.noOpen = true;
            continue;
        }
        if (!token.startsWith('--')) {
            throw new Error(`Unexpected argument: ${token}`);
        }
        const flag = token.slice(2);
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) {
            throw new Error(`Missing value for --${flag}`);
        }
        switch (flag) {
            case 'project':
                parsed.projectName = value;
                break;
            case 'urls':
                parsed.urlsValue = value;
                break;
            case 'file':
                parsed.filePath = value;
                break;
            case 'sitemap':
                parsed.sitemapUrl = value;
                break;
            case 'out':
                parsed.outputDir = value;
                break;
            case 'concurrency':
                parsed.concurrency = parseInteger(value, '--concurrency');
                break;
            case 'timeout-ms':
                parsed.timeoutMs = parseInteger(value, '--timeout-ms');
                break;
            case 'retries':
                parsed.retries = parseInteger(value, '--retries');
                break;
            case 'devices':
                parsed.devices = parseDevices(value);
                break;
            case 'format':
                parsed.format = parseFormat(value);
                break;
            case 'warmup':
                parsed.warmup = parseWarmup(value);
                break;
            case 'upload':
                parsed.upload = value;
                break;
            default:
                throw new Error(`Unknown flag: --${flag}`);
        }
        index += 1;
    }
    return parsed;
}
async function readStdinText() {
    if (process.stdin.isTTY) {
        return '';
    }
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    return Buffer.concat(chunks).toString('utf8');
}
async function askWithDefault(rl, label, defaultValue = '') {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    const answer = await rl.question(`${label}${suffix}: `);
    const trimmed = answer.trim();
    return trimmed || defaultValue;
}
async function collectUrlsFromPrompt(rl) {
    console.log('\nPaste URLs one per line. Press Enter on empty line to finish.');
    const lines = [];
    while (true) {
        const prompt = lines.length === 0 ? 'URL 1: ' : `URL ${lines.length + 1}: `;
        const value = await rl.question(prompt);
        if (!value.trim())
            break;
        lines.push(value.trim());
    }
    return lines.join('\n');
}
async function maybePromptForMissingArgs(initialArgs) {
    const missingProject = !initialArgs.projectName || !initialArgs.projectName.trim();
    const missingInputSource = !initialArgs.urlsValue && !initialArgs.filePath && !initialArgs.sitemapUrl && Boolean(process.stdin.isTTY);
    if (!process.stdin.isTTY || (!missingProject && !missingInputSource)) {
        return initialArgs;
    }
    const rl = (0, promises_1.createInterface)({
        input: process.stdin,
        output: process.stdout,
    });
    try {
        const nextArgs = { ...initialArgs };
        if (missingProject) {
            nextArgs.projectName = await askWithDefault(rl, 'Project name', 'New Client Project');
        }
        if (missingInputSource) {
            console.log('\nHow do you want to provide URLs?');
            console.log('  1) Paste URLs now');
            console.log('  2) Load URLs from a file');
            const sourceChoice = await askWithDefault(rl, 'Choose 1 or 2', '1');
            if (sourceChoice.trim() === '2') {
                nextArgs.filePath = await askWithDefault(rl, 'Path to URL file');
            }
            else {
                nextArgs.urlsValue = await collectUrlsFromPrompt(rl);
            }
        }
        return nextArgs;
    }
    finally {
        rl.close();
    }
}
function normalizeFilePathInput(filePath) {
    let normalized = filePath.trim();
    if ((normalized.startsWith('"') && normalized.endsWith('"')) ||
        (normalized.startsWith("'") && normalized.endsWith("'"))) {
        normalized = normalized.slice(1, -1).trim();
    }
    if (normalized.startsWith('~/')) {
        normalized = `${os.homedir()}${normalized.slice(1)}`;
    }
    return normalized;
}
async function fetchSitemapXml(url) {
    const res = await fetch(url, {
        headers: { 'User-Agent': 'ActiveSet-Capture/1.0' },
    });
    if (!res.ok) {
        throw new Error(`Failed to fetch sitemap (${res.status}): ${url}`);
    }
    return res.text();
}
function extractTagValues(xml, tag) {
    const regex = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'gi');
    const values = [];
    let match;
    while ((match = regex.exec(xml)) !== null) {
        values.push(match[1].trim());
    }
    return values;
}
function extractHreflangLangs(xml) {
    const regex = /hreflang=["']([^"']+)["']/gi;
    const langs = [];
    let match;
    while ((match = regex.exec(xml)) !== null) {
        langs.push(match[1].toLowerCase());
    }
    return langs;
}
function detectLanguageFromUrl(url) {
    try {
        const pathname = new URL(url).pathname;
        const first = pathname.split('/').filter(Boolean)[0]?.toLowerCase();
        if (first && /^[a-z]{2}(-[a-z]{2,4})?$/.test(first)) {
            return first;
        }
    }
    catch { /* ignore */ }
    return null;
}
async function parseSitemap(url, depth = 0) {
    if (depth > 3) {
        return { urls: [], languages: new Map(), isSitemapIndex: false, childSitemaps: 0 };
    }
    const xml = await fetchSitemapXml(url);
    const isSitemapIndex = xml.includes('<sitemapindex');
    const result = {
        urls: [],
        languages: new Map(),
        isSitemapIndex,
        childSitemaps: 0,
    };
    if (isSitemapIndex) {
        // Sitemap index — fetch each child sitemap
        const childUrls = extractTagValues(xml, 'loc');
        result.childSitemaps = childUrls.length;
        console.log(`  Found sitemap index with ${childUrls.length} child sitemaps`);
        for (const childUrl of childUrls) {
            process.stdout.write(`  Fetching ${childUrl}...\r`);
            const child = await parseSitemap(childUrl, depth + 1);
            result.urls.push(...child.urls);
            for (const [lang, count] of child.languages) {
                result.languages.set(lang, (result.languages.get(lang) || 0) + count);
            }
        }
    }
    else {
        // Regular sitemap — extract URLs
        const locs = extractTagValues(xml, 'loc');
        const httpUrls = locs.filter((u) => u.startsWith('http'));
        result.urls = httpUrls;
        // Detect languages from hreflang attributes
        const hreflangs = extractHreflangLangs(xml);
        for (const lang of hreflangs) {
            if (lang !== 'x-default') {
                result.languages.set(lang, (result.languages.get(lang) || 0) + 1);
            }
        }
        // Also detect languages from URL path prefixes
        if (result.languages.size === 0) {
            for (const u of httpUrls) {
                const lang = detectLanguageFromUrl(u);
                if (lang) {
                    result.languages.set(lang, (result.languages.get(lang) || 0) + 1);
                }
            }
        }
    }
    // Deduplicate URLs
    result.urls = [...new Set(result.urls)];
    return result;
}
function formatLangLabel(code) {
    const labels = {
        en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
        pt: 'Portuguese', nl: 'Dutch', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
        ar: 'Arabic', ru: 'Russian', hi: 'Hindi', tr: 'Turkish', sv: 'Swedish',
        da: 'Danish', no: 'Norwegian', fi: 'Finnish', pl: 'Polish',
        'pt-br': 'Portuguese (BR)', 'zh-cn': 'Chinese (CN)', 'zh-tw': 'Chinese (TW)',
        'en-us': 'English (US)', 'en-gb': 'English (UK)', 'es-mx': 'Spanish (MX)',
        'fr-ca': 'French (CA)',
    };
    return labels[code] || code.toUpperCase();
}
async function resolveSitemapUrls(sitemapUrl) {
    console.log(`\nFetching sitemap: ${sitemapUrl}`);
    const result = await parseSitemap(sitemapUrl);
    if (result.urls.length === 0) {
        throw new Error('No URLs found in sitemap.');
    }
    // Collect domains
    const domains = new Set();
    for (const u of result.urls) {
        try {
            domains.add(new URL(u).hostname);
        }
        catch { /* ignore */ }
    }
    // Print summary
    console.log('');
    console.log('  ┌─────────────────────────────────────────');
    console.log(`  │  URLs found:    ${result.urls.length}`);
    if (result.isSitemapIndex) {
        console.log(`  │  Sub-sitemaps:  ${result.childSitemaps}`);
    }
    if (domains.size > 0) {
        console.log(`  │  Domains:       ${[...domains].join(', ')}`);
    }
    if (result.languages.size > 0) {
        const langSummary = [...result.languages.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([code, count]) => `${formatLangLabel(code)} (${count})`)
            .join(', ');
        console.log(`  │  Languages:     ${langSummary}`);
    }
    console.log('  └─────────────────────────────────────────');
    console.log('');
    // Ask for confirmation
    if (process.stdin.isTTY) {
        const rl = (0, promises_1.createInterface)({ input: process.stdin, output: process.stdout });
        try {
            const answer = await rl.question(`  Proceed with ${result.urls.length} URLs? [Y/n] `);
            if (answer.trim().toLowerCase() === 'n') {
                console.log('  Cancelled.');
                process.exit(0);
            }
        }
        finally {
            rl.close();
        }
    }
    return result.urls;
}
async function resolveInputUrls(args) {
    const sourcesUsed = [args.urlsValue ? 1 : 0, args.filePath ? 1 : 0, args.sitemapUrl ? 1 : 0].reduce((acc, value) => acc + value, 0);
    if (sourcesUsed > 1) {
        throw new Error('Use only one input source: either --sitemap, --urls, --file, or stdin.');
    }
    // Handle sitemap
    if (args.sitemapUrl) {
        return resolveSitemapUrls(args.sitemapUrl);
    }
    let rawText = '';
    if (args.urlsValue) {
        rawText = args.urlsValue;
    }
    else if (args.filePath) {
        rawText = await (0, io_1.readUtf8File)(normalizeFilePathInput(args.filePath));
    }
    else {
        rawText = await readStdinText();
    }
    const parsed = (0, io_1.parseUrlsText)(rawText);
    return (0, io_1.normalizeAndValidateUrls)(parsed);
}
function printRunSummary(manifestPath, runDirectory, errorsPath) {
    console.log('\nCapture run completed.');
    console.log(`Manifest: ${manifestPath}`);
    console.log(`Output:   ${runDirectory}`);
    if (errorsPath) {
        console.log(`Errors:   ${errorsPath}`);
    }
}
function openFolder(folderPath) {
    const platform = process.platform;
    const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'explorer' : 'xdg-open';
    (0, node_child_process_1.exec)(`${command} "${folderPath}"`, () => {
        // Silently ignore errors (e.g. no display on CI).
    });
}
function buildMultipartBody(fields, file) {
    const boundary = `----ActiveSetCapture${Date.now()}${Math.random().toString(36).slice(2)}`;
    const parts = [];
    for (const [name, value] of Object.entries(fields)) {
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    }
    if (file) {
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.fileName}"\r\nContent-Type: ${file.contentType}\r\n\r\n`));
        parts.push(file.buffer);
        parts.push(Buffer.from('\r\n'));
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    return {
        body: Buffer.concat(parts),
        contentType: `multipart/form-data; boundary=${boundary}`,
    };
}
async function uploadCaptures(runDirectory, uploadUrl, projectName) {
    try {
        console.log('\nUploading captures...');
        const manifestPath = path.join(runDirectory, 'manifest.json');
        const manifestText = await fs.readFile(manifestPath, 'utf8');
        const manifest = JSON.parse(manifestText);
        // Collect file metadata
        const fileMetas = [];
        for (const result of manifest.results) {
            for (const deviceResult of result.deviceResults) {
                if (!deviceResult.success || !deviceResult.outputPath)
                    continue;
                const ext = path.extname(deviceResult.outputPath).slice(1);
                fileMetas.push({
                    filePath: deviceResult.outputPath,
                    fileName: path.basename(deviceResult.outputPath),
                    device: deviceResult.device,
                    contentType: ext === 'png' ? 'image/png' : 'image/webp',
                    originalUrl: result.url || '',
                });
            }
        }
        if (fileMetas.length === 0) {
            console.log('No successful captures to upload.');
            return null;
        }
        const endpoint = uploadUrl.replace(/\/+$/, '') + '/api/upload-captures';
        // Phase 1: Init — send manifest only (JSON), get runId back
        const initResponse = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phase: 'init', manifest, projectName }),
        });
        if (!initResponse.ok) {
            const errorBody = await initResponse.text().catch(() => '');
            throw new Error(`Init failed (${initResponse.status}): ${errorBody}`);
        }
        const { runId } = (await initResponse.json());
        console.log(`Uploading ${fileMetas.length} screenshots...`);
        // Phase 2: Upload each file individually (multipart, one per request)
        const PARALLEL_UPLOADS = 4;
        let uploaded = 0;
        for (let i = 0; i < fileMetas.length; i += PARALLEL_UPLOADS) {
            const batch = fileMetas.slice(i, i + PARALLEL_UPLOADS);
            await Promise.all(batch.map(async (meta) => {
                const buffer = await fs.readFile(meta.filePath);
                const { body, contentType } = buildMultipartBody({ phase: 'file', runId, device: meta.device, originalUrl: meta.originalUrl }, { fieldName: 'screenshot', fileName: meta.fileName, contentType: meta.contentType, buffer });
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': contentType },
                    body,
                });
                if (!res.ok) {
                    console.warn(`\n  Failed: ${meta.device}/${meta.fileName} (${res.status})`);
                }
                else {
                    uploaded++;
                    process.stdout.write(`\r  Uploaded ${uploaded}/${fileMetas.length}`);
                }
            }));
        }
        console.log('');
        // Phase 3: Finalize — get share URL
        const finalizeResponse = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phase: 'finalize', runId }),
        });
        if (!finalizeResponse.ok) {
            const errorBody = await finalizeResponse.text().catch(() => '');
            throw new Error(`Finalize failed (${finalizeResponse.status}): ${errorBody}`);
        }
        const finalResult = (await finalizeResponse.json());
        if (finalResult.shareUrl) {
            console.log(`\nShareable link: ${finalResult.shareUrl}`);
            return finalResult.shareUrl;
        }
        return null;
    }
    catch (error) {
        console.error(`\nUpload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return null;
    }
}
async function runCaptureLocalCli(argv = process.argv.slice(2)) {
    const parsedArgs = parseArgs(argv);
    if (parsedArgs.help) {
        printHelp();
        return;
    }
    const args = await maybePromptForMissingArgs(parsedArgs);
    if (!args.projectName || !args.projectName.trim()) {
        throw new Error('Missing required --project argument.');
    }
    const urls = await resolveInputUrls(args);
    if (urls.length === 0) {
        throw new Error('No valid HTTP/HTTPS URLs found in input.');
    }
    console.log(`\nProject: ${args.projectName}`);
    console.log(`URLs:    ${urls.length}`);
    const output = await (0, engine_1.runLocalCapture)({
        projectName: args.projectName,
        urls,
        outputDir: args.outputDir,
        concurrency: args.concurrency,
        timeoutMs: args.timeoutMs,
        retries: args.retries,
        devices: args.devices,
        format: args.format,
        warmup: args.warmup,
        onProgress: (event) => {
            if (event.type === 'start') {
                console.log(`Run directory: ${event.runDirectory}`);
                console.log(`Settings: concurrency=${event.settings.concurrency}, timeoutMs=${event.settings.timeoutMs}, retries=${event.settings.retries}, devices=${event.settings.devices.join(',')}, format=${event.settings.format}, warmup=${event.settings.warmup}`);
                return;
            }
            if (event.type === 'url-start') {
                console.log(`[${event.index}/${event.totalUrls}] Capturing ${event.url} (attempt ${event.attempt})`);
                return;
            }
            if (event.type === 'url-complete') {
                const status = event.result.status.toUpperCase();
                const duration = `${event.result.durationMs}ms`;
                console.log(`[${event.completedUrls}/${event.totalUrls}] ${status}: ${event.result.url} (${duration})`);
            }
        },
    });
    printRunSummary(output.manifestPath, output.runDirectory, output.errorsPath);
    // Open folder in file explorer (unless --no-open)
    if (!args.noOpen) {
        openFolder(output.runDirectory);
    }
    // Upload if --upload was provided
    if (args.upload) {
        await uploadCaptures(output.runDirectory, args.upload, args.projectName);
    }
    const { failedUrls, partialUrls } = output.manifest.summary;
    if (failedUrls > 0 || partialUrls > 0) {
        process.exitCode = 1;
    }
}
if (require.main === module) {
    runCaptureLocalCli().catch((error) => {
        console.error(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.error('Use --help to see usage examples.');
        process.exit(1);
    });
}
//# sourceMappingURL=capture-local.js.map