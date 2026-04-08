'use client';

import { useEffect, useMemo, useState } from 'react';
import type { TimelineTemplate } from '@/types';
import { TIMELINE_TEMPLATES } from '@/lib/timeline-templates';
import { timelineTemplateService } from '@/services/TimelineTemplateService';

interface UseTimelineTemplatesResult {
    builtIn: TimelineTemplate[];
    custom: TimelineTemplate[];
    all: TimelineTemplate[];
    loading: boolean;
}

/**
 * Subscribes to the custom timeline templates collection in Firestore and
 * merges the result with the static built-in templates so callers always
 * see the full list in a consistent shape.
 */
export function useTimelineTemplates(): UseTimelineTemplatesResult {
    const [custom, setCustom] = useState<TimelineTemplate[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsub = timelineTemplateService.subscribeToCustomTemplates((list) => {
            setCustom(list);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const builtIn = useMemo<TimelineTemplate[]>(
        () => TIMELINE_TEMPLATES.map((t) => ({ ...t, isBuiltIn: true })),
        []
    );

    const all = useMemo(() => [...builtIn, ...custom], [builtIn, custom]);

    return { builtIn, custom, all, loading };
}
