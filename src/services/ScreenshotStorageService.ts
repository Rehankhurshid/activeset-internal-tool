import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import app from '@/lib/firebase';

// Initialize storage with the Firebase app
const storage = getStorage(app);

/**
 * Upload a WebP screenshot to Firebase Storage and return its download URL.
 *
 * Takes the raw bytes puppeteer produced. Capture and upload used to hand a
 * base64 string across, which is a third more memory and two pointless
 * re-encodes per screenshot; a base64 string is still accepted so anything
 * that already holds one keeps working.
 *
 * The download URL is a second request, kept on purpose. Firebase Storage
 * does return a download token with the upload response, but the client
 * SDK's metadata mappings never read it (`getMappings` in @firebase/storage
 * has no `downloadTokens` entry), so `UploadResult.metadata.downloadTokens`
 * is always undefined and the metadata GET inside `getDownloadURL` is the
 * only supported way to learn the token. storage.rules does allow public
 * reads on screenshots/**, so a tokenless `?alt=media` URL built from the
 * bucket and path would work today and save the trip; it is not done here
 * because every URL stored in audit_logs would then break the day those
 * rules are tightened, while token URLs keep working regardless.
 *
 * @param projectId - The project ID for organizing storage
 * @param linkId - The link ID for organizing storage
 * @param screenshot - WebP bytes, or a legacy base64 string (no data URL prefix)
 * @param timestamp - ISO timestamp for unique filename
 * @returns Promise<string> - The public download URL
 */
export async function uploadScreenshot(
    projectId: string,
    linkId: string,
    screenshot: Uint8Array | string,
    timestamp: string
): Promise<string> {
    try {
        // Create a clean filename from timestamp
        const safeTimestamp = timestamp.replace(/[:.]/g, '-');
        const path = `screenshots/${projectId}/${linkId}/${safeTimestamp}.webp`;
        const storageRef = ref(storage, path);

        const bytes = typeof screenshot === 'string'
            ? new Uint8Array(Buffer.from(screenshot, 'base64'))
            : screenshot;

        await uploadBytes(storageRef, bytes, {
            contentType: 'image/webp',
        });

        const downloadUrl = await getDownloadURL(storageRef);
        console.log(`[ScreenshotStorage] Uploaded ${bytes.byteLength} bytes to: ${path}`);

        return downloadUrl;
    } catch (error) {
        console.error('[ScreenshotStorage] Upload failed:', error);
        throw error;
    }
}

/**
 * Check if a string is a URL (as opposed to base64 data)
 */
export function isScreenshotUrl(value: string | undefined): boolean {
    if (!value) return false;
    return value.startsWith('http://') || value.startsWith('https://');
}

/**
 * Get the image source for display - handles both base64 and URL formats
 */
export function getScreenshotSrc(value: string | undefined): string | undefined {
    if (!value) return undefined;

    // If it's already a URL, return as-is
    if (isScreenshotUrl(value)) {
        return value;
    }

    // Otherwise, treat as base64 and create data URL
    return `data:image/png;base64,${value}`;
}
