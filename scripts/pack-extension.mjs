#!/usr/bin/env node
/* Packages a Chrome extension into public/downloads/<name>-<version>.zip.
 *
 * Output lands in public/ so the zip is served directly — app.activeset.co/downloads/…
 * is the link the Internal Tools page hands out. Unpacked extensions have no
 * auto-update mechanism, so the manifest version goes in the filename: it is the
 * only way someone who installed one can tell whether they are current.
 *
 *   node scripts/pack-extension.mjs extensions/refrens-skydo-bridge
 *   node scripts/pack-extension.mjs --all
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

// Kept in step with the catalogue in src/modules/internal-tools/data/tools.ts.
const EXTENSIONS = [
  'extensions/refrens-skydo-bridge',
  'chrome-extension',
  'webflow-team-tracker-1.0.6'
];

const OUT_DIR = join('public', 'downloads');

function pack(dir) {
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`No manifest at ${manifestPath}`);

  const { version, name } = JSON.parse(readFileSync(manifestPath, 'utf8'));
  // Name the download after the extension, not the folder: "chrome-extension" is
  // meaningless to whoever downloads it, "webflow-settings-auditor" is not.
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const zipName = `${slug}-${version}.zip`;

  mkdirSync(OUT_DIR, { recursive: true });
  // zip appends to an existing archive rather than replacing it, which would keep
  // files that have since been deleted from the source folder.
  rmSync(join(OUT_DIR, zipName), { force: true });

  // Zip from the parent so the archive contains one top-level folder to unzip.
  execFileSync(
    'zip',
    ['-qr', join(resolve(OUT_DIR), zipName), basename(dir), '-x', '*.DS_Store', '-x', '__MACOSX/*'],
    { cwd: dirname(dir) || '.', stdio: 'inherit' }
  );

  console.log(`  ${name} ${version} → ${join(OUT_DIR, zipName)}`);
  return zipName;
}

const arg = process.argv[2];
if (!arg) {
  console.error('usage: node scripts/pack-extension.mjs <path-to-extension> | --all');
  process.exit(2);
}

const targets = arg === '--all' ? EXTENSIONS : [arg.replace(/\/$/, '')];
for (const dir of targets) pack(dir);
