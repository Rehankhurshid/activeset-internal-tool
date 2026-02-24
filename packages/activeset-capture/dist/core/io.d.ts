import { LocalCaptureDevice, LocalCaptureFormat, LocalCaptureOutputDirectories } from './types';
/**
 * Split plain text into URL candidates.
 * Supports newline- and comma-separated inputs.
 */
export declare function parseUrlsText(input: string): string[];
/**
 * Normalize URLs and remove duplicates while preserving order.
 */
export declare function normalizeAndValidateUrls(inputUrls: string[]): string[];
/**
 * Create a stable slug for project/run naming.
 */
export declare function sanitizeProjectSlug(projectName: string): string;
/**
 * Build a safe file slug per URL, prefixed by index for deterministic ordering.
 */
export declare function sanitizeUrlSlug(url: string, index: number): string;
/**
 * Create timestamp in YYYYMMDD-HHMMSS format.
 */
export declare function createRunTimestamp(date?: Date): string;
export declare function ensureOutputDirectories(outputDir: string, projectSlug: string, runTimestamp: string, devices: LocalCaptureDevice[]): Promise<LocalCaptureOutputDirectories>;
export declare function buildScreenshotPath(directories: LocalCaptureOutputDirectories, url: string, index: number, device: LocalCaptureDevice, format: LocalCaptureFormat): string;
export declare function writeBinaryFile(filePath: string, buffer: Buffer): Promise<void>;
export declare function writeJsonFile(filePath: string, data: unknown): Promise<void>;
export declare function readUtf8File(filePath: string): Promise<string>;
