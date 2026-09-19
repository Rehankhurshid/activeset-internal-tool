import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/constants';
import type { AltKind, Certainty } from '@/lib/alt-text/types';

/**
 * Read-only view of the suggestions the local classifier wrote.
 *
 * Nothing in the browser generates these — the model runs on a laptop with
 * Ollama and the terminal writes the answers here. The tab subscribes, so a
 * run finishing on the laptop fills the rows in whatever browser is open,
 * including a phone.
 */

const ALT_SUGGESTIONS = 'alt_suggestions';

export interface AltSuggestionDoc {
  id: string;
  fingerprint: string;
  src: string;
  kind: AltKind;
  certainty: Certainty;
  alt: string;
  visibleText?: string;
  longDescription?: string;
  observation?: string;
  needsReview: boolean;
  notes: string[];
  agreement?: number;
  verified?: boolean;
  model: string;
  generatedAt: string;
}

export interface AltSuggestionsRepository {
  subscribe: (projectId: string, onChange: (byFingerprint: Map<string, AltSuggestionDoc>) => void) => () => void;
}

export const altSuggestionsRepository: AltSuggestionsRepository = {
  subscribe(projectId, onChange) {
    return onSnapshot(
      collection(db, COLLECTIONS.PROJECTS, projectId, ALT_SUGGESTIONS),
      (snap) => {
        const byFingerprint = new Map<string, AltSuggestionDoc>();
        for (const doc of snap.docs) {
          const data = { ...(doc.data() as Omit<AltSuggestionDoc, 'id'>), id: doc.id };
          if (data.fingerprint) byFingerprint.set(data.fingerprint, data);
        }
        onChange(byFingerprint);
      },
      (error) => {
        console.error('[altSuggestions] subscription failed:', error);
        onChange(new Map());
      },
    );
  },
};
