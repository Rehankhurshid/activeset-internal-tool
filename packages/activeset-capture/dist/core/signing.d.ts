import { LocalCaptureManifest } from './types';
/**
 * Sign a manifest. Returns the HMAC-SHA256 hex digest.
 */
export declare function signManifest(manifest: LocalCaptureManifest): string;
/**
 * Verify a manifest signature.
 */
export declare function verifyManifest(manifest: LocalCaptureManifest, signature: string): boolean;
