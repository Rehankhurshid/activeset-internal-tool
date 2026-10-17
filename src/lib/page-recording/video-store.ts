import { randomUUID } from 'node:crypto';
import * as admin from 'firebase-admin';
import { bunnyConfig, deleteFromBunny, putToBunny } from '@/lib/backup/bunny';
import { hasFirebaseAdminCredentials } from '@/lib/firebase-admin';

/**
 * Where a page video goes.
 *
 * Bunny when the machine has it (Goliath does: a CDN suits video), and the
 * project's own Firebase Storage bucket otherwise. The fallback is what lets
 * any team computer run recordings: it needs nothing beyond the Firebase
 * credentials every checkout already pulls from Vercel, whereas the Bunny key
 * lives only on the worker.
 */

export type VideoStoreKind = 'bunny' | 'firebase';

export interface VideoStore {
  kind: VideoStoreKind;
  /** Upload and return a URL anyone with the link can play. */
  put(path: string, bytes: Buffer, contentType: string): Promise<string>;
  remove(path: string): Promise<void>;
}

function bunnyStore(): VideoStore | null {
  const config = bunnyConfig();
  // Without a pull zone the bytes would land but have no address to play from.
  if (!config?.cdnHost) return null;
  return {
    kind: 'bunny',
    async put(path, bytes, contentType) {
      const { url } = await putToBunny(config, path, bytes, contentType);
      return url!;
    },
    remove: (path) => deleteFromBunny(config, path),
  };
}

function firebaseStore(): VideoStore | null {
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!hasFirebaseAdminCredentials || !bucketName) return null;
  const bucket = admin.storage().bucket(bucketName);
  return {
    kind: 'firebase',
    async put(path, bytes, contentType) {
      // A download token, the same kind the Firebase console hands out: the
      // link plays for whoever has it, whatever storage.rules say, and the
      // object does not have to be made public.
      const token = randomUUID();
      await bucket.file(path).save(bytes, {
        resumable: false,
        metadata: { contentType, cacheControl: 'public, max-age=31536000', metadata: { firebaseStorageDownloadTokens: token } },
      });
      return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    },
    async remove(path) {
      await bucket.file(path).delete({ ignoreNotFound: true });
    },
  };
}

/** The store new videos go to on this machine, or null with nowhere to put them. */
export function videoStore(): VideoStore | null {
  return bunnyStore() ?? firebaseStore();
}

/** The store an existing video lives in, so a re-record can delete it from the right place. */
export function videoStoreFor(kind: VideoStoreKind | undefined): VideoStore | null {
  // Recordings made before `storage` was recorded are all on Bunny.
  return (kind ?? 'bunny') === 'bunny' ? bunnyStore() : firebaseStore();
}

export const NO_VIDEO_STORE =
  'Nowhere to keep the video: this machine has neither Bunny (BUNNY_STORAGE_ZONE, BUNNY_STORAGE_KEY, BUNNY_CDN_HOST) nor Firebase admin credentials with a storage bucket.';
