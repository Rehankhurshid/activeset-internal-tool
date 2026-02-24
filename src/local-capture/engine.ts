import * as path from 'node:path';
import puppeteer, { Browser, Page } from 'puppeteer';
import {
  LocalCaptureDevice,
  LocalCaptureDevicePreset,
  LocalCaptureDeviceResult,
  LocalCaptureFormat,
  LocalCaptureManifest,
  LocalCaptureOutputDirectories,
  LocalCaptureRunOptions,
  LocalCaptureRunOutput,
  LocalCaptureRunSettings,
  LocalCaptureUrlResult,
  LocalCaptureUrlStatus,
  LocalCaptureWarmupMode,
} from './types';
import {
  buildScreenshotPath,
  createRunTimestamp,
  ensureOutputDirectories,
  normalizeAndValidateUrls,
  sanitizeProjectSlug,
  sanitizeUrlSlug,
  writeBinaryFile,
  writeJsonFile,
} from './io';
import { createErrorsReport, createInitialManifest, finalizeManifest } from './manifest';
import { warmupPageByScrolling } from './warmup-scroll';

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_RETRIES = 1;
const DEFAULT_OUTPUT_DIR = './captures';
const DEFAULT_FORMAT: LocalCaptureFormat = 'webp';
const DEFAULT_WARMUP: LocalCaptureWarmupMode = 'always';
const DEFAULT_DEVICES: LocalCaptureDevice[] = ['desktop', 'mobile'];

const MAX_CONCURRENCY = 10;
const MAX_RETRIES = 5;
const MIN_TIMEOUT_MS = 5_000;

const DEVICE_PRESETS: Record<LocalCaptureDevice, LocalCaptureDevicePreset> = {
  desktop: {
    device: 'desktop',
    width: 1280,
    height: 800,
    isMobile: false,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  },
  mobile: {
    device: 'mobile',
    width: 375,
    height: 812,
    isMobile: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  },
};

interface NormalizedRunContext {
  settings: LocalCaptureRunSettings;
  urls: string[];
  runTimestamp: string;
  directories: LocalCaptureOutputDirectories;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeDevices(devices: LocalCaptureDevice[] | undefined): LocalCaptureDevice[] {
  if (!devices || devices.length === 0) {
    return [...DEFAULT_DEVICES];
  }

  const normalized = devices.filter(
    (device, index, all) => (device === 'desktop' || device === 'mobile') && all.indexOf(device) === index
  );

  return normalized.length > 0 ? normalized : [...DEFAULT_DEVICES];
}

function normalizeRunOptions(options: LocalCaptureRunOptions): NormalizedRunContext {
  const projectName = options.projectName.trim();
  if (!projectName) {
    throw new Error('Missing required option: projectName');
  }

  const urls = normalizeAndValidateUrls(options.urls);
  if (urls.length === 0) {
    throw new Error('No valid HTTP/HTTPS URLs were provided.');
  }

  const projectSlug = sanitizeProjectSlug(projectName);
  const runTimestamp = createRunTimestamp(new Date());
  const devices = normalizeDevices(options.devices);

  const concurrency = clampNumber(
    options.concurrency ?? DEFAULT_CONCURRENCY,
    1,
    Math.min(MAX_CONCURRENCY, urls.length)
  );

  const timeoutMs = clampNumber(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, Number.MAX_SAFE_INTEGER);
  const retries = clampNumber(options.retries ?? DEFAULT_RETRIES, 0, MAX_RETRIES);
  const format = options.format ?? DEFAULT_FORMAT;
  const warmup = options.warmup ?? DEFAULT_WARMUP;

  if (format !== 'webp' && format !== 'png') {
    throw new Error(`Unsupported format: ${format}`);
  }

  if (warmup !== 'always' && warmup !== 'off') {
    throw new Error(`Unsupported warmup mode: ${warmup}`);
  }

  const outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;

  const settings: LocalCaptureRunSettings = {
    projectName,
    projectSlug,
    outputDir: path.resolve(outputDir),
    runDirectory: '',
    concurrency,
    timeoutMs,
    retries,
    devices,
    format,
    warmup,
  };

  return {
    settings,
    urls,
    runTimestamp,
    directories: {
      baseOutputDir: '',
      runDirectory: '',
      desktopDirectory: '',
      mobileDirectory: '',
    },
  };
}

async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });
}

