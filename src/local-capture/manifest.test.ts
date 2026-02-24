import test from 'node:test';
import assert from 'node:assert/strict';
import { createErrorEntries, createInitialManifest, finalizeManifest } from './manifest';
import { LocalCaptureRunSettings, LocalCaptureUrlResult } from './types';

const baseSettings: LocalCaptureRunSettings = {
  projectName: 'Client A',
  projectSlug: 'client-a',
  outputDir: '/tmp/captures',
  runDirectory: '/tmp/captures/client-a-20260219-100000',
  concurrency: 3,
  timeoutMs: 45_000,
  retries: 1,
  devices: ['desktop', 'mobile'],
  format: 'webp',
  warmup: 'always',
};

function createResult(status: LocalCaptureUrlResult['status'], index: number): LocalCaptureUrlResult {
  return {
    url: `https://example.com/${index}`,
    index,
    slug: `${index}`,
    status,
    attempts: 1,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 100,
    error: status === 'success' ? undefined : 'capture failed',
    deviceResults: [
      {
        device: 'desktop',
        width: 1280,
        height: 800,
        format: 'webp',
        success: status !== 'failed',
        durationMs: 50,
        outputPath: status === 'failed' ? undefined : `/tmp/desktop-${index}.webp`,
        error: status === 'failed' ? 'desktop fail' : undefined,
      },
      {
        device: 'mobile',
        width: 375,
        height: 812,
        format: 'webp',
        success: status === 'success',
        durationMs: 50,
        outputPath: status === 'success' ? `/tmp/mobile-${index}.webp` : undefined,
        error: status === 'success' ? undefined : 'mobile fail',
      },
    ],
  };
}

test('finalizeManifest computes summary counts', () => {
  const initial = createInitialManifest({
    runTimestamp: '20260219-100000',
    startedAt: '2026-02-19T10:00:00.000Z',
    settings: baseSettings,
  });

  const finalized = finalizeManifest(
    initial,
    [createResult('success', 1), createResult('failed', 2), createResult('partial', 3)],
    '2026-02-19T10:01:00.000Z',
    60_000
  );

  assert.equal(finalized.summary.totalUrls, 3);
  assert.equal(finalized.summary.successfulUrls, 1);
  assert.equal(finalized.summary.failedUrls, 1);
  assert.equal(finalized.summary.partialUrls, 1);
  assert.equal(finalized.summary.totalDurationMs, 60_000);
  assert.equal(finalized.run.finishedAt, '2026-02-19T10:01:00.000Z');
});

test('createErrorEntries includes failed and partial results only', () => {
  const errors = createErrorEntries([
    createResult('success', 1),
    createResult('failed', 2),
    createResult('partial', 3),
  ]);

  assert.equal(errors.length, 2);
  assert.equal(errors[0].status, 'failed');
  assert.equal(errors[1].status, 'partial');
  assert.ok(errors[0].deviceErrors.length > 0);
});
