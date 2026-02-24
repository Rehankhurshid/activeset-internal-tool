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
exports.parseUrlsText = parseUrlsText;
exports.normalizeAndValidateUrls = normalizeAndValidateUrls;
exports.sanitizeProjectSlug = sanitizeProjectSlug;
exports.sanitizeUrlSlug = sanitizeUrlSlug;
exports.createRunTimestamp = createRunTimestamp;
exports.ensureOutputDirectories = ensureOutputDirectories;
exports.buildScreenshotPath = buildScreenshotPath;
exports.writeBinaryFile = writeBinaryFile;
exports.writeJsonFile = writeJsonFile;
exports.readUtf8File = readUtf8File;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const FALLBACK_PROJECT_SLUG = 'capture-run';
/**
 * Split plain text into URL candidates.
 * Supports newline- and comma-separated inputs.
 */
function parseUrlsText(input) {
    return input
        .split(/\r?\n/)
        .flatMap((line) => line.split(','))
        .map((token) => token.trim())
        .filter((token) => token.length > 0);
}
/**
 * Normalize URLs and remove duplicates while preserving order.
 */
function normalizeAndValidateUrls(inputUrls) {
    const seen = new Set();
    const normalized = [];
    for (const candidate of inputUrls) {
        const trimmed = candidate.trim();
        if (!trimmed)
            continue;
        let parsed;
        try {
            parsed = new URL(trimmed);
        }
        catch {
            continue;
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            continue;
        }
        // Keep query params, remove hash fragments for stable capture targets.
        parsed.hash = '';
        const canonical = parsed.toString();
        if (seen.has(canonical)) {
            continue;
        }
        seen.add(canonical);
        normalized.push(canonical);
    }
    return normalized;
}
/**
 * Create a stable slug for project/run naming.
 */
function sanitizeProjectSlug(projectName) {
    const slug = projectName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || FALLBACK_PROJECT_SLUG;
}
/**
 * Build a safe file slug per URL, prefixed by index for deterministic ordering.
 */
function sanitizeUrlSlug(url, index) {
    let base = `url-${index + 1}`;
    try {
        const parsed = new URL(url);
        const pathname = parsed.pathname === '/' ? '' : parsed.pathname;
        base = `${parsed.hostname}${pathname}`;
    }
    catch {
        // keep fallback base
    }
    const normalized = base
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 90);
    const safeSlug = normalized || `url-${index + 1}`;
    const indexPrefix = String(index + 1).padStart(3, '0');
    return `${indexPrefix}-${safeSlug}`;
}
/**
 * Create timestamp in YYYYMMDD-HHMMSS format.
 */
function createRunTimestamp(date = new Date()) {
    const yyyy = String(date.getUTCFullYear());
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mi = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
    return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}
async function ensureOutputDirectories(outputDir, projectSlug, runTimestamp, devices) {
    const baseOutputDir = path.resolve(outputDir);
    const runDirectory = path.join(baseOutputDir, `${projectSlug}-${runTimestamp}`);
    const desktopDirectory = path.join(runDirectory, 'desktop');
    const mobileDirectory = path.join(runDirectory, 'mobile');
    await fs.mkdir(runDirectory, { recursive: true });
    if (devices.includes('desktop')) {
        await fs.mkdir(desktopDirectory, { recursive: true });
    }
    if (devices.includes('mobile')) {
        await fs.mkdir(mobileDirectory, { recursive: true });
    }
    return {
        baseOutputDir,
        runDirectory,
        desktopDirectory,
        mobileDirectory,
    };
}
function buildScreenshotPath(directories, url, index, device, format) {
    const extension = format === 'png' ? 'png' : 'webp';
    const fileName = `${sanitizeUrlSlug(url, index)}.${extension}`;
    const baseDirectory = device === 'desktop' ? directories.desktopDirectory : directories.mobileDirectory;
    return path.join(baseDirectory, fileName);
}
async function writeBinaryFile(filePath, buffer) {
    await fs.writeFile(filePath, buffer);
}
async function writeJsonFile(filePath, data) {
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
async function readUtf8File(filePath) {
    const absolutePath = path.resolve(filePath);
    return fs.readFile(absolutePath, 'utf8');
}
//# sourceMappingURL=io.js.map