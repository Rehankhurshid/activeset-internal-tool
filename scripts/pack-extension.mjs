#!/usr/bin/env node
/* Packages a Chrome extension from extensions/<name> into dist/<name>-<version>.zip.
 *
 * Unpacked extensions have no auto-update mechanism -- whoever installs one re-downloads
 * and re-loads it by hand -- so the manifest version goes in the filename. That is the
 * only way the person who installed it can tell whether they are current.
 *
 *   node scripts/pack-extension.mjs refrens-skydo-bridge
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const name = process.argv[2];
if (!name) {
  console.error('usage: node scripts/pack-extension.mjs <extension-folder-name>');
  process.exit(2);
}

const dir = join('extensions', name);
if (!existsSync(join(dir, 'manifest.json'))) {
  console.error(`No manifest at ${join(dir, 'manifest.json')}`);
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const out = join('dist', `${name}-${version}.zip`);
mkdirSync('dist', { recursive: true });

execFileSync('zip', ['-qr', join('..', out), name, '-x', '*.DS_Store'], {
  cwd: 'extensions',
  stdio: 'inherit'
});

console.log(out);
