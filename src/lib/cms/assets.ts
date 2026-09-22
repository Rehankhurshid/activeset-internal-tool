/**
 * Upload binary assets to Webflow via the 2-step Assets API:
 *   1. POST /v2/sites/{siteId}/assets with { fileName, fileHash (md5) }
 *   2. POST multipart/form-data to the returned S3 uploadUrl with uploadDetails
 * Returns the final hostedUrl, ready to reference in a CMS Image field.
 */

import crypto from 'node:crypto';
import { buildHeaders, WEBFLOW_API_BASE } from './webflow-client';

export interface WebflowAssetUploadResult {
  assetId: string;
  hostedUrl: string;
  assetUrl?: string;
}

interface CreateAssetResponse {
  id: string;
  uploadUrl: string;
  uploadDetails: Record<string, string>;
  hostedUrl: string;
  assetUrl?: string;
}

function md5(buf: Buffer): string {
  return crypto.createHash('md5').update(buf).digest('hex');
}

/**
 * Webflow rejects long file names — "Bad Request: File name is too long" —
 * and CMS Rich Text images arrive with names like
 * `69dd43cdad9df4261182b519_69c0c8278f2b94e…`, two stacked hashes that sail
 * past the limit. Empirically about 100 characters works; 80 stays clear.
 *
 * This was found and fixed once already, in the published `@activeset/cms-alt`
 * package, and never made it back into this copy — so anything built on this
 * uploader would have hit the same 400 on its first real run.
 */
const MAX_FILENAME_LEN = 80;

export function sanitizeAssetFileName(raw: string, bufferHash: string): string {
  let name = (raw.split('/').pop() || 'image').split('?')[0];
  name = name.replace(/[^A-Za-z0-9._-]/g, '-');
  if (!name) name = 'image';

  const dot = name.lastIndexOf('.');
  const hasExt = dot > 0 && dot > name.length - 8;
  const ext = hasExt ? name.slice(dot) : '';
  const base = hasExt ? name.slice(0, dot) : name;

  if (base.length + ext.length <= MAX_FILENAME_LEN) return base + ext;

  // Keep the front of the original name so the asset is still recognisable in
  // the Webflow dashboard, and append a hash so two truncations cannot collide.
  const shortHash = bufferHash.slice(0, 8);
  const keep = Math.max(1, MAX_FILENAME_LEN - ext.length - shortHash.length - 1);
  return `${base.slice(0, keep)}-${shortHash}${ext}`;
}

export async function uploadAssetToWebflow(
  siteId: string,
  token: string,
  fileName: string,
  buffer: Buffer,
  contentType: string
): Promise<WebflowAssetUploadResult> {
  const fileHash = md5(buffer);
  // Every caller gets this, not just the careful ones.
  const safeName = sanitizeAssetFileName(fileName, fileHash);

  // Step 1: get a presigned upload URL from Webflow
  const createRes = await fetch(`${WEBFLOW_API_BASE}/sites/${siteId}/assets`, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify({ fileName: safeName, fileHash }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Webflow asset create failed (${createRes.status}): ${text}`);
  }

  const created = (await createRes.json()) as CreateAssetResponse;
  const { uploadUrl, uploadDetails } = created;

  // Step 2: POST the file to the S3 uploadUrl as multipart/form-data.
  // AWS requires the "file" field to be LAST in the form.
  const form = new FormData();
  for (const [key, value] of Object.entries(uploadDetails)) {
    form.append(key, String(value));
  }
  const blob = new Blob([new Uint8Array(buffer)], { type: contentType });
  form.append('file', blob, safeName);

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    body: form,
  });

  // S3 returns 201/204 on success depending on success_action_status in uploadDetails
  if (!uploadRes.ok && uploadRes.status !== 201 && uploadRes.status !== 204) {
    const text = await uploadRes.text();
    throw new Error(`S3 upload failed (${uploadRes.status}): ${text.slice(0, 400)}`);
  }

  return {
    assetId: created.id,
    hostedUrl: created.hostedUrl,
    assetUrl: created.assetUrl,
  };
}
