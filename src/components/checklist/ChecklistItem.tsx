'use client';

import React from 'react';
import { ChecklistItem as ChecklistItemType, ChecklistItemStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
    Circle,
    CircleDot,
    CheckCircle2,
    SkipForward,
    StickyNote,
    MoreHorizontal,
    UserPlus,
    Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChecklistItemProps {
    item: ChecklistItemType;
    onStatusChange: (status: ChecklistItemStatus) => void;
    onNotesChange: (notes: string) => void;
    onAssigneeChange: (assignee: string) => void;
    readOnly?: boolean;
}

const STATUS_CONFIG: Record<ChecklistItemStatus, {
    icon: React.ElementType;
    color: string;
    bgColor: string;
    label: string;
    next: ChecklistItemStatus;
}> = {
    not_started: {
        icon: Circle,
        color: 'text-muted-foreground/60',
        bgColor: '',
        label: 'Not Started',
        next: 'in_progress',
    },
    in_progress: {
        icon: CircleDot,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/5',
        label: 'In Progress',
        next: 'completed',
    },
    completed: {
        icon: CheckCircle2,
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-500/5',
        label: 'Completed',
        next: 'not_started',
    },
    skipped: {
        icon: SkipForward,
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/5',
        label: 'Skipped',
        next: 'not_started',
    },
};

export function ChecklistItemRow({
    item,
    onStatusChange,
    onNotesChange,
    onAssigneeChange,
    readOnly = false,
}: ChecklistItemProps) {
    const config = STATUS_CONFIG[item.status];
    const StatusIcon = config.icon;
    const [notesOpen, setNotesOpen] = React.useState(false);
    const [assigneeOpen, setAssigneeOpen] = React.useState(false);
    const [notesDraft, setNotesDraft] = React.useState(item.notes ?? '');
    const [assigneeDraft, setAssigneeDraft] = React.useState(item.assignee ?? '');

    const handleToggle = () => {
        if (readOnly) return;
        onStatusChange(config.next);
    };

    const handleSaveNotes = () => {
        onNotesChange(notesDraft);
        setNotesOpen(false);
    };

    const handleSaveAssignee = () => {
        onAssigneeChange(assigneeDraft);
        setAssigneeOpen(false);
    };

    return (
        <div
            className={cn(
                'group flex items-start gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                'hover:bg-muted/40',
                config.bgColor,
                item.status === 'completed' && 'opacity-70'
            )}
        >
            {/* Status Toggle */}
            <TooltipProvider delayDuration={300}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={handleToggle}
                            disabled={readOnly}
                            className={cn(
                                'mt-0.5 flex-shrink-0 transition-all duration-200',
                                config.color,
                                !readOnly && 'hover:scale-110 cursor-pointer',
                                readOnly && 'cursor-default'
                            )}
                        >
                            <StatusIcon className="h-5 w-5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                        <p className="text-xs">
                            {readOnly ? config.label : `Click: ${config.label} → ${STATUS_CONFIG[config.next].label}`}
                        </p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className={cn(
                    'text-sm leading-snug',
                    item.status === 'completed' && 'line-through text-muted-foreground'
                )}>
                    {item.emoji && <span className="mr-1.5">{item.emoji}</span>}
                    {item.title}
                </div>

                {/* Metadata row */}
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {item.assignee && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-md">
                            <UserPlus className="h-2.5 w-2.5" />
                            {item.assignee.split('@')[0]}
                        </span>
                    )}
                    {item.notes && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-md">
                            <StickyNote className="h-2.5 w-2.5" />
                            Note
                        </span>
                    )}
                    {item.completedAt && item.status === 'completed' && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Clock className="h-2.5 w-2.5" />
                            {new Date(item.completedAt).toLocaleDateString()}
                            {item.completedBy && ` by ${item.completedBy.split('@')[0]}`}
                        </span>
                    )}
                </div>
            </div>

            {/* Actions */}
            {!readOnly && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    {/* Notes Popover */}
                    <Popover open={notesOpen} onOpenChange={(open) => {
                        setNotesOpen(open);
                        if (open) setNotesDraft(item.notes ?? '');
                    }}>
                        <PopoverTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                                <StickyNote className={cn('h-3.5 w-3.5', item.notes ? 'text-amber-400' : 'text-muted-foreground')} />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72" align="end">
                            <div className="space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">Notes</p>
                                <Textarea
                                    value={notesDraft}
                                    onChange={(e) => setNotesDraft(e.target.value)}
                                    placeholder="Add notes..."
                                    className="text-sm min-h-[80px] resize-none"
                                />
                                <div className="flex justify-end gap-2">
                                    <Button size="sm" variant="ghost" onClick={() => setNotesOpen(false)} className="h-7 text-xs">
                                        Cancel
                                    </Button>
                                    <Button size="sm" onClick={handleSaveNotes} className="h-7 text-xs">
                                        Save
                                    </Button>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>

                    {/* More Actions */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {/* Assign */}
                            <DropdownMenuItem onClick={(e) => {
                                e.preventDefault();
                                setAssigneeOpen(true);
                            }}>
                                <UserPlus className="mr-2 h-3.5 w-3.5" />
                                {item.assignee ? 'Change Assignee' : 'Assign'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {/* Status options */}
                            {(Object.keys(STATUS_CONFIG) as ChecklistItemStatus[])
                                .filter((s) => s !== item.status)
                                .map((status) => {
                                    const sc = STATUS_CONFIG[status];
                                    const Icon = sc.icon;
                                    return (
                                        <DropdownMenuItem key={status} onClick={() => onStatusChange(status)}>
                                            <Icon className={cn('mr-2 h-3.5 w-3.5', sc.color)} />
                                            Mark as {sc.label}
                                        </DropdownMenuItem>
                                    );
                                })}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            )}

            {/* Assignee Dialog */}
            <Popover open={assigneeOpen} onOpenChange={(open) => {
                setAssigneeOpen(open);
                if (open) setAssigneeDraft(item.assignee ?? '');
            }}>
                <PopoverTrigger asChild>
                    <span className="hidden" />
                </PopoverTrigger>
                <PopoverContent className="w-64" align="end">
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Assign to</p>
                        <Input
                            value={assigneeDraft}
                            onChange={(e) => setAssigneeDraft(e.target.value)}
                            placeholder="team@activeset.co"
                            className="text-sm h-8"
                        />
                        <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setAssigneeOpen(false)} className="h-7 text-xs">
                                Cancel
                            </Button>
                            <Button size="sm" onClick={handleSaveAssignee} className="h-7 text-xs">
                                Save
                            </Button>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}
