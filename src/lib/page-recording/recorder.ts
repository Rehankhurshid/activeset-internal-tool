import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { stat } from 'node:fs/promises';
import type { Browser, CDPSession, Page } from 'puppeteer';
import { findBrowserExecutable } from '@/lib/image-budget/browser';
import { DEFAULT_SCROLL_TIMING, framesFor, nextStop, scrollFrames, type ScrollTiming } from './scroll-plan';
import { installVirtualClock, NAME_HELPER_SHIM } from './virtual-clock';

/**
 * Record one page as a 60 fps MP4: hold, one eased scroll, hold, to the bottom.
 *
 * Frame by frame rather than a screen recording. The page's clock is frozen
 * (see virtual-clock.ts), and for every frame the recorder sets the scroll
 * position, winds the clock on 1/60 s and takes a screenshot, which ffmpeg
 * encodes at exactly 60 fps. The capture runs slower than real time — about
 * three seconds of work per second of video — and the video is still smooth,
 * because nothing in it is timed by the wall clock.
 *
 * The page renders at 2× and is scaled down to the output width, so text is
 * as crisp as a retina screenshot.
 */

export interface RecordPageOptions {
  url: string;
  outputPath: string;
  /** A JPEG of the first frame, for the player before it starts. */
  posterPath?: string;
  /** CSS pixels: the layout the site is designed at. */
  viewportWidth?: number;
  viewportHeight?: number;
  /** Device pixel ratio the page renders at before scaling down. */
  scale?: number;
  /** Width of the MP4. Height follows the viewport's shape. */
  outputWidth?: number;
  timing?: Partial<ScrollTiming>;
  onProgress?: (fraction: number, message: string) => void | Promise<void>;
  /** Use a browser that is already open, rather than launching one. */
  browser?: Browser;
}

export interface RecordPageResult {
  frames: number;
  scrolls: number;
  durationSec: number;
  width: number;
  height: number;
  bytes: number;
}

/**
 * The consent tools client sites use. A banner over the bottom of every frame
 * is not what anyone wants to watch, and clicking "accept" on a client's
 * behalf is not ours to do, so the banner is hidden for the capture.
 */
const CONSENT_BANNERS = [
  '#onetrust-consent-sdk',
  '#CybotCookiebotDialog',
  '.cky-consent-container',
  '.cky-overlay',
  '[fs-cc="banner"]',
  '[fs-consent-element="banner"]',
  '.osano-cm-window',
  '.cc-window',
  '#cookie-law-info-bar',
  '#termly-code-snippet-support',
  '.iubenda-cs-container',
  '#usercentrics-root',
].join(', ');

export function ffmpegPath(): string {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}

/** `ffmpeg version 7.1 …`, or null when there is none to run. */
export function ffmpegVersion(): string | null {
  const result = spawnSync(ffmpegPath(), ['-version'], { encoding: 'utf8', timeout: 10_000 });
  if (result.error || result.status !== 0) return null;
  return result.stdout.split('\n')[0]?.trim() || 'ffmpeg';
}

export const NO_FFMPEG =
  'No ffmpeg on this machine, so there is nothing to encode the video with. Install it (Windows: winget install Gyan.FFmpeg; Mac: brew install ffmpeg) or set FFMPEG_PATH.';

async function launch(): Promise<Browser> {
  const puppeteer = (await import('puppeteer')).default;
  const executablePath = findBrowserExecutable();
  return puppeteer.launch({
    headless: true,
    args: [
      '--hide-scrollbars',
      '--mute-audio',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--autoplay-policy=no-user-gesture-required',
    ],
    ...(executablePath ? { executablePath } : {}),
  });
}

