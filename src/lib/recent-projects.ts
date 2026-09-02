'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * "Recent opens" — the last handful of projects this browser visited, kept in
 * localStorage so the home screen can offer them the way Superhuman lists
 * recent threads. Purely a convenience: nothing here is authoritative.
 */

export interface RecentProject {
  id: string;
  name: string;
  client?: string;
  /** ms since epoch */
  at: number;
}

const KEY = 'activeset:recent-projects';
const LIMIT = 8;
const EVENT = 'recent-projects:change';

function read(): RecentProject[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as RecentProject[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

let cache: RecentProject[] | null = null;
let cacheRaw: string | null = null;

function snapshot(): RecentProject[] {
  if (typeof window === 'undefined') return EMPTY;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw !== cacheRaw || cache === null) {
    cacheRaw = raw;
    cache = read();
  }
  return cache;
}

const EMPTY: RecentProject[] = [];

export function recordRecentProject(project: { id: string; name: string; client?: string | null }) {
  if (typeof window === 'undefined') return;
  const next: RecentProject[] = [
    { id: project.id, name: project.name, client: project.client ?? undefined, at: Date.now() },
    ...read().filter((p) => p.id !== project.id),
  ].slice(0, LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* private mode / quota — silent */
  }
}

export function clearRecentProjects() {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* silent */
  }
}

export function useRecentProjects(): RecentProject[] {
  const subscribe = useCallback((fn: () => void) => {
    window.addEventListener(EVENT, fn);
    window.addEventListener('storage', fn);
    return () => {
      window.removeEventListener(EVENT, fn);
      window.removeEventListener('storage', fn);
    };
  }, []);
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}
