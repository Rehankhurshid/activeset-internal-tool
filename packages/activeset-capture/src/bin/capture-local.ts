#!/usr/bin/env node

import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { exec } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { runLocalCapture } from '../core/engine';
import { normalizeAndValidateUrls, parseUrlsText, readUtf8File } from '../core/io';
import { LocalCaptureDevice, LocalCaptureFormat, LocalCaptureWarmupMode } from '../core/types';

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
  upload?: string;
  noOpen?: boolean;
}

function printHelp(): void {
  console.log(`
Local-first responsive screenshot capture

Usage:
  activeset-capture run --project "My Project" [--urls "https://a.com,https://b.com"] [options]
  activeset-capture run --project "My Project" --file ./urls.txt [options]
  cat urls.txt | activeset-capture run --project "My Project" [options]

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

function openFolder(folderPath: string): void {
  const platform = process.platform;
  const command =
    platform === 'darwin' ? 'open' : platform === 'win32' ? 'explorer' : 'xdg-open';

  exec(`${command} "${folderPath}"`, () => {
    // Silently ignore errors (e.g. no display on CI).
  });
}

function buildMultipartBody(
  fields: Record<string, string>,
  file?: { fieldName: string; fileName: string; contentType: string; buffer: Buffer }
): { body: Buffer; contentType: string } {
  const boundary = `----ActiveSetCapture${Date.now()}${Math.random().toString(36).slice(2)}`;
  const parts: Buffer[] = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
    ));
  }

  if (file) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.fileName}"\r\nContent-Type: ${file.contentType}\r\n\r\n`
    ));
    parts.push(file.buffer);
    parts.push(Buffer.from('\r\n'));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function uploadCaptures(
  runDirectory: string,
  uploadUrl: string,
  projectName: string
): Promise<string | null> {
  try {
    console.log('\nUploading captures...');

    const manifestPath = path.join(runDirectory, 'manifest.json');
    const manifestText = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestText);

    // Collect file metadata
    const fileMetas: Array<{
      filePath: string;
      fileName: string;
      device: string;
      contentType: string;
      originalUrl: string;
    }> = [];

    for (const result of manifest.results) {
      for (const deviceResult of result.deviceResults) {
        if (!deviceResult.success || !deviceResult.outputPath) continue;
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

    const { runId } = (await initResponse.json()) as { runId: string };
    console.log(`Uploading ${fileMetas.length} screenshots...`);

    // Phase 2: Upload each file individually (multipart, one per request)
    const PARALLEL_UPLOADS = 4;
    let uploaded = 0;

    for (let i = 0; i < fileMetas.length; i += PARALLEL_UPLOADS) {
      const batch = fileMetas.slice(i, i + PARALLEL_UPLOADS);

      await Promise.all(
        batch.map(async (meta) => {
          const buffer = await fs.readFile(meta.filePath);

          const { body, contentType } = buildMultipartBody(
            { phase: 'file', runId, device: meta.device, originalUrl: meta.originalUrl },
            { fieldName: 'screenshot', fileName: meta.fileName, contentType: meta.contentType, buffer }
          );

          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': contentType },
            body,
          });

          if (!res.ok) {
            console.warn(`\n  Failed: ${meta.device}/${meta.fileName} (${res.status})`);
          } else {
            uploaded++;
            process.stdout.write(`\r  Uploaded ${uploaded}/${fileMetas.length}`);
          }
        })
      );
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

    const finalResult = (await finalizeResponse.json()) as { shareUrl?: string };
    if (finalResult.shareUrl) {
      console.log(`\nShareable link: ${finalResult.shareUrl}`);
      return finalResult.shareUrl;
    }

    return null;
  } catch (error) {
    console.error(`\nUpload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}

export async function runCaptureLocalCli(argv = process.argv.slice(2)): Promise<void> {
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

  // Open folder in file explorer (unless --no-open)
  if (!args.noOpen) {
    openFolder(output.runDirectory);
  }

  // Upload if --upload was provided
  if (args.upload) {
    await uploadCaptures(output.runDirectory, args.upload, args.projectName!);
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
