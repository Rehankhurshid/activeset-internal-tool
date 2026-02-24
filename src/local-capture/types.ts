export type LocalCaptureDevice = 'desktop' | 'mobile';

export type LocalCaptureFormat = 'webp' | 'png';

export type LocalCaptureWarmupMode = 'always' | 'off';

export type LocalCaptureUrlStatus = 'success' | 'failed' | 'partial';

export interface LocalCaptureDevicePreset {
  device: LocalCaptureDevice;
  width: number;
  height: number;
  isMobile: boolean;
  userAgent: string;
}

export interface LocalCaptureRunOptions {
  projectName: string;
  urls: string[];
  outputDir?: string;
  concurrency?: number;
  timeoutMs?: number;
  retries?: number;
  devices?: LocalCaptureDevice[];
  format?: LocalCaptureFormat;
  warmup?: LocalCaptureWarmupMode;
  onProgress?: (event: LocalCaptureProgressEvent) => void;
}

export interface LocalCaptureRunSettings {
  projectName: string;
  projectSlug: string;
  outputDir: string;
  runDirectory: string;
  concurrency: number;
  timeoutMs: number;
  retries: number;
  devices: LocalCaptureDevice[];
  format: LocalCaptureFormat;
  warmup: LocalCaptureWarmupMode;
}

export interface LocalCaptureDeviceResult {
  device: LocalCaptureDevice;
  width: number;
  height: number;
  format: LocalCaptureFormat;
  success: boolean;
  outputPath?: string;
  durationMs: number;
  error?: string;
}

export interface LocalCaptureUrlResult {
  url: string;
  index: number;
  slug: string;
  status: LocalCaptureUrlStatus;
  attempts: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  deviceResults: LocalCaptureDeviceResult[];
  error?: string;
}

export interface LocalCaptureMachineInfo {
  platform: NodeJS.Platform;
  release: string;
  arch: string;
  nodeVersion: string;
  hostname: string;
  cpuCount: number;
}

export interface LocalCaptureRunSummary {
  totalUrls: number;
  successfulUrls: number;
  failedUrls: number;
  partialUrls: number;
  totalDurationMs: number;
}

export interface LocalCaptureManifest {
  schemaVersion: 1;
  run: {
    id: string;
    projectName: string;
    projectSlug: string;
    startedAt: string;
    finishedAt: string;
    outputDirectory: string;
  };
  machine: LocalCaptureMachineInfo;
  settings: {
    concurrency: number;
    timeoutMs: number;
    retries: number;
    devices: LocalCaptureDevice[];
    format: LocalCaptureFormat;
    warmup: LocalCaptureWarmupMode;
  };
  summary: LocalCaptureRunSummary;
  results: LocalCaptureUrlResult[];
}

export interface LocalCaptureRunOutput {
  manifest: LocalCaptureManifest;
  manifestPath: string;
  errorsPath?: string;
  runDirectory: string;
}

export type LocalCaptureProgressEvent =
  | {
      type: 'start';
      totalUrls: number;
      runDirectory: string;
      settings: LocalCaptureRunSettings;
    }
  | {
      type: 'url-start';
      index: number;
      totalUrls: number;
      url: string;
      attempt: number;
    }
  | {
      type: 'url-complete';
      index: number;
      totalUrls: number;
      result: LocalCaptureUrlResult;
      completedUrls: number;
    }
  | {
      type: 'complete';
      output: LocalCaptureRunOutput;
    };

export interface LocalCaptureOutputDirectories {
  baseOutputDir: string;
  runDirectory: string;
  desktopDirectory: string;
  mobileDirectory: string;
}

export interface LocalCaptureErrorEntry {
  url: string;
  index: number;
  status: LocalCaptureUrlStatus;
  attempts: number;
  error?: string;
  deviceErrors: Array<{
    device: LocalCaptureDevice;
    error: string;
  }>;
}
