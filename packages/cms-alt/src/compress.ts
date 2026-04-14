/**
 * Convert images to lossless WebP using sharp.
 * All compressible formats (PNG, JPG, WebP) re-encode as WebP.
 * SVG and GIF pass through untouched.
 */

import sharp from 'sharp';

export type ImageExt = 'png' | 'webp' | 'gif' | 'svg' | 'jpg';

export interface CompressResult {
  buffer: Buffer;
  ext: ImageExt;
  contentType: string;
  originalSize: number;
  compressedSize: number;
  savings: number; // percentage (0-100)
  skipped: boolean; // true when compression didn't help or format not supported
  reason?: string;
}

export function extFromContentType(contentType: string): ImageExt {
  const c = contentType.toLowerCase();
  if (c.includes('png')) return 'png';
  if (c.includes('webp')) return 'webp';
  if (c.includes('gif')) return 'gif';
  if (c.includes('svg')) return 'svg';
  return 'jpg';
}

export function extFromUrl(url: string): ImageExt | null {
  const clean = url.split('?')[0];
  const m = clean.match(/\.([a-zA-Z0-9]+)$/);
  if (!m) return null;
  const ext = m[1].toLowerCase();
  if (ext === 'jpeg' || ext === 'jpg') return 'jpg';
  if (ext === 'png' || ext === 'webp' || ext === 'gif' || ext === 'svg') return ext;
  return null;
}

export function contentTypeFromExt(ext: ImageExt): string {
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'image/jpeg';
  }
}

export async function compressBuffer(
  input: Buffer,
  ext: ImageExt
): Promise<CompressResult> {
  const originalSize = input.length;

  // sharp's lossless paths don't cover SVG/GIF — pass through.
  if (ext === 'svg' || ext === 'gif') {
    return {
      buffer: input,
      ext,
      contentType: contentTypeFromExt(ext),
      originalSize,
      compressedSize: originalSize,
      savings: 0,
      skipped: true,
      reason: `${ext} not supported for WebP conversion`,
    };
  }

  // All compressible formats → lossless WebP with aggressive effort.
  const out = await sharp(input)
    .webp({ lossless: true, effort: 6, quality: 100 })
    .toBuffer();

  if (out.length >= originalSize) {
    return {
      buffer: input,
      ext,
      contentType: contentTypeFromExt(ext),
      originalSize,
      compressedSize: originalSize,
      savings: 0,
      skipped: true,
      reason: 'WebP output is not smaller than original',
    };
  }

  return {
    buffer: out,
    ext: 'webp',
    contentType: 'image/webp',
    originalSize,
    compressedSize: out.length,
    savings: Math.round(((originalSize - out.length) / originalSize) * 100),
    skipped: false,
  };
}

export async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url, { headers: { 'User-Agent': 'cms-alt-cli/1.0' } });
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType };
}