async function configurePageForDevice(page: Page, preset: LocalCaptureDevicePreset): Promise<void> {
  await page.setUserAgent(preset.userAgent);
  await page.setViewport({
    width: preset.width,
    height: preset.height,
    isMobile: preset.isMobile,
    hasTouch: preset.isMobile,
    deviceScaleFactor: 1,
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
}

function getUrlStatus(deviceResults: LocalCaptureDeviceResult[]): LocalCaptureUrlStatus {
  const successCount = deviceResults.filter((result) => result.success).length;

  if (successCount === 0) return 'failed';
  if (successCount === deviceResults.length) return 'success';
  return 'partial';
}

async function captureSingleAttempt(
  browser: Browser,
  url: string,
  index: number,
  attempt: number,
  settings: LocalCaptureRunSettings,
  directories: LocalCaptureOutputDirectories
): Promise<LocalCaptureUrlResult> {
  const startedAt = new Date().toISOString();
  const attemptStartMs = Date.now();
  const slug = sanitizeUrlSlug(url, index);
  const deviceResults: LocalCaptureDeviceResult[] = [];

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(settings.timeoutMs);
  page.setDefaultTimeout(settings.timeoutMs);

  try {
    for (const device of settings.devices) {
      const preset = DEVICE_PRESETS[device];
      const deviceStartMs = Date.now();

      try {
        await configurePageForDevice(page, preset);

        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: settings.timeoutMs,
        });

        try {
          await page.waitForFunction(() => document.readyState === 'complete', {
            timeout: Math.min(settings.timeoutMs, 10_000),
          });
        } catch {
          // Continue if readyState confirmation times out; networkidle already completed.
        }

        if (settings.warmup === 'always') {
          await warmupPageByScrolling(page);
        }

        const outputPath = buildScreenshotPath(directories, url, index, device, settings.format);

        const screenshotOptions: Record<string, unknown> = {
          type: settings.format,
          fullPage: true,
          captureBeyondViewport: true,
        };

        if (settings.format === 'webp') {
          screenshotOptions.quality = 80;
        }

        const screenshotBuffer = (await page.screenshot(screenshotOptions)) as Buffer;
        await writeBinaryFile(outputPath, screenshotBuffer);

        deviceResults.push({
          device,
          width: preset.width,
          height: preset.height,
          format: settings.format,
          success: true,
          outputPath,
          durationMs: Date.now() - deviceStartMs,
        });
      } catch (error) {
        deviceResults.push({
          device,
          width: preset.width,
          height: preset.height,
          format: settings.format,
          success: false,
          durationMs: Date.now() - deviceStartMs,
          error: getErrorMessage(error),
        });
      }
    }
  } finally {
    await page.close();
  }

  const status = getUrlStatus(deviceResults);
  const finishedAt = new Date().toISOString();

  const primaryError =
    status === 'success'
      ? undefined
      : deviceResults.find((result) => !result.success)?.error || 'All device captures failed.';

  return {
    url,
    index,
    slug,
    status,
    attempts: attempt,
    startedAt,
    finishedAt,
    durationMs: Date.now() - attemptStartMs,
    deviceResults,
    error: primaryError,
  };
}

async function captureUrlWithRetries(
  browser: Browser,
  url: string,
  index: number,
  settings: LocalCaptureRunSettings,
  directories: LocalCaptureOutputDirectories,
  onAttemptStart?: (attempt: number) => void
): Promise<LocalCaptureUrlResult> {
  const maxAttempts = settings.retries + 1;
  let lastResult: LocalCaptureUrlResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    onAttemptStart?.(attempt);

    try {
      const result = await captureSingleAttempt(browser, url, index, attempt, settings, directories);
      lastResult = result;

      if (result.status === 'success' || attempt === maxAttempts) {
        return result;
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      lastResult = {
        url,
        index,
        slug: sanitizeUrlSlug(url, index),
        status: 'failed',
        attempts: attempt,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 0,
        deviceResults: [],
        error: errorMessage,
      };

      if (attempt === maxAttempts) {
        return lastResult;
      }
    }
  }

  return (
    lastResult || {
      url,
      index,
      slug: sanitizeUrlSlug(url, index),
      status: 'failed',
      attempts: maxAttempts,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      deviceResults: [],
      error: 'Capture failed unexpectedly.',
    }
  );
}

export async function runLocalCapture(options: LocalCaptureRunOptions): Promise<LocalCaptureRunOutput> {
  const normalized = normalizeRunOptions(options);

  normalized.directories = await ensureOutputDirectories(
    normalized.settings.outputDir,
    normalized.settings.projectSlug,
    normalized.runTimestamp,
    normalized.settings.devices
  );

  normalized.settings = {
    ...normalized.settings,
    outputDir: normalized.directories.baseOutputDir,
    runDirectory: normalized.directories.runDirectory,
  };

  const startedAt = new Date().toISOString();
  const startTimeMs = Date.now();

  options.onProgress?.({
    type: 'start',
    totalUrls: normalized.urls.length,
    runDirectory: normalized.directories.runDirectory,
    settings: normalized.settings,
  });

  const initialManifest: LocalCaptureManifest = createInitialManifest({
    runTimestamp: normalized.runTimestamp,
    startedAt,
    settings: normalized.settings,
  });

  const results: LocalCaptureUrlResult[] = new Array(normalized.urls.length);

  const browser = await launchBrowser();
  try {
    let nextIndex = 0;
    let completed = 0;

    const worker = async (): Promise<void> => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= normalized.urls.length) {
          return;
        }

        const url = normalized.urls[currentIndex];

        const result = await captureUrlWithRetries(
          browser,
          url,
          currentIndex,
          normalized.settings,
          normalized.directories,
          (attempt) => {
            options.onProgress?.({
              type: 'url-start',
              index: currentIndex + 1,
              totalUrls: normalized.urls.length,
              url,
              attempt,
            });
          }
        );

        results[currentIndex] = result;
        completed += 1;

        options.onProgress?.({
          type: 'url-complete',
          index: currentIndex + 1,
          totalUrls: normalized.urls.length,
          result,
          completedUrls: completed,
        });
      }
    };

    const workerCount = Math.min(normalized.settings.concurrency, normalized.urls.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  } finally {
    await browser.close();
  }

  const finishedAt = new Date().toISOString();
  const totalDurationMs = Date.now() - startTimeMs;

  const manifest = finalizeManifest(initialManifest, results, finishedAt, totalDurationMs);

  const manifestPath = path.join(normalized.directories.runDirectory, 'manifest.json');
  await writeJsonFile(manifestPath, manifest);

  let errorsPath: string | undefined;
  if (manifest.summary.failedUrls > 0 || manifest.summary.partialUrls > 0) {
    errorsPath = path.join(normalized.directories.runDirectory, 'errors.json');
    await writeJsonFile(errorsPath, createErrorsReport(results));
  }

  const output: LocalCaptureRunOutput = {
    manifest,
    manifestPath,
    errorsPath,
    runDirectory: normalized.directories.runDirectory,
  };

  options.onProgress?.({ type: 'complete', output });

  return output;
}
