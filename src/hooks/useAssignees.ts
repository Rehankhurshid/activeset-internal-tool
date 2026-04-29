'use client';

import { useEffect, useState } from 'react';
import { accessControlService } from '@/services/AccessControlService';

interface UseAssigneesResult {
  assignees: string[];
  loading: boolean;
}

/**
 * Returns the list of @activeset.co emails that have access to the
 * `project-links` module — these are the candidates for the task assignee
 * dropdown. Falls back to the admin email if the access doc isn't reachable.
 */
export function useAssignees(): UseAssigneesResult {
  const [assignees, setAssignees] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const access = await accessControlService.getModuleAccess();
        // `project-links` is a public module — fall back to ALL emails listed
        // anywhere in the access doc, plus the admin. This keeps the dropdown
        // useful even though the module itself isn't restricted.
        const all = new Set<string>([access.admin]);
        for (const list of Object.values(access.modules)) {
          for (const email of list) {
            if (email && email !== '*') all.add(email);
          }
        }
        if (!cancelled) {
          setAssignees(Array.from(all).sort());
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
