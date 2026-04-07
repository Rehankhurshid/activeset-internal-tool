#!/usr/bin/env node

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { LocalCaptureManifest } from '../core/types';
import { signManifest, verifyManifest } from '../core/signing';

interface UploadParsedArgs {
  help: boolean;
  runDirectory?: string;
  to?: string;
}

function printHelp(): void {
  console.log(`
Upload an existing capture run to get a shareable link.

Usage:
  activeset-capture upload <run-directory> --to <app-url>

Arguments:
  <run-directory>   Path to a capture run folder (must contain manifest.json)

Options:
  --to <url>        App URL to upload to (e.g. https://app.activeset.co)
  --help            Show this help

Examples:
  activeset-capture upload ./captures/my-project-20260407-120000 --to https://app.activeset.co
  npx @activeset/capture upload ./captures/latest --to https://app.activeset.co
`);
}

function parseArgs(argv: string[]): UploadParsedArgs {
  const parsed: UploadParsedArgs = { help: false };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (token === '--help' || token === '-h') {
      parsed.help = true;
      continue;
    }

    if (token === '--to') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --to');
      }
      parsed.to = value;
      i++;
      continue;
    }

    if (token.startsWith('--')) {
      throw new Error(`Unknown flag: ${token}`);
    }

    if (!parsed.runDirectory) {
      parsed.runDirectory = token;
    } else {
      throw new Error(`Unexpected argument: ${token}`);
    }
  }

  return parsed;
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

export async function runCaptureUploadCli(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (args.help) {
    printHelp();
    return;
  }

  if (!args.runDirectory) {
    throw new Error('Missing run directory. Usage: activeset-capture upload <run-directory> --to <url>');
  }

  if (!args.to) {
    throw new Error('Missing --to flag. Provide the app URL (e.g. --to https://app.activeset.co)');
  }

  const runDir = path.resolve(args.runDirectory);
  const manifestPath = path.join(runDir, 'manifest.json');

  try {
    await fs.access(manifestPath);
  } catch {
    throw new Error(`No manifest.json found in ${runDir}. Is this a valid capture run folder?`);
  }

  const manifestText = await fs.readFile(manifestPath, 'utf8');
  const manifest: LocalCaptureManifest = JSON.parse(manifestText);

  if (manifest.signature) {
    if (!verifyManifest(manifest, manifest.signature)) {
      throw new Error('Invalid manifest signature. This capture may have been tampered with.');
    }
    console.log('Signature verified.');
  } else {
    console.log('No signature found — signing manifest now...');
    manifest.signature = signManifest(manifest);
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    console.log('Manifest signed.');
  }

  console.log(`\nProject: ${manifest.run.projectName}`);
  console.log(`Run ID:  ${manifest.run.id}`);
  console.log(`URLs:    ${manifest.summary.totalUrls}`);

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

      const filePath = path.isAbsolute(deviceResult.outputPath)
        ? deviceResult.outputPath
        : path.join(runDir, deviceResult.outputPath);

      try {
        await fs.access(filePath);
        const ext = path.extname(filePath).slice(1);
        fileMetas.push({
          filePath,
          fileName: path.basename(filePath),
          device: deviceResult.device,
          contentType: ext === 'png' ? 'image/png' : 'image/webp',
          originalUrl: result.url || '',
        });
      } catch {
        console.warn(`  Skipping missing file: ${filePath}`);
      }
    }
  }

  if (fileMetas.length === 0) {
    throw new Error('No screenshot files found to upload.');
  }

  const endpoint = args.to.replace(/\/+$/, '') + '/api/upload-captures';

  // Phase 1: Init
  console.log(`\nRegistering upload...`);

  const initResponse = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phase: 'init',
      manifest,
      projectName: manifest.run.projectName,
    }),
  });

  if (!initResponse.ok) {
    const errorBody = await initResponse.text().catch(() => '');
    throw new Error(`Init failed (${initResponse.status}): ${errorBody}`);
  }

  const { runId } = (await initResponse.json()) as { runId: string };
  console.log(`Uploading ${fileMetas.length} screenshots...`);

  // Phase 2: Upload each file individually
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

  // Phase 3: Finalize
  const finalizeResponse = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phase: 'finalize', runId }),
  });

  if (!finalizeResponse.ok) {
    const errorBody = await finalizeResponse.text().catch(() => '');
    throw new Error(`Finalize failed (${finalizeResponse.status}): ${errorBody}`);
  }

  const result = (await finalizeResponse.json()) as { shareUrl?: string; screenshotCount?: number };

  console.log(`\nUploaded ${result.screenshotCount || fileMetas.length} screenshots.`);
  if (result.shareUrl) {
    console.log(`\nShareable link: ${result.shareUrl}`);
  }
}
