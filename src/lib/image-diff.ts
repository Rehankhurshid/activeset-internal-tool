import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export interface DiffResult {
  diffImage: string; // Base64 PNG of the diff
  diffPixelCount: number;
  diffPercentage: number;
  width: number;
  height: number;
}

/**
 * Compare two base64-encoded PNG images and generate a diff image.
 * @param before Base64-encoded PNG of the "before" image
 * @param after Base64-encoded PNG of the "after" image
 * @returns DiffResult with diff image and statistics
 */
export async function compareImages(before: string, after: string): Promise<DiffResult> {
  // Decode base64 to buffers
  const beforeBuffer = Buffer.from(before, 'base64');
  const afterBuffer = Buffer.from(after, 'base64');

  // Parse PNGs
  const beforePng = PNG.sync.read(beforeBuffer);
  const afterPng = PNG.sync.read(afterBuffer);

  // Ensure images have the same dimensions
  const width = Math.max(beforePng.width, afterPng.width);
  const height = Math.max(beforePng.height, afterPng.height);

  // Create resized images if needed (pad with transparent)
  const resizedBefore = resizeImage(beforePng, width, height);
  const resizedAfter = resizeImage(afterPng, width, height);

  // Create diff image
  const diff = new PNG({ width, height });

  // Run pixelmatch
  const diffPixelCount = pixelmatch(
    resizedBefore.data,
    resizedAfter.data,
    diff.data,
    width,
    height,
    {
      threshold: 0.1, // Sensitivity (0 = exact, 1 = very lenient)
      alpha: 0.1,
      diffColor: [255, 0, 0], // Red for differences
      diffColorAlt: [0, 255, 0], // Green for anti-aliased pixels
      includeAA: false // Don't count anti-aliased pixels as different
    }
  );

  // Calculate percentage
  const totalPixels = width * height;
  const diffPercentage = (diffPixelCount / totalPixels) * 100;

  // Encode diff image to base64
  const diffBuffer = PNG.sync.write(diff);
  const diffImage = diffBuffer.toString('base64');

  return {
    diffImage,
    diffPixelCount,
    diffPercentage,
    width,
    height
  };
}

/**
 * Resize an image to target dimensions by padding with transparent pixels
 */
function resizeImage(png: PNG, targetWidth: number, targetHeight: number): PNG {
  if (png.width === targetWidth && png.height === targetHeight) {
    return png;
  }

  const resized = new PNG({ width: targetWidth, height: targetHeight });

  // Fill with transparent pixels
  resized.data.fill(0);

  // Copy original image data
  for (let y = 0; y < Math.min(png.height, targetHeight); y++) {
    for (let x = 0; x < Math.min(png.width, targetWidth); x++) {
      const srcIdx = (y * png.width + x) * 4;
      const destIdx = (y * targetWidth + x) * 4;
      
      resized.data[destIdx] = png.data[srcIdx];
      resized.data[destIdx + 1] = png.data[srcIdx + 1];
      resized.data[destIdx + 2] = png.data[srcIdx + 2];
      resized.data[destIdx + 3] = png.data[srcIdx + 3];
    }
  }

  return resized;
}
