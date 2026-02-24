import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  LocalCaptureDevice,
  LocalCaptureFormat,
  LocalCaptureOutputDirectories,
} from './types';

const FALLBACK_PROJECT_SLUG = 'capture-run';

/**
 * Split plain text into URL candidates.
 * Supports newline- and comma-separated inputs.
 */
export function parseUrlsText(input: string): string[] {
  return input
    .split(/\r?\n/)
    .flatMap((line) => line.split(','))
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/**
 * Normalize URLs and remove duplicates while preserving order.
 */
export function normalizeAndValidateUrls(inputUrls: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const candidate of inputUrls) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
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
export function sanitizeProjectSlug(projectName: string): string {
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
export function sanitizeUrlSlug(url: string, index: number): string {
  let base = `url-${index + 1}`;

  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname;
    base = `${parsed.hostname}${pathname}`;
  } catch {
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
export function createRunTimestamp(date = new Date()): string {
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');

  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

export async function ensureOutputDirectories(
  outputDir: string,
  projectSlug: string,
  runTimestamp: string,
  devices: LocalCaptureDevice[]
): Promise<LocalCaptureOutputDirectories> {
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

export function buildScreenshotPath(
  directories: LocalCaptureOutputDirectories,
  url: string,
  index: number,
  device: LocalCaptureDevice,
  format: LocalCaptureFormat
): string {
  const extension = format === 'png' ? 'png' : 'webp';
  const fileName = `${sanitizeUrlSlug(url, index)}.${extension}`;
  const baseDirectory = device === 'desktop' ? directories.desktopDirectory : directories.mobileDirectory;

  return path.join(baseDirectory, fileName);
}

export async function writeBinaryFile(filePath: string, buffer: Buffer): Promise<void> {
  await fs.writeFile(filePath, buffer);
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export async function readUtf8File(filePath: string): Promise<string> {
  const absolutePath = path.resolve(filePath);
  return fs.readFile(absolutePath, 'utf8');
}
