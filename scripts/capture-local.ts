#!/usr/bin/env node

import * as os from 'node:os';
import { createInterface } from 'node:readline/promises';
import { runLocalCapture } from '../src/local-capture/engine';
import { normalizeAndValidateUrls, parseUrlsText, readUtf8File } from '../src/local-capture/io';
import { LocalCaptureDevice, LocalCaptureFormat, LocalCaptureWarmupMode } from '../src/local-capture/types';

interface ParsedArgs {
  help: boolean;
  projectName?: string;
  urlsValue?: string;
  filePath?: string;
  outputDir?: string;
  concurrency?: number;
  timeoutMs?: number;
  retries?: number;
  devices?: LocalCaptureDevice[];
  format?: LocalCaptureFormat;
  warmup?: LocalCaptureWarmupMode;
}

function printHelp(): void {
  console.log(`
Local-first responsive screenshot capture

Usage:
  npm run capture:local -- --project "My Project" [--urls "https://a.com,https://b.com"] [options]
  npm run capture:local -- --project "My Project" --file ./urls.txt [options]
  cat urls.txt | npm run capture:local -- --project "My Project" [options]

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

function parseInteger(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid value for ${flag}: ${value}`);
  }
  return parsed;
}

function parseDevices(value: string): LocalCaptureDevice[] {
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

  return unique as LocalCaptureDevice[];
}

function parseFormat(value: string): LocalCaptureFormat {
  const normalized = value.trim().toLowerCase();
  if (normalized !== 'webp' && normalized !== 'png') {
    throw new Error(`Unsupported format: ${value}`);
  }
  return normalized;
}

function parseWarmup(value: string): LocalCaptureWarmupMode {
  const normalized = value.trim().toLowerCase();
  if (normalized !== 'always' && normalized !== 'off') {
    throw new Error(`Unsupported warmup mode: ${value}`);
  }
  return normalized;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { help: false };

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

async function readStdinText(): Promise<string> {
  if (process.stdin.isTTY) {
    return '';
  }

  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function askWithDefault(
  rl: ReturnType<typeof createInterface>,
  label: string,
  defaultValue = ''
): Promise<string> {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  const answer = await rl.question(`${label}${suffix}: `);
  const trimmed = answer.trim();
  return trimmed || defaultValue;
}

async function collectUrlsFromPrompt(rl: ReturnType<typeof createInterface>): Promise<string> {
  console.log('\nPaste URLs one per line. Press Enter on empty line to finish.');
  const lines: string[] = [];

  while (true) {
    const prompt = lines.length === 0 ? 'URL 1: ' : `URL ${lines.length + 1}: `;
    const value = await rl.question(prompt);
    if (!value.trim()) break;
    lines.push(value.trim());
  }

  return lines.join('\n');
}

async function maybePromptForMissingArgs(initialArgs: ParsedArgs): Promise<ParsedArgs> {
  const missingProject = !initialArgs.projectName || !initialArgs.projectName.trim();
  const missingInputSource =
    !initialArgs.urlsValue && !initialArgs.filePath && Boolean(process.stdin.isTTY);

  if (!process.stdin.isTTY || (!missingProject && !missingInputSource)) {
    return initialArgs;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const nextArgs: ParsedArgs = { ...initialArgs };

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
      } else {
        nextArgs.urlsValue = await collectUrlsFromPrompt(rl);
      }
    }

    return nextArgs;
  } finally {
    rl.close();
  }
}

function normalizeFilePathInput(filePath: string): string {
  let normalized = filePath.trim();

  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }

  if (normalized.startsWith('~/')) {
    normalized = `${os.homedir()}${normalized.slice(1)}`;
  }

  return normalized;
}

async function resolveInputUrls(args: ParsedArgs): Promise<string[]> {
  const sourcesUsed = [args.urlsValue ? 1 : 0, args.filePath ? 1 : 0].reduce((acc, value) => acc + value, 0);

  if (sourcesUsed > 1) {
    throw new Error('Use only one input source: either --urls OR --file OR stdin.');
  }

  let rawText = '';

  if (args.urlsValue) {
    rawText = args.urlsValue;
  } else if (args.filePath) {
    rawText = await readUtf8File(normalizeFilePathInput(args.filePath));
  } else {
    rawText = await readStdinText();
  }

  const parsed = parseUrlsText(rawText);
  return normalizeAndValidateUrls(parsed);
}

function printRunSummary(manifestPath: string, runDirectory: string, errorsPath?: string): void {
  console.log('\nCapture run completed.');
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Output:   ${runDirectory}`);

  if (errorsPath) {
    console.log(`Errors:   ${errorsPath}`);
  }
}

async function main(): Promise<void> {
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

  const output = await runLocalCapture({
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
        console.log(
          `Settings: concurrency=${event.settings.concurrency}, timeoutMs=${event.settings.timeoutMs}, retries=${event.settings.retries}, devices=${event.settings.devices.join(',')}, format=${event.settings.format}, warmup=${event.settings.warmup}`
        );
        return;
      }

      if (event.type === 'url-start') {
        console.log(`[${event.index}/${event.totalUrls}] Capturing ${event.url} (attempt ${event.attempt})`);
        return;
      }

      if (event.type === 'url-complete') {
        const status = event.result.status.toUpperCase();
        const duration = `${event.result.durationMs}ms`;
        console.log(
          `[${event.completedUrls}/${event.totalUrls}] ${status}: ${event.result.url} (${duration})`
        );
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