function startEncoder(fps: number, outputWidth: number, outputPath: string): {
  ffmpeg: ChildProcessWithoutNullStreams;
  done: Promise<void>;
} {
  const ffmpeg = spawn(ffmpegPath(), [
    '-y',
    '-loglevel', 'error',
    '-f', 'image2pipe',
    '-framerate', String(fps),
    '-c:v', 'mjpeg',
    '-i', '-',
    // Lanczos down from 2×: sharper than rendering at 1× and cleaner than the
    // JPEG frames on their own.
    '-vf', `scale=${outputWidth}:-2:flags=lanczos`,
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '17',
    '-pix_fmt', 'yuv420p',
    '-r', String(fps),
    '-movflags', '+faststart',
    outputPath,
  ]);
  let stderr = '';
  ffmpeg.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });
  const done = new Promise<void>((resolve, reject) => {
    ffmpeg.on('error', (error: NodeJS.ErrnoException) =>
      reject(error.code === 'ENOENT' ? new Error(NO_FFMPEG) : error),
    );
    ffmpeg.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code}): ${stderr.trim().slice(-400)}`)),
    );
  });
  // A dead encoder surfaces through `done`; without this the write would throw
  // EPIPE on its own and crash the worker.
  ffmpeg.stdin.on('error', () => undefined);
  return { ffmpeg, done };
}

async function writeFrame(ffmpeg: ChildProcessWithoutNullStreams, frame: Buffer): Promise<void> {
  if (!ffmpeg.stdin.writable) throw new Error('The encoder stopped before the recording finished');
  if (!ffmpeg.stdin.write(frame)) await new Promise((resolve) => ffmpeg.stdin.once('drain', resolve));
}

async function preparePage(page: Page, cdp: CDPSession, options: Required<Pick<RecordPageOptions, 'viewportWidth' | 'viewportHeight' | 'scale'>>) {
  // Set on our own session: captureScreenshot on this session ignores a scale
  // set through page.setViewport, and the frames come back at 1×.
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: options.viewportWidth,
    height: options.viewportHeight,
    deviceScaleFactor: options.scale,
    mobile: false,
  });
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  );
  await page.evaluateOnNewDocument(NAME_HELPER_SHIM);
  await page.evaluateOnNewDocument(installVirtualClock);
}

export async function recordPage(options: RecordPageOptions): Promise<RecordPageResult> {
  const timing: ScrollTiming = { ...DEFAULT_SCROLL_TIMING, ...options.timing };
  const viewportWidth = options.viewportWidth ?? 1440;
  const viewportHeight = options.viewportHeight ?? 900;
  const scale = options.scale ?? 2;
  const outputWidth = options.outputWidth ?? 1920;
  const frameMs = 1000 / timing.fps;
  const report = async (fraction: number, message: string) => {
    await options.onProgress?.(Math.min(0.99, Math.max(0, fraction)), message);
  };

  const browser = options.browser ?? (await launch());
  let encoder: ReturnType<typeof startEncoder> | undefined;
  let page: Page | undefined;
  try {
    page = await browser.newPage();
    const cdp = await page.createCDPSession();
    await preparePage(page, cdp, { viewportWidth, viewportHeight, scale });

    await report(0, `Opening ${options.url}`);
    const response = await page.goto(options.url, { waitUntil: 'networkidle2', timeout: 90_000 });
    if (response && response.status() >= 400) {
      throw new Error(`${options.url} answered ${response.status()}`);
    }
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    // Intro animations and late layout, in real time, before the clock stops.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await page.addStyleTag({ content: `html, body { scroll-behavior: auto !important; }\n${CONSENT_BANNERS} { display: none !important; }` });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
    await page.evaluate(() => (window as unknown as { __recordingClock: { start(): void } }).__recordingClock.start());

    const open = page;
    const maxScrollNow = () =>
      open.evaluate(() => Math.max(0, document.documentElement.scrollHeight - window.innerHeight));
    const expectedScrolls = Math.min(
      timing.maxScrolls,
      Math.ceil((await maxScrollNow()) / Math.max(1, Math.round(viewportHeight * timing.step))),
    );
    const scrollFrameCount = framesFor(timing.scrollMs, timing.fps);
    const holdFrameCount = framesFor(timing.holdMs, timing.fps);
    const expectedFrames =
      framesFor(timing.introMs, timing.fps) +
      expectedScrolls * (scrollFrameCount + holdFrameCount) +
      framesFor(timing.outroMs, timing.fps);

    encoder = startEncoder(timing.fps, outputWidth, options.outputPath);
    const { ffmpeg } = encoder;
    // If the encoder dies, stop capturing at once rather than at the next write.
    let encoderFailure: unknown;
    encoder.done.catch((error) => {
      encoderFailure = error;
    });

    let frames = 0;
    const frame = async (scrollTop?: number) => {
      if (encoderFailure) throw encoderFailure;
      await open.evaluate(
        (ms, top) => {
          if (top !== null) window.scrollTo({ top, behavior: 'instant' as ScrollBehavior });
          (window as unknown as { __recordingClock: { step(ms: number): void } }).__recordingClock.step(ms);
        },
        frameMs,
        scrollTop ?? null,
      );
      const shot = (await cdp.send('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 95,
        optimizeForSpeed: true,
      })) as { data: string };
      await writeFrame(ffmpeg, Buffer.from(shot.data, 'base64'));
      frames += 1;
      if (frames % timing.fps === 0) {
        await report(frames / Math.max(frames + 1, expectedFrames), `Recording · ${Math.round(frames / timing.fps)} s of video`);
      }
    };
    const hold = async (count: number) => {
      for (let i = 0; i < count; i += 1) await frame();
    };

    await hold(framesFor(timing.introMs, timing.fps));

    let top = 0;
    let scrolls = 0;
    while (scrolls < timing.maxScrolls) {
      // Read the height every time: lazy sections grow the page as it scrolls.
      const to = nextStop(top, viewportHeight, await maxScrollNow(), timing.step);
      if (to <= top + 2) break;
      for (const position of scrollFrames(top, to, scrollFrameCount)) await frame(position);
      top = to;
      scrolls += 1;
      await hold(holdFrameCount);
    }
    await hold(framesFor(timing.outroMs, timing.fps));

    ffmpeg.stdin.end();
    await encoder.done;

    if (options.posterPath) {
      await new Promise<void>((resolve, reject) => {
        const poster = spawn(ffmpegPath(), ['-y', '-loglevel', 'error', '-i', options.outputPath, '-frames:v', '1', '-q:v', '3', options.posterPath!]);
        poster.on('error', reject);
        poster.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Poster frame failed (${code})`))));
      });
    }

    const { size } = await stat(options.outputPath);
    const height = Math.round((outputWidth * viewportHeight) / viewportWidth / 2) * 2;
    return {
      frames,
      scrolls,
      durationSec: Math.round((frames / timing.fps) * 10) / 10,
      width: outputWidth,
      height,
      bytes: size,
    };
  } finally {
    if (encoder && encoder.ffmpeg.exitCode === null) encoder.ffmpeg.kill('SIGKILL');
    await page?.close().catch(() => undefined);
    if (!options.browser) await browser.close().catch(() => undefined);
  }
}
