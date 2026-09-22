import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { backupPath, bunnyConfig } from './bunny';

describe('backupPath', () => {
  const fingerprint = 'cdn.prod.website-files.com/682f/hero.png';
  const date = '2026-09-22T14:03:11.000Z';

  test('files originals under the project and the day they were replaced', () => {
    const path = backupPath('proj123', fingerprint, 'hero.png', date);
    assert.ok(path.startsWith('originals/proj123/2026-09-22/'), path);
  });

  test('a second pass on another day archives alongside, not over', () => {
    const first = backupPath('proj123', fingerprint, 'hero.png', '2026-09-22T00:00:00.000Z');
    const later = backupPath('proj123', fingerprint, 'hero.png', '2026-10-30T00:00:00.000Z');
    assert.notEqual(first, later);
  });

  test('two files with the same name stay apart, because the key is the fingerprint', () => {
    const blog = backupPath('p', 'cdn.test/blog/hero.png', 'hero.png', date);
    const team = backupPath('p', 'cdn.test/team/hero.png', 'hero.png', date);
    assert.notEqual(blog, team);
  });

  test('is always exactly originals/<project>/<date>/<file>', () => {
    // The fingerprint is hostname+pathname, so it arrives full of slashes.
    // Interpolated raw it would scatter the archive across folders named
    // after the client's URL structure.
    const path = backupPath('p', fingerprint, 'hero.png', date);
    assert.equal(path.split('/').length, 4, path);
  });

  test('cannot be walked out of by a crafted name or URL', () => {
    const path = backupPath('p', '../../../etc', '../../etc/pass wd?x=1.png', date);
    assert.ok(!path.includes('..'), path);
    assert.equal(path.split('/').length, 4, path);
  });

  test('survives a file name with no usable characters at all', () => {
    const path = backupPath('p', fingerprint, '///', date);
    assert.ok(path.endsWith('image'), path);
  });
});

describe('bunnyConfig', () => {
  const clear = () => {
    for (const key of ['BUNNY_STORAGE_ZONE', 'BUNNY_STORAGE_KEY', 'BUNNY_STORAGE_HOST', 'BUNNY_CDN_HOST']) {
      delete process.env[key];
    }
  };

  test('is absent until both the zone and the key are set', () => {
    clear();
    assert.equal(bunnyConfig(), null);
    process.env.BUNNY_STORAGE_ZONE = 'activeset-originals';
    assert.equal(bunnyConfig(), null, 'a zone with no key is not a configuration');
    process.env.BUNNY_STORAGE_KEY = 'x';
    assert.ok(bunnyConfig());
    clear();
  });

  test('defaults to the global endpoint and tolerates a pasted https:// prefix', () => {
    clear();
    process.env.BUNNY_STORAGE_ZONE = 'z';
    process.env.BUNNY_STORAGE_KEY = 'x';
    assert.equal(bunnyConfig()?.host, 'storage.bunnycdn.com');

    process.env.BUNNY_STORAGE_HOST = 'https://uk.storage.bunnycdn.com/';
    process.env.BUNNY_CDN_HOST = 'https://originals.b-cdn.net/';
    assert.equal(bunnyConfig()?.host, 'uk.storage.bunnycdn.com');
    assert.equal(bunnyConfig()?.cdnHost, 'originals.b-cdn.net');
    clear();
  });
});
