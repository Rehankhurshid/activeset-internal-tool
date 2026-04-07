import { createHmac } from 'node:crypto';
import { LocalCaptureManifest } from './types';

const DEFAULT_KEY = 'activeset-capture-v1';

/**
 * Build a deterministic payload from the manifest for signing.
 * Excludes the `signature` field itself to avoid circular dependency.
 */
function buildSigningPayload(manifest: LocalCaptureManifest): string {
  return [
    `schema:${manifest.schemaVersion}`,
    `run:${manifest.run.id}`,
    `project:${manifest.run.projectName}`,
    `started:${manifest.run.startedAt}`,
    `finished:${manifest.run.finishedAt}`,
    `urls:${manifest.summary.totalUrls}`,
    `success:${manifest.summary.successfulUrls}`,
    `failed:${manifest.summary.failedUrls}`,
    `duration:${manifest.summary.totalDurationMs}`,
  ].join('|');
}

/**
 * Get the upload key from env, falling back to the built-in default.
 * The default key ensures manifests are always signed (proves ActiveSet origin).
 * Set ACTIVESET_UPLOAD_KEY env var for a private key only your team knows.
 */
function getKey(): string {
  return process.env.ACTIVESET_UPLOAD_KEY || DEFAULT_KEY;
}

/**
 * Sign a manifest. Returns the HMAC-SHA256 hex digest.
 */
export function signManifest(manifest: LocalCaptureManifest): string {
  const payload = buildSigningPayload(manifest);
  return createHmac('sha256', getKey()).update(payload).digest('hex');
}

/**
 * Verify a manifest signature.
 */
export function verifyManifest(manifest: LocalCaptureManifest, signature: string): boolean {
  const expected = signManifest(manifest);
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}
