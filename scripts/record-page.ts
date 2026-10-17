#!/usr/bin/env tsx
/**
 * Record one page the way the worker does, to a local file.
 *
 *   npm run record-page -- https://acme.webflow.io/pricing
 *   npm run record-page -- https://acme.com/ --out ./captures/videos/acme-home.mp4
 *
 * The same recorder the Pages table's Record button queues on the worker.
 */
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { recordPage } from '@/lib/page-recording/recorder';

async function main() {
  const args = process.argv.slice(2);
  const url = args.find((arg) => /^https?:\/\//.test(arg));
  if (!url) {
    console.error('Usage: npm run record-page -- <url> [--out file.mp4]');
    process.exit(1);
  }
  const outFlag = args.indexOf('--out');
  const slug = new URL(url).pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
  const out = path.resolve(outFlag >= 0 ? args[outFlag + 1] : `captures/videos/${new URL(url).hostname}-${slug}.mp4`);
  await mkdir(path.dirname(out), { recursive: true });

  const started = Date.now();
  const result = await recordPage({
    url,
    outputPath: out,
    posterPath: out.replace(/\.mp4$/, '.jpg'),
    onProgress: (fraction, message) => console.log(`${Math.round(fraction * 100)}%  ${message}`),
  });
  console.log(
    `\n${out}\n${result.width}×${result.height} · ${result.durationSec} s · ${result.scrolls} scrolls · ` +
      `${(result.bytes / 1024 / 1024).toFixed(1)} MB · made in ${Math.round((Date.now() - started) / 1000)} s`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
