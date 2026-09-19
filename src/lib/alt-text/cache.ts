import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AltSuggestion } from './types';

/**
 * An on-disk cache keyed by the image's bytes, not its URL.
 *
 * The same eight template images turn up on nearly three hundred pages of a
 * CMS site, and a second run over a site that has barely changed should cost
 * nothing. Keying on content also means a re-uploaded, re-named copy of the
 * same photograph is recognised, and an image that was genuinely replaced is
 * not.
 */

const CACHE_DIR = process.env.ALT_TEXT_CACHE_DIR || path.join(process.cwd(), '.cache', 'alt-text');

export function cacheKey(input: {
  sha256: string;
  model: string;
  promptVersion: number;
  /** Context changes the right answer, so it is part of the key. */
  contextDigest: string;
}): string {
  return createHash('sha256')
    .update(`${input.sha256}|${input.model}|v${input.promptVersion}|${input.contextDigest}`)
    .digest('hex');
}

export function digestContext(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 16);
}

export async function readCache(key: string): Promise<AltSuggestion | null> {
  try {
    const raw = await fs.readFile(path.join(CACHE_DIR, `${key}.json`), 'utf8');
    return JSON.parse(raw) as AltSuggestion;
  } catch {
    return null;
  }
}

export async function writeCache(key: string, value: AltSuggestion): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(value, null, 2), 'utf8');
  } catch {
    // A cache that cannot be written is not a reason to fail the run.
  }
}

export async function clearCache(): Promise<number> {
  try {
    const files = await fs.readdir(CACHE_DIR);
    await Promise.all(files.map((f) => fs.unlink(path.join(CACHE_DIR, f)).catch(() => undefined)));
    return files.length;
  } catch {
    return 0;
  }
}

export { CACHE_DIR };
