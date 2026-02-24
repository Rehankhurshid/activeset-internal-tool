import * as os from 'node:os';
import {
  LocalCaptureErrorEntry,
  LocalCaptureMachineInfo,
  LocalCaptureManifest,
  LocalCaptureRunSettings,
  LocalCaptureUrlResult,
} from './types';

interface CreateInitialManifestInput {
  runTimestamp: string;
  startedAt: string;
  settings: LocalCaptureRunSettings;
}

function getMachineInfo(): LocalCaptureMachineInfo {
  return {
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    nodeVersion: process.version,
    hostname: os.hostname(),
    cpuCount: os.cpus().length,
  };
}

export function createInitialManifest(input: CreateInitialManifestInput): LocalCaptureManifest {
  const { runTimestamp, startedAt, settings } = input;

  return {
    schemaVersion: 1,
    run: {
      id: `${settings.projectSlug}-${runTimestamp}`,
      projectName: settings.projectName,
      projectSlug: settings.projectSlug,
      startedAt,
      finishedAt: startedAt,
      outputDirectory: settings.runDirectory,
    },
    machine: getMachineInfo(),
    settings: {
      concurrency: settings.concurrency,
      timeoutMs: settings.timeoutMs,
      retries: settings.retries,
      devices: settings.devices,
      format: settings.format,
      warmup: settings.warmup,
    },
    summary: {
      totalUrls: 0,
      successfulUrls: 0,
      failedUrls: 0,
      partialUrls: 0,
      totalDurationMs: 0,
    },
    results: [],
  };
}

export function finalizeManifest(
  manifest: LocalCaptureManifest,
  results: LocalCaptureUrlResult[],
  finishedAt: string,
  totalDurationMs: number
): LocalCaptureManifest {
  const successfulUrls = results.filter((result) => result.status === 'success').length;
  const failedUrls = results.filter((result) => result.status === 'failed').length;
  const partialUrls = results.filter((result) => result.status === 'partial').length;

  return {
    ...manifest,
    run: {
      ...manifest.run,
      finishedAt,
    },
    summary: {
      totalUrls: results.length,
      successfulUrls,
      failedUrls,
      partialUrls,
      totalDurationMs,
    },
    results,
  };
}

export function createErrorEntries(results: LocalCaptureUrlResult[]): LocalCaptureErrorEntry[] {
  return results
    .filter((result) => result.status !== 'success')
    .map((result) => ({
      url: result.url,
      index: result.index,
      status: result.status,
      attempts: result.attempts,
      error: result.error,
      deviceErrors: result.deviceResults
        .filter((deviceResult) => !deviceResult.success && deviceResult.error)
        .map((deviceResult) => ({
          device: deviceResult.device,
          error: deviceResult.error || 'Unknown device capture error',
        })),
    }));
}

export function createErrorsReport(results: LocalCaptureUrlResult[]): {
  generatedAt: string;
  totalErrors: number;
  errors: LocalCaptureErrorEntry[];
} {
  const errors = createErrorEntries(results);

  return {
    generatedAt: new Date().toISOString(),
    totalErrors: errors.length,
    errors,
  };
}
