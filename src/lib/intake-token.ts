import 'server-only';
import { randomBytes } from 'node:crypto';

/**
 * Public intake URLs are token-gated, not auth-gated, so a client can drop
 * change requests without us paying for a workspace seat. Tokens are 32 bytes
 * of crypto randomness encoded as URL-safe base64 — opaque to the client and
 * rotatable any time.
 */
export function generateIntakeToken(): string {
  return randomBytes(32)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,}$/;

/** Cheap shape check — the real validation is "does it match a project doc". */
export function isValidIntakeTokenShape(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value.trim());
}
