import { LocalCaptureErrorEntry, LocalCaptureManifest, LocalCaptureRunSettings, LocalCaptureUrlResult } from './types';
interface CreateInitialManifestInput {
    runTimestamp: string;
    startedAt: string;
    settings: LocalCaptureRunSettings;
}
export declare function createInitialManifest(input: CreateInitialManifestInput): LocalCaptureManifest;
export declare function finalizeManifest(manifest: LocalCaptureManifest, results: LocalCaptureUrlResult[], finishedAt: string, totalDurationMs: number): LocalCaptureManifest;
export declare function createErrorEntries(results: LocalCaptureUrlResult[]): LocalCaptureErrorEntry[];
export declare function createErrorsReport(results: LocalCaptureUrlResult[]): {
    generatedAt: string;
    totalErrors: number;
    errors: LocalCaptureErrorEntry[];
};
export {};
