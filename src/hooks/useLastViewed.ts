'use client';

import { useEffect, useState } from 'react';

/**
 * Returns the timestamp (ms since epoch) of the user's *previous* visit to the
 * given view, then writes the current time on unmount so the next mount sees
 * "everything since now". Use to highlight items that arrived since the last
 * visit (e.g. new tasks since the user last opened the Tasks tab).
 *
 * Returns 0 on first ever visit so callers can suppress badges instead of
 * flagging every existing item as new.
 */
export function useLastViewed(key: string): number {
  const [previousViewedAt] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const v = localStorage.getItem(key);
      return v ? Number(v) || 0 : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    return () => {
      if (typeof window === 'undefined') return;
      try {
        localStorage.setItem(key, String(Date.now()));
      } catch {
        /* private mode / quota — silent */
      }
    };
  }, [key]);

  return previousViewedAt;
}
