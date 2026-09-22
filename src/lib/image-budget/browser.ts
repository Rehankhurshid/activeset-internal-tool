import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Browser } from 'puppeteer';

/**
 * Find a browser to measure with.
 *
 * Puppeteer's own download is the last resort, not the first: it is 150 MB
 * per machine, it silently half-downloads (which is how this was found — a
 * partial Chrome 143 on the Mac that threw a dlopen error at launch), and
 * every machine this runs on already has Chrome or Edge installed. Windows is
 * checked first because that is where the worker lives.
 */

const WINDOWS_CANDIDATES = [
  'C\\:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const MAC_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

const LINUX_CANDIDATES = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
];

export function findBrowserExecutable(): string | undefined {
  const configured = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (configured && existsSync(configured)) return configured;

  const candidates =
    process.platform === 'win32'
      ? [
          ...WINDOWS_CANDIDATES,
          ...(process.env.LOCALAPPDATA
            ? [path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe')]
            : []),
        ]
      : process.platform === 'darwin'
        ? MAC_CANDIDATES
        : LINUX_CANDIDATES;

  return candidates.find((candidate) => existsSync(candidate));
}

export class NoBrowserError extends Error {
  constructor() {
    super(
      'No browser found to measure with. Install Chrome, or set PUPPETEER_EXECUTABLE_PATH, or run: npx puppeteer browsers install chrome',
    );
    this.name = 'NoBrowserError';
  }
}

export async function launchMeasuringBrowser(): Promise<Browser> {
  const puppeteer = (await import('puppeteer')).default;
  const executablePath = findBrowserExecutable();

  const args = [
    '--hide-scrollbars',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    // Lazy images below the fold never load in a backgrounded tab, and every
    // measurement would come back zero.
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ];

  try {
    return await puppeteer.launch({ headless: true, args, ...(executablePath ? { executablePath } : {}) });
  } catch (error) {
    if (executablePath) throw error;
    throw new NoBrowserError();
  }
}
