import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  createRunTimestamp,
  ensureOutputDirectories,
  normalizeAndValidateUrls,
  parseUrlsText,
  sanitizeProjectSlug,
  sanitizeUrlSlug,
} from './io';

test('parseUrlsText splits newline and comma separated URLs', () => {
  const input = 'https://example.com\nhttps://foo.com,https://bar.com\n\n';
  const parsed = parseUrlsText(input);

  assert.deepEqual(parsed, ['https://example.com', 'https://foo.com', 'https://bar.com']);
});

test('normalizeAndValidateUrls keeps only unique http/https URLs', () => {
  const normalized = normalizeAndValidateUrls([
    'https://example.com#section',
    'https://example.com',
    'http://example.org/path',
    'ftp://example.net/resource',
    'invalid-url',
  ]);

  assert.deepEqual(normalized, ['https://example.com/', 'http://example.org/path']);
});

test('sanitizeProjectSlug returns fallback when empty', () => {
  assert.equal(sanitizeProjectSlug('   '), 'capture-run');
  assert.equal(sanitizeProjectSlug('New Client Project'), 'new-client-project');
});

test('sanitizeUrlSlug includes deterministic index prefix', () => {
  const slug = sanitizeUrlSlug('https://example.com/features/pricing', 4);
  assert.ok(slug.startsWith('005-'));
  assert.ok(slug.includes('example-com-features-pricing'));
});

test('createRunTimestamp returns expected pattern', () => {
  const ts = createRunTimestamp(new Date('2026-02-19T15:06:07.000Z'));
  assert.equal(ts, '20260219-150607');
});

test('ensureOutputDirectories creates run and selected device directories', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'local-capture-test-'));

  try {
    const dirs = await ensureOutputDirectories(tmpRoot, 'project-a', '20260219-150607', ['desktop']);

    const runStat = await fs.stat(dirs.runDirectory);
    const desktopStat = await fs.stat(dirs.desktopDirectory);

    assert.ok(runStat.isDirectory());
    assert.ok(desktopStat.isDirectory());

    await assert.rejects(fs.stat(dirs.mobileDirectory));
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});
