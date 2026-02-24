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
const os = __importStar(require("node:os"));
const promises_1 = require("node:readline/promises");
const engine_1 = require("../core/engine");
const io_1 = require("../core/io");
function printHelp() {
    console.log(`
Local-first responsive screenshot capture

Usage:
  activeset-capture-local --project "My Project" [--urls "https://a.com,https://b.com"] [options]
  activeset-capture-local --project "My Project" --file ./urls.txt [options]
  cat urls.txt | activeset-capture-local --project "My Project" [options]

Required:
  --project <name>         Manual project/run name
  One input source: --urls, --file, or stdin

Options:
  --out <dir>              Base output directory (default: ./captures)
  --concurrency <n>        Parallel URL workers (default: 3)
  --timeout-ms <n>         Per navigation timeout in ms (default: 45000)
  --retries <n>            Retries per URL after first attempt (default: 1)
  --devices <list>         desktop,mobile (default: desktop,mobile)
  --format <webp|png>      Screenshot format (default: webp)
  --warmup <always|off>    Scroll-first warmup mode (default: always)
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
    const missingInputSource = !initialArgs.urlsValue && !initialArgs.filePath && Boolean(process.stdin.isTTY);
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
async function resolveInputUrls(args) {
    const sourcesUsed = [args.urlsValue ? 1 : 0, args.filePath ? 1 : 0].reduce((acc, value) => acc + value, 0);
    if (sourcesUsed > 1) {
        throw new Error('Use only one input source: either --urls OR --file OR stdin.');
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
async function main() {
    const parsedArgs = parseArgs(process.argv.slice(2));
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
    const { failedUrls, partialUrls } = output.manifest.summary;
    if (failedUrls > 0 || partialUrls > 0) {
        process.exitCode = 1;
    }
}
main().catch((error) => {
    console.error(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('Use --help to see usage examples.');
    process.exit(1);
});
//# sourceMappingURL=capture-local.js.map