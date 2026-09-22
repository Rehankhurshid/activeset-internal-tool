import { db as adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { imageIndexId } from '@/modules/site-monitoring/domain/audit-findings';
import type { ImageIndexEntry } from '@/modules/site-monitoring/domain/image-index';

/**
 * The worker's side of the image index: read it once per job, write what
 * happened as it happens. See domain/image-index.ts for why it exists.
 */

const IMAGE_INDEX = 'image_index';

const indexOf = (projectId: string) =>
  adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId).collection(IMAGE_INDEX);

export async function readImageIndex(projectId: string): Promise<Map<string, ImageIndexEntry>> {
  const index = new Map<string, ImageIndexEntry>();
  for (const doc of (await indexOf(projectId).get()).docs) {
    const entry = doc.data() as ImageIndexEntry;
    index.set(entry.fingerprint, entry);
  }
  return index;
}

export type IndexUpdate = Pick<ImageIndexEntry, 'fingerprint' | 'src'> &
  Partial<Pick<ImageIndexEntry, 'group' | 'alt' | 'optimise'>>;

const stripUndefined = <T extends object>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

/** Merge, so recording the ALT never erases what is known about the bytes. */
export async function recordInIndex(projectId: string, updates: IndexUpdate[]): Promise<void> {
  const collection = indexOf(projectId);
  const updatedAt = new Date().toISOString();
  for (let i = 0; i < updates.length; i += 400) {
    const batch = adminDb.batch();
    for (const update of updates.slice(i, i + 400)) {
      if (!update.fingerprint) continue;
      batch.set(collection.doc(imageIndexId(update.fingerprint)), stripUndefined({ ...update, updatedAt }), { merge: true });
    }
    await batch.commit();
  }
}
