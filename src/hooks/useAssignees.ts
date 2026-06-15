'use client';

import { useEffect, useState } from 'react';
import { accessControlService, ADMIN_EMAILS } from '@/services/AccessControlService';
import { fetchAuthed } from '@/lib/api-client';

interface UseAssigneesResult {
  assignees: string[];
  loading: boolean;
}

let cachedAssignees: string[] | null = null;
let assigneesPromise: Promise<string[]> | null = null;

async function loadFromClickUp(): Promise<string[] | null> {
  try {
    const res = await fetchAuthed('/api/clickup/members');
    if (!res.ok) return null;
    const data = (await res.json()) as { emails?: string[] };
    if (!Array.isArray(data.emails) || data.emails.length === 0) return null;
    return data.emails;
  } catch (err) {
    console.warn('[useAssignees] ClickUp members fetch failed', err);
    return null;
  }
}

async function loadFromAccessControl(): Promise<string[]> {
  const access = await accessControlService.getModuleAccess();
  const all = new Set<string>([access.admin, ...ADMIN_EMAILS]);
  for (const list of Object.values(access.modules)) {
    for (const email of list) {
      if (email && email !== '*') all.add(email);
    }
  }
  return Array.from(all).sort();
}

function loadAssignees(): Promise<string[]> {
  if (cachedAssignees) return Promise.resolve(cachedAssignees);
  assigneesPromise ??= (async () => {
    const fromClickUp = await loadFromClickUp();
    const list = fromClickUp ?? (await loadFromAccessControl());
    cachedAssignees = list;
    return list;
  })().finally(() => {
    assigneesPromise = null;
  });
  return assigneesPromise;
}

/**
 * Returns the list of emails that can be assigned to a task. Sourced from the
 * linked ClickUp workspace so the dropdown reflects the real team. Falls back
 * to the access-control doc (admins + module-access lists) if the ClickUp
 * endpoint is unreachable or the workspace isn't configured.
 */
export function useAssignees(): UseAssigneesResult {
  const [assignees, setAssignees] = useState<string[]>(cachedAssignees ?? []);
  const [loading, setLoading] = useState(!cachedAssignees);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await loadAssignees();
        if (!cancelled) {
          setAssignees(list);
          setLoading(false);
        }
      } catch (err) {
        console.error('[useAssignees] failed to load', err);
        if (!cancelled) {
          setAssignees([]);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { assignees, loading };
}
