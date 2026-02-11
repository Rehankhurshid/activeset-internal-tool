'use client';

import React from 'react';
import { ChecklistSection as ChecklistSectionType, ChecklistItemStatus } from '@/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { ChecklistItemRow } from './ChecklistItem';
import { ChevronRight, Plus, Trash2, GripVertical, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ChecklistSectionProps {
    section: ChecklistSectionType & { id: string };
    defaultOpen?: boolean;
    onItemStatusChange: (itemId: string, status: ChecklistItemStatus) => void;
    onItemNotesChange: (itemId: string, notes: string) => void;
    onItemAssigneeChange: (itemId: string, assignee: string) => void;

    // Editing props
    isEditing?: boolean;
    onDeleteSection?: () => void;
    onAddItem?: () => void;
    onDeleteItem?: (itemId: string) => void;
    onUpdateSection?: (updates: Partial<ChecklistSectionType>) => void; // For future title/emoji edits

    dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;

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
    isEditing = false,
    onDeleteSection,
    onAddItem,
    onDeleteItem,
    readOnly = false,
    dragHandleProps,
    onUpdateSection,
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
        <Collapsible open={isOpen || isEditing} onOpenChange={setIsOpen}>
            <div className="group/section relative">
                {/* Section Header */}
                <CollapsibleTrigger className="w-full">
                    <div
                        className={cn(
                            'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer',
                            'bg-muted/30 hover:bg-muted/50',
                            'border border-border/40 hover:border-border/60',
                            progress.percent === 100 && 'bg-emerald-500/5 border-emerald-500/20'
                        )}
                    >
                        {/* Edit Drag Handle */}
                        {isEditing && (
                            <div {...dragHandleProps} className="mr-2 cursor-grab active:cursor-grabbing touch-none" onClick={(e) => e.stopPropagation()}>
                                <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                            </div>
                        )}

                        {/* Expand icon */}
                        {!isEditing && (
                            <ChevronRight
                                className={cn(
                                    'h-4 w-4 text-muted-foreground transition-transform duration-200 flex-shrink-0',
                                    isOpen && 'rotate-90'
                                )}
                            />
                        )}

                        {/* Title & Emoji */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            {isEditing ? (
                                <div className="flex items-center gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                                    <input
                                        className="w-8 h-8 pb-1 text-center text-xl bg-transparent border border-transparent hover:border-border rounded focus:bg-background focus:border-primary outline-none transition-colors"
                                        defaultValue={section.emoji || '📋'}
                                        onBlur={(e) => {
                                            const val = e.target.value;
                                            if (val !== (section.emoji || '📋')) {
                                                onUpdateSection?.({ emoji: val });
                                            }
                                        }}
                                        maxLength={2}
                                    />
                                    <input
                                        className="font-semibold text-sm bg-transparent border border-transparent hover:border-border rounded px-2 py-1 flex-1 focus:bg-background focus:border-primary outline-none transition-colors"
                                        defaultValue={section.title}
                                        onBlur={(e) => {
                                            if (e.target.value !== section.title) {
                                                onUpdateSection?.({ title: e.target.value });
                                            }
                                        }}
                                    />
                                </div>
                            ) : (
                                <>
                                    <span className="text-xl mr-2">{section.emoji || '📋'}</span>
                                    <h4 className="font-semibold text-sm truncate">{section.title}</h4>
                                </>
                            )}
                        </div>

                        {/* Title + Progress */}
                        {!isEditing && (
                            <div className="flex-1 min-w-0 text-left">
                                <div className="flex items-center gap-2">
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
                        )}

                        {/* Edit Controls */}
                        {isEditing ? (
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    onClick={onDeleteSection}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        ) : (
                            /* Percentage */
                            <span
                                className={cn(
                                    'text-xs font-medium flex-shrink-0 tabular-nums',
                                    progress.percent === 100 ? 'text-emerald-400' : 'text-muted-foreground'
                                )}
                            >
                                {progress.percent}%
                            </span>
                        )}
                    </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                    <div className={cn(
                        "ml-4 mt-1 border-l-2 border-border/30 pl-2 space-y-0.5",
                        isEditing && "border-dashed border-primary/20"
                    )}>
                        {section.items.map((item) => (
                            <ChecklistItemRow
                                key={item.id}
                                item={item}
                                onStatusChange={(status) => onItemStatusChange(item.id, status)}
                                onNotesChange={(notes) => onItemNotesChange(item.id, notes)}
                                onAssigneeChange={(assignee) => onItemAssigneeChange(item.id, assignee)}
                                onDelete={isEditing && onDeleteItem ? () => onDeleteItem(item.id) : undefined}
                                readOnly={readOnly || isEditing} // ReadOnly in edit mode to prevent status toggling
                            />
                        ))}

                        {/* Add Item Button */}
                        {isEditing && onAddItem && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start text-muted-foreground hover:text-primary mt-2 h-8"
                                onClick={onAddItem}
                            >
                                <Plus className="h-3.5 w-3.5 mr-2" />
                                Add Item
                            </Button>
                        )}
                    </div>
                </CollapsibleContent>
            </div>
        </Collapsible>
    );
}

// Sortable Wrapper
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export function SortableChecklistSection({ section, ...props }: ChecklistSectionProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: section.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div ref={setNodeRef} style={style}>
            <ChecklistSectionBlock
                section={section}
                {...props}
                dragHandleProps={props.isEditing ? { ...attributes, ...listeners } : undefined}
            />
        </div>
    );
}
