'use client';

import React from 'react';
import { ChecklistSection as ChecklistSectionType, ChecklistItemStatus } from '@/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { ChecklistItemRow } from './ChecklistItem';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChecklistSectionProps {
    section: ChecklistSectionType;
    defaultOpen?: boolean;
    onItemStatusChange: (itemId: string, status: ChecklistItemStatus) => void;
    onItemNotesChange: (itemId: string, notes: string) => void;
    onItemAssigneeChange: (itemId: string, assignee: string) => void;
    readOnly?: boolean;
}

function computeProgress(items: { status: ChecklistItemStatus }[]) {
    if (items.length === 0) return { completed: 0, total: 0, percent: 0 };
    const completed = items.filter(
        (i) => i.status === 'completed' || i.status === 'skipped'
    ).length;
    return {
        completed,
        total: items.length,
        percent: Math.round((completed / items.length) * 100),
    };
}

export function ChecklistSectionBlock({
    section,
    defaultOpen = false,
    onItemStatusChange,
    onItemNotesChange,
    onItemAssigneeChange,
    readOnly = false,
}: ChecklistSectionProps) {
    const [isOpen, setIsOpen] = React.useState(defaultOpen);
    const progress = computeProgress(section.items);

    const progressColor =
        progress.percent === 100
            ? 'bg-emerald-500'
            : progress.percent > 50
                ? 'bg-blue-500'
                : progress.percent > 0
                    ? 'bg-amber-500'
                    : 'bg-muted-foreground/30';

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger className="w-full">
                <div
                    className={cn(
                        'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer',
                        'bg-muted/30 hover:bg-muted/50',
                        'border border-border/40 hover:border-border/60',
                        progress.percent === 100 && 'bg-emerald-500/5 border-emerald-500/20'
                    )}
                >
                    {/* Expand icon */}
                    <ChevronRight
                        className={cn(
                            'h-4 w-4 text-muted-foreground transition-transform duration-200 flex-shrink-0',
                            isOpen && 'rotate-90'
                        )}
                    />

                    {/* Emoji */}
                    {section.emoji && (
                        <span className="text-lg flex-shrink-0">{section.emoji}</span>
                    )}

                    {/* Title + Progress */}
                    <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold truncate">{section.title}</span>
                            <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0">
                                {progress.completed}/{progress.total}
                            </span>
                        </div>
                        <div className="mt-1.5">
                            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                <div
                                    className={cn('h-full rounded-full transition-all duration-500', progressColor)}
                                    style={{ width: `${progress.percent}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Percentage */}
                    <span
                        className={cn(
                            'text-xs font-medium flex-shrink-0 tabular-nums',
                            progress.percent === 100 ? 'text-emerald-400' : 'text-muted-foreground'
                        )}
                    >
                        {progress.percent}%
                    </span>
                </div>
            </CollapsibleTrigger>

            <CollapsibleContent>
                <div className="ml-4 mt-1 border-l-2 border-border/30 pl-2 space-y-0.5">
                    {section.items.map((item) => (
                        <ChecklistItemRow
                            key={item.id}
                            item={item}
                            onStatusChange={(status) => onItemStatusChange(item.id, status)}
                            onNotesChange={(notes) => onItemNotesChange(item.id, notes)}
                            onAssigneeChange={(assignee) => onItemAssigneeChange(item.id, assignee)}
                            readOnly={readOnly}
                        />
                    ))}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}
