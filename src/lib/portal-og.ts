import 'server-only';
import { isIP } from 'node:net';
import sharp from 'sharp';
import { PortalAuthError, verifyPortalToken } from '@/lib/client-portal-tokens';
import { portalBrand } from '@/modules/client-portal/domain/client-portal.projection';
import type { Project } from '@/types';

/**
 * Data for a portal link's preview image (the card Slack, WhatsApp, iMessage
 * and email clients show when the link is pasted).
 *
 * Only what the page title already tells an unfurler leaves here: the client's
 * name, the project's name and the client's logo. Never the status, a stage or
 * an ask. The token is checked exactly as the page checks it, and nothing is
 * stamped: an unfurl is not a client opening the page.
 */

export interface PortalOgData {
  brandName: string;
  projectName?: string;
  logo?: PortalOgLogo;
}

export interface PortalOgLogo {
  /** PNG data URL, safe to hand to Satori whatever the source format was. */
  src: string;
  width: number;
  height: number;
}

/** null when the link must not resolve (unknown, revoked, expired, portal off). */
export async function loadPortalOgData(token: string): Promise<PortalOgData | null> {
  let project: Record<string, unknown>;
  try {
    ({ project } = await verifyPortalToken(token));
  } catch (err) {
    if (err instanceof PortalAuthError) return null;
    throw err;
  }

  const name = typeof project.name === 'string' ? project.name.trim() : '';
  const { brandName, brandLogoUrl } = portalBrand({
    name,
    client: typeof project.client === 'string' ? project.client : undefined,
    logoUrl: typeof project.logoUrl === 'string' ? project.logoUrl : undefined,
    clientPortal: project.clientPortal as Project['clientPortal'],
  });
  const brand = brandName.trim() || name;
  if (!brand) return null;

  return {
    brandName: brand,
    // Shown under the client's name only when it says something more.
    projectName: name && name.toLowerCase() !== brand.toLowerCase() ? name : undefined,
    logo: brandLogoUrl ? await loadLogo(brandLogoUrl) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

const LOGO_TIMEOUT_MS = 2500;
const LOGO_MAX_BYTES = 5 * 1024 * 1024;
const LOGO_BOX = 240;
const LOGO_CACHE_TTL_MS = 60 * 60 * 1000;
const LOGO_CACHE_MAX = 200;

/** Per-instance cache, so a link pasted in a busy channel fetches its logo once. */
const logoCache = new Map<string, { at: number; logo: PortalOgLogo | undefined }>();

function isFetchableLogoUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    // The URL is typed by the team, but the server fetches it: keep it to public hosts.
    if (isIP(host) || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Any logo (PNG, JPEG, WebP, AVIF, GIF, SVG) → a PNG data URL fitted into a
 * square box. Satori only draws PNG, JPEG and SVG, and a slow or broken logo
 * must never fail or stall the card, so every failure is just "no logo".
 */
async function loadLogo(raw: string): Promise<PortalOgLogo | undefined> {
  const url = isFetchableLogoUrl(raw.trim());
  if (!url) return undefined;
  const key = url.href;

  const hit = logoCache.get(key);
  if (hit && Date.now() - hit.at < LOGO_CACHE_TTL_MS) return hit.logo;

  const logo = await fetchLogo(url);
  if (logoCache.size >= LOGO_CACHE_MAX) logoCache.delete(logoCache.keys().next().value as string);
  logoCache.set(key, { at: Date.now(), logo });
  return logo;
}

async function fetchLogo(url: URL): Promise<PortalOgLogo | undefined> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(LOGO_TIMEOUT_MS),
      redirect: 'follow',
      headers: { Accept: 'image/*' },
    });
    if (!res.ok) return undefined;
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > LOGO_MAX_BYTES) return undefined;
    const input = Buffer.from(await res.arrayBuffer());
    if (!input.length || input.length > LOGO_MAX_BYTES) return undefined;

    const { data, info } = await sharp(input, { density: 300, limitInputPixels: 50_000_000, animated: false })
      .resize({ width: LOGO_BOX, height: LOGO_BOX, fit: 'inside' })
      .png()
      .toBuffer({ resolveWithObject: true });
    if (!info.width || !info.height) return undefined;
    return { src: `data:image/png;base64,${data.toString('base64')}`, width: info.width, height: info.height };
  } catch (err) {
    console.warn('[portal-og] logo skipped:', url.hostname, err instanceof Error ? err.message : err);
    return undefined;
  }
}
