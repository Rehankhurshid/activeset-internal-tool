'use client';

import { useEffect, useState } from 'react';
import { requestsService } from '@/services/database';
import type { ProjectRequest } from '@/types';

interface UseProjectRequestsResult {
  requests: ProjectRequest[];
  loading: boolean;
  error: string | null;
}

/** Real-time subscription to all requests (raw incoming blobs) for a project. */
export function useProjectRequests(projectId: string | undefined): UseProjectRequestsResult {
  const [requests, setRequests] = useState<ProjectRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setRequests([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    let unsub: (() => void) | undefined;
    try {
      unsub = requestsService.subscribeToProjectRequests(projectId, (next) => {
        setRequests(next);
        setLoading(false);
      });
    } catch (err) {
      console.error('[useProjectRequests] subscribe failed', err);
      setError('Failed to load requests');
      setLoading(false);
    }

    return () => {
      if (unsub) unsub();
    };
  }, [projectId]);

  return { requests, loading, error };
}
