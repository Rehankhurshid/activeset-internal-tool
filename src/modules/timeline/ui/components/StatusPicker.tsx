'use client';

import { memo, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { TimelineItemStatus } from '@/types';
import { TIMELINE_STATUS_LABELS } from '@/types';

const STATUS_ORDER: TimelineItemStatus[] = [
    'not_started',
    'in_progress',
    'completed',
    'blocked',
];

const STATUS_DOT: Record<TimelineItemStatus, string> = {
    not_started: 'border border-muted-foreground/60',
    in_progress: 'bg-blue-500',
    completed: 'bg-emerald-500',
    blocked: 'bg-destructive',
};

interface StatusPickerProps {
    status: TimelineItemStatus;
    onChange: (status: TimelineItemStatus) => void;
    children: ReactNode;
    align?: 'start' | 'center' | 'end';
    side?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * Shared status picker used by the list row badge and the Gantt bar dot.
 * The trigger is passed in via children (rendered with asChild) so the
 * caller fully owns the visual presentation.
 */
export const StatusPicker = memo(function StatusPicker({
    status,
    onChange,
    children,
    align = 'start',
    side = 'bottom',
}: StatusPickerProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
            <DropdownMenuContent
                align={align}
                side={side}
                className="w-44"
                // Stop pointerdown from bubbling to Gantt bars so that opening
                // the menu via click doesn't trigger an accidental drag.
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
            >
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Status
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {STATUS_ORDER.map((s) => {
                    const active = s === status;
                    return (
                        <DropdownMenuItem
                            key={s}
                            onSelect={(e) => {
                                e.preventDefault();
                                if (!active) onChange(s);
                            }}
                            className="gap-2 text-xs"
                        >
                            <span
                                className={cn(
                                    'h-2.5 w-2.5 rounded-full shrink-0',
                                    STATUS_DOT[s]
                                )}
                                aria-hidden="true"
                            />
                            <span className="flex-1">{TIMELINE_STATUS_LABELS[s]}</span>
                            {active && (
                                <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                            )}
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
});
