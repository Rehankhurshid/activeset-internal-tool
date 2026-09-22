/**
 * Keep a copy of every original before we replace it.
 *
 * Repointing a CMS image field is the first thing this tool does that
 * overwrites something on a client's live site. The old Webflow asset is not
 * deleted, so in principle the bytes survive — but "in principle" is doing a
 * lot of work there: Webflow reports no back-references, nothing stops someone
 * tidying the asset library later, and the `image_budget` findings are wiped
 * and rewritten on every run, so within a day there is no record of what the
 * image used to be. An archive off Webflow entirely is the only version of
 * this that is actually reversible.
 *
 * Bunny's Storage API is a plain authenticated PUT, which is why this file is
 * short: no SDK, no signing, no multipart.
 *
 * Configured entirely by environment, so no credential ever travels through
 * the app or a job payload:
 *
 *   BUNNY_STORAGE_ZONE   the storage zone name
 *   BUNNY_STORAGE_KEY    that zone's password (secret)
 *   BUNNY_STORAGE_HOST   regional endpoint, default storage.bunnycdn.com
 *   BUNNY_CDN_HOST       the pull zone hostname, so the archive is readable
 */

export interface BunnyConfig {
  zone: string;
  key: string;
  host: string;
  cdnHost?: string;
}

export function bunnyConfig(): BunnyConfig | null {
  const zone = process.env.BUNNY_STORAGE_ZONE;
  const key = process.env.BUNNY_STORAGE_KEY;
  if (!zone || !key) return null;
  return {
    zone,
    key,
    host: (process.env.BUNNY_STORAGE_HOST || 'storage.bunnycdn.com').replace(/^https?:\/\//, '').replace(/\/$/, ''),
    cdnHost: process.env.BUNNY_CDN_HOST?.replace(/^https?:\/\//, '').replace(/\/$/, ''),
  };
}

export const BUNNY_NOT_CONFIGURED =
  'No Bunny storage configured, so there is nowhere to archive the originals. Set BUNNY_STORAGE_ZONE and BUNNY_STORAGE_KEY on the worker.';

/**
 * A stable, collision-proof path for one original.
 *
 * Keyed by the fingerprint rather than the file name, because two collections
 * can hold `hero.png` and the same image can be reached by several URLs. The
 * date folder means a second pass over the same image a month later archives
 * alongside the first rather than overwriting it — the point of a backup is
 * that it does not get replaced by the thing you are backing up from.
 */
export function backupPath(projectId: string, fingerprint: string, fileName: string, isoDate: string): string {
  // A fingerprint is `hostname + pathname`, so it arrives full of slashes, and
  // both it and the file name come from a URL. Interpolating either one raw
  // would scatter the archive across folders named after the client's URL
  // structure, and would put `..` into a path built from remote input.
  const flatten = (value: string, fallback: string) => {
    const cleaned = value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/\.{2,}/g, '-');
    return /[A-Za-z0-9]/.test(cleaned) ? cleaned : fallback;
  };

  const key = flatten(fingerprint, 'image').slice(-80);
  const name = flatten(fileName.split('/').pop() ?? '', 'image').slice(-60);
  return `originals/${flatten(projectId, 'project')}/${isoDate.slice(0, 10)}/${key}-${name}`;
}

export interface BunnyUploadResult {
  path: string;
  /** Readable URL, when a pull zone is configured. Storage alone is not public. */
  url?: string;
}

/** PUT one file into the storage zone. Throws with Bunny's own reason. */
export async function putToBunny(
  config: BunnyConfig,
  path: string,
  bytes: Buffer,
  contentType: string,
): Promise<BunnyUploadResult> {
  const res = await fetch(`https://${config.host}/${config.zone}/${path}`, {
    method: 'PUT',
    headers: {
      AccessKey: config.key,
      'content-type': contentType,
    },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Bunny refused the upload (${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`);
  }

  return {
    path,
    url: config.cdnHost ? `https://${config.cdnHost}/${path}` : undefined,
  };
}
