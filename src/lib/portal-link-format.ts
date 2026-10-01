/**
 * What a client portal link looks like. Pure, so it can be tested.
 *
 * Rehan, 2026-10-01: "Can we have clean name instead of something gibberish".
 * The token is still the only credential, so a link is the client's name plus
 * a short random key: `dreamteam-k7f2pq9mx3ab`. Twelve characters of a-z0-9
 * are about 62 bits, far past what anyone could guess one request at a time,
 * and the name is only there to be read. Links issued before this (43
 * characters of base64url) stay valid.
 */

const LEGACY = /^[A-Za-z0-9_-]{43}$/;
export const PORTAL_KEY_LENGTH = 12;
const NAMED = new RegExp(`^(?:[a-z0-9]+(?:-[a-z0-9]+)*-)?[a-z0-9]{${PORTAL_KEY_LENGTH}}$`);
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** The client's name as it reads in a link: lower case, letters and digits, words joined by hyphens. */
export function portalSlug(name: string | undefined): string {
  return (name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
}

/** A random key from `bytes` (one random byte per character; bytes past an even split are skipped, so no letter is likelier). */
export function portalKey(nextBytes: (n: number) => Uint8Array): string {
  const limit = 256 - (256 % ALPHABET.length);
  let key = '';
  while (key.length < PORTAL_KEY_LENGTH) {
    for (const byte of nextBytes(PORTAL_KEY_LENGTH * 2)) {
      if (byte >= limit) continue;
      key += ALPHABET[byte % ALPHABET.length];
      if (key.length === PORTAL_KEY_LENGTH) break;
    }
  }
  return key;
}

export function portalToken(name: string | undefined, nextBytes: (n: number) => Uint8Array): string {
  const slug = portalSlug(name);
  const key = portalKey(nextBytes);
  return slug ? `${slug}-${key}` : key;
}

export function isPortalTokenShape(token: unknown): token is string {
  return typeof token === 'string' && token.length <= 64 && (LEGACY.test(token) || NAMED.test(token));
}
