import type { SchemaPageSignals } from './types';

function fastHash(text: string): string {
  let h1 = 0xdeadbeef ^ 0x9e3779b9;
  let h2 = 0x41c6ce57 ^ 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/**
 * MUST stay byte-for-byte identical to the in-app version
 * (src/services/SchemaMarkupService.ts → computeContentHash) so cache keys match.
 */
export function computeContentHash(signals: SchemaPageSignals): string {
  return fastHash(
    JSON.stringify({
      t: signals.title,
      d: signals.metaDescription,
      h1: signals.h1,
      h2: signals.h2,
      m: signals.mainText.slice(0, 2000),
      j: signals.existingJsonLd,
    })
  );
}
