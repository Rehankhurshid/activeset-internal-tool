'use client';

import { useEffect, useState } from 'react';
import { tasksService } from '@/services/database';
import type { Task } from '@/types';

interface UseProjectTasksResult {
  tasks: Task[];
  loading: boolean;
  error: string | null;
}

/**
 * Real-time subscription to all tasks for a given project. Mirrors the
 * `subscribeToProject` pattern in projectsService — returns the live list.
 */
export function useProjectTasks(projectId: string | undefined): UseProjectTasksResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setTasks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    let unsub: (() => void) | undefined;
    try {
      unsub = tasksService.subscribeToProjectTasks(projectId, (next) => {
        setTasks(next);
        setLoading(false);
      });
    } catch (err) {
      console.error('[useProjectTasks] subscribe failed', err);
      setError('Failed to load tasks');
      setLoading(false);
    }

    return () => {
      if (unsub) unsub();
    };
  }, [projectId]);

  return { tasks, loading, error };
}
