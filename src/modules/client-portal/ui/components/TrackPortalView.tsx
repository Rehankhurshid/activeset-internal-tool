'use client';

import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface TrackPortalViewProps {
  token: string;
  /** `?preview=1` opens: never send the beacon. */
  preview?: boolean;
}

/**
 * Portal view beacon. Mirrors TrackProposalView: once per browser session, and
 * never for a signed-in agency user (who is previewing their own link) or an
 * explicit preview open. Falls back to firing after 1.5s if Firebase auth is
 * slow to restore, so genuine client views are never dropped.
 */
export function TrackPortalView({ token, preview = false }: TrackPortalViewProps) {
  useEffect(() => {
    if (!token || preview) return;

    const sessionKey = `portal-view-sent:${token}`;
    try {
      if (sessionStorage.getItem(sessionKey)) return;
    } catch {
      // sessionStorage can throw in private mode / embedded contexts; carry on.
    }

    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      fetch(`/api/portal/${encodeURIComponent(token)}/view`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => {});
      try {
        sessionStorage.setItem(sessionKey, '1');
      } catch {
        // ignore
      }
    };

    if (!auth) {
      fire();
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      if (user) return; // signed-in agency user — don't count
      fire();
    });

    const timeout = setTimeout(() => {
      unsubscribe();
      fire();
    }, 1500);

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [token, preview]);

  return null;
}
