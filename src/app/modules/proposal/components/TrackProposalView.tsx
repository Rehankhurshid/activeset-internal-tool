'use client';

import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface TrackProposalViewProps {
  proposalId: string;
}

export default function TrackProposalView({ proposalId }: TrackProposalViewProps) {
  useEffect(() => {
    if (!proposalId) return;

    const sessionKey = `proposal-view-sent:${proposalId}`;
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(sessionKey)) {
      return;
    }

    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      const url = `/api/proposals/${encodeURIComponent(proposalId)}/view`;
      fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
      try {
        sessionStorage.setItem(sessionKey, '1');
      } catch {
        // sessionStorage can throw in private mode / embedded contexts; ignore.
      }
    };

    // Wait for Firebase to restore auth state from IndexedDB before deciding.
    // If a user is signed in (agency previewing their own share link), skip.
    if (!auth) {
      fire();
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      if (user) return; // authenticated agency preview — don't count
      fire();
    });

    // Fallback: if auth state takes too long to resolve, fire anyway so
    // genuine public views are never dropped.
    const timeout = setTimeout(() => {
      unsubscribe();
      fire();
    }, 1500);

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [proposalId]);

  return null;
}
