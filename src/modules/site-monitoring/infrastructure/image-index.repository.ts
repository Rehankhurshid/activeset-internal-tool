import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/constants';
import type { ImageIndexEntry } from '../domain/image-index';

/**
 * The app's read of the image index. Written only by the worker; the
 * Firestore rules refuse writes from the browser, because a row saying
 * "optimised" that the worker never wrote would make a run skip real work.
 */

const IMAGE_INDEX = 'image_index';

export interface ImageIndexRepository {
  subscribe: (projectId: string, onChange: (byFingerprint: Map<string, ImageIndexEntry>) => void) => () => void;
}

export const imageIndexRepository: ImageIndexRepository = {
  subscribe(projectId, onChange) {
    return onSnapshot(
      collection(db, COLLECTIONS.PROJECTS, projectId, IMAGE_INDEX),
      (snap) => {
        const byFingerprint = new Map<string, ImageIndexEntry>();
        for (const doc of snap.docs) {
          const entry = doc.data() as ImageIndexEntry;
          if (entry.fingerprint) byFingerprint.set(entry.fingerprint, entry);
        }
        onChange(byFingerprint);
      },
      (error) => {
        console.error('[imageIndex] subscription failed:', error);
        onChange(new Map());
      },
    );
  },
};
