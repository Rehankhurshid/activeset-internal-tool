"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialManifest = createInitialManifest;
exports.finalizeManifest = finalizeManifest;
exports.createErrorEntries = createErrorEntries;
exports.createErrorsReport = createErrorsReport;
const os = __importStar(require("node:os"));
function getMachineInfo() {
    return {
        platform: process.platform,
        release: os.release(),
        arch: process.arch,
        nodeVersion: process.version,
        hostname: os.hostname(),
        cpuCount: os.cpus().length,
    };
}
function createInitialManifest(input) {
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
function finalizeManifest(manifest, results, finishedAt, totalDurationMs) {
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
function createErrorEntries(results) {
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
function createErrorsReport(results) {
    const errors = createErrorEntries(results);
    return {
        generatedAt: new Date().toISOString(),
        totalErrors: errors.length,
        errors,
    };
}
//# sourceMappingURL=manifest.js.map