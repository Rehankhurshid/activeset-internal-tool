'use client';

import React from 'react';
import { ProjectChecklist } from '@/types';
import { checklistService } from '@/services/ChecklistService';
import { cn } from '@/lib/utils';
import { ListChecks } from 'lucide-react';

interface ChecklistProgressBadgeProps {
    projectId: string;
    className?: string;
}

export function ChecklistProgressBadge({ projectId, className }: ChecklistProgressBadgeProps) {
    const [checklists, setChecklists] = React.useState<ProjectChecklist[]>([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const unsub = checklistService.subscribeToProjectChecklists(projectId, (cls) => {
            setChecklists(cls);
            setLoading(false);
        });
        return () => unsub();
    }, [projectId]);

    if (loading || checklists.length === 0) return null;

    // Aggregate all items across all checklists
    const allItems = checklists.flatMap((cl) => cl.sections.flatMap((s) => s.items));
    const done = allItems.filter(
        (i) => i.status === 'completed' || i.status === 'skipped'
    ).length;
    const total = allItems.length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;

    const color =
        percent === 100
            ? 'text-emerald-400'
            : percent > 50
                ? 'text-blue-400'
                : percent > 0
                    ? 'text-amber-400'
                    : 'text-muted-foreground';

    const ringColor =
        percent === 100
            ? 'stroke-emerald-400'
            : percent > 50
                ? 'stroke-blue-400'
                : percent > 0
                    ? 'stroke-amber-400'
                    : 'stroke-muted-foreground/30';

    // SVG circular progress: radius 14, circumference ~88
    const circumference = 2 * Math.PI * 14;
    const strokeDashoffset = circumference - (percent / 100) * circumference;

    return (
        <div className={cn('flex items-center gap-2', className)}>
            {/* Circular progress */}
            <div className="relative w-8 h-8 flex-shrink-0">
                <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
                    <circle
                        cx="16"
                        cy="16"
                        r="14"
                        fill="none"
                        strokeWidth="2.5"
                        className="stroke-muted/50"
                    />
                    <circle
                        cx="16"
                        cy="16"
                        r="14"
                        fill="none"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        className={cn('transition-all duration-500', ringColor)}
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <ListChecks className={cn('h-3 w-3', color)} />
                </div>
            </div>

            {/* Text */}
            <div className="min-w-0">
                <p className={cn('text-[10px] font-medium tabular-nums leading-none', color)}>
                    {done}/{total}
                </p>
                <p className="text-[9px] text-muted-foreground leading-none mt-0.5">
                    checklist
                </p>
            </div>
        </div>
    );
}
