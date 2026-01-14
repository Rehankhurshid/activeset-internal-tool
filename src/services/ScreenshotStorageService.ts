import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import app from '@/lib/firebase';

// Initialize storage with the Firebase app
const storage = getStorage(app);

/**
 * Upload a screenshot to Firebase Storage and return the download URL.
 * 
 * @param projectId - The project ID for organizing storage
 * @param linkId - The link ID for organizing storage
 * @param screenshotBase64 - Base64 encoded PNG screenshot (without data URL prefix)
 * @param timestamp - ISO timestamp for unique filename
 * @returns Promise<string> - The public download URL
 */
export async function uploadScreenshot(
    projectId: string,
    linkId: string,
    screenshotBase64: string,
    timestamp: string
): Promise<string> {
    try {
        // Create a clean filename from timestamp
        const safeTimestamp = timestamp.replace(/[:.]/g, '-');
        const path = `screenshots/${projectId}/${linkId}/${safeTimestamp}.png`;
        const storageRef = ref(storage, path);

        // Convert base64 to Uint8Array (works in Node.js)
        const buffer = Buffer.from(screenshotBase64, 'base64');
        const uint8Array = new Uint8Array(buffer);

        // Upload the file
        await uploadBytes(storageRef, uint8Array, {
            contentType: 'image/png',
        });

        // Get and return the download URL
        const downloadUrl = await getDownloadURL(storageRef);
        console.log(`[ScreenshotStorage] Uploaded to: ${path}`);
        
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
