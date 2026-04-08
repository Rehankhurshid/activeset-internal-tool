'use client';

import { useEffect, useState } from 'react';
import { timelineRepository } from '@/modules/timeline/infrastructure/timeline.repository';
import type { ProjectTimeline } from '@/types';

export function useProjectTimeline(projectId: string | null | undefined) {
    const [timeline, setTimeline] = useState<ProjectTimeline | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!projectId) {
            setTimeline(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        const unsub = timelineRepository.subscribeToProjectTimeline(
            projectId,
            (t) => {
                setTimeline(t);
                setLoading(false);
            }
        );
        return () => unsub();
    }, [projectId]);

    return { timeline, loading };
}
