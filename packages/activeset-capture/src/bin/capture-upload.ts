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

    // Positional arg = run directory
    if (!parsed.runDirectory) {
      parsed.runDirectory = token;
    } else {
      throw new Error(`Unexpected argument: ${token}`);
    }
  }

  return parsed;
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

  // Verify manifest exists
  try {
    await fs.access(manifestPath);
  } catch {
    throw new Error(`No manifest.json found in ${runDir}. Is this a valid capture run folder?`);
  }

  // Read and parse manifest
  const manifestText = await fs.readFile(manifestPath, 'utf8');
  const manifest: LocalCaptureManifest = JSON.parse(manifestText);

  // Verify signature if present, or sign if missing (for older captures)
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

  // Collect screenshot files
  const files: Array<{ name: string; device: string; buffer: Buffer; contentType: string }> = [];

  for (const result of manifest.results) {
    for (const deviceResult of result.deviceResults) {
      if (!deviceResult.success || !deviceResult.outputPath) continue;

      const filePath = path.isAbsolute(deviceResult.outputPath)
        ? deviceResult.outputPath
        : path.join(runDir, deviceResult.outputPath);

      try {
        const buffer = await fs.readFile(filePath);
        const ext = path.extname(filePath).slice(1);
        files.push({
          name: path.basename(filePath),
          device: deviceResult.device,
          buffer,
          contentType: ext === 'png' ? 'image/png' : 'image/webp',
        });
      } catch {
        console.warn(`  Skipping missing file: ${filePath}`);
      }
    }
  }

  if (files.length === 0) {
    throw new Error('No screenshot files found to upload.');
  }

  console.log(`\nUploading ${files.length} screenshots...`);

  // Build multipart form
  const boundary = `----ActiveSetCapture${Date.now()}`;
  const parts: Buffer[] = [];

  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="manifest"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(manifest)}\r\n`
  ));

  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="projectName"\r\n\r\n${manifest.run.projectName}\r\n`
  ));

  for (const file of files) {
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="screenshots"; filename="${file.device}/${file.name}"\r\nContent-Type: ${file.contentType}\r\n\r\n`;
    parts.push(Buffer.from(header));
    parts.push(file.buffer);
    parts.push(Buffer.from('\r\n'));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(parts);

  const endpoint = args.to.replace(/\/+$/, '') + '/api/upload-captures';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Upload failed (${response.status}): ${errorBody}`);
  }

  const result = (await response.json()) as { shareUrl?: string; screenshotCount?: number };

  console.log(`\nUploaded ${result.screenshotCount || files.length} screenshots.`);
  if (result.shareUrl) {
    console.log(`\nShareable link: ${result.shareUrl}`);
  }
}
