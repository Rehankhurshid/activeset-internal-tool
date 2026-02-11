'use client';

import React from 'react';
import {
    ProjectChecklist,
    ChecklistItemStatus,
} from '@/types';
import { checklistService } from '@/services/ChecklistService';
import { ChecklistSectionBlock } from './ChecklistSection';
import { Loader2, ListChecks, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ChecklistWidgetProps {
    projectId: string;
    userEmail?: string;
    isAuthenticated?: boolean;
    onSignIn?: () => void;
}

export function ChecklistWidget({
    projectId,
    userEmail,
    isAuthenticated = false,
    onSignIn,
}: ChecklistWidgetProps) {
    const [checklists, setChecklists] = React.useState<ProjectChecklist[]>([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const unsub = checklistService.subscribeToProjectChecklists(projectId, (cls) => {
            setChecklists(cls);
            setLoading(false);
        });
        return () => unsub();
    }, [projectId]);

    const handleItemStatusChange = async (
        checklistId: string,
        sectionId: string,
        itemId: string,
        status: ChecklistItemStatus
    ) => {
        if (!isAuthenticated) return;
        await checklistService.updateItemStatus(checklistId, sectionId, itemId, status, userEmail);
    };

    const handleItemNotesChange = async (
        checklistId: string,
        sectionId: string,
        itemId: string,
        notes: string
    ) => {
        if (!isAuthenticated) return;
        await checklistService.updateItemNotes(checklistId, sectionId, itemId, notes);
    };

    const handleItemAssigneeChange = async (
        checklistId: string,
        sectionId: string,
        itemId: string,
        assignee: string
    ) => {
        if (!isAuthenticated) return;
        await checklistService.updateItemAssignee(checklistId, sectionId, itemId, assignee);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (checklists.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <ListChecks className="h-8 w-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                    No checklists yet. Create one from the dashboard.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-4">
            {!isAuthenticated && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs data-[state=visible]:animate-in fade-in slide-in-from-top-1">
                    <Lock className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="flex-1">Sign in to update checklist items</span>
                    {onSignIn && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onSignIn}
                            className="h-6 px-2 text-xs hover:bg-amber-500/20 hover:text-amber-300 -my-1 font-medium transition-colors"
                        >
                            Sign In
                        </Button>
                    )}
                </div>
            )}

            {checklists.map((checklist) => {
                const allItems = checklist.sections.flatMap((s) => s.items);
                const done = allItems.filter(
                    (i) => i.status === 'completed' || i.status === 'skipped'
                ).length;
                const percent = allItems.length > 0 ? Math.round((done / allItems.length) * 100) : 0;

                // Only show incomplete or in-progress sections by default
                const activeSections = checklist.sections.filter((s) =>
                    s.items.some((i) => i.status !== 'completed' && i.status !== 'skipped')
                );
                const sectionsToShow = activeSections.length > 0 ? activeSections : checklist.sections;

                return (
                    <div key={checklist.id} className="space-y-3">
                        {/* Header */}
                        <div>
                            <h4 className="text-sm font-semibold">{checklist.templateName}</h4>
                            <div className="flex items-center gap-2 mt-1">
                                <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className={cn(
                                            'h-full rounded-full transition-all duration-500',
                                            percent === 100
                                                ? 'bg-emerald-500'
                                                : percent > 50
                                                    ? 'bg-blue-500'
                                                    : 'bg-amber-500'
                                        )}
                                        style={{ width: `${percent}%` }}
                                    />
                                </div>
                                <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                                    {done}/{allItems.length}
                                </span>
                            </div>
                        </div>

                        {/* Sections */}
                        <div className="space-y-1.5">
                            {sectionsToShow.map((section) => (
                                <ChecklistSectionBlock
                                    key={section.id}
                                    section={section}
                                    defaultOpen={false}
                                    onItemStatusChange={(itemId, status) =>
                                        handleItemStatusChange(checklist.id, section.id, itemId, status)
                                    }
                                    onItemNotesChange={(itemId, notes) =>
                                        handleItemNotesChange(checklist.id, section.id, itemId, notes)
                                    }
                                    onItemAssigneeChange={(itemId, assignee) =>
                                        handleItemAssigneeChange(checklist.id, section.id, itemId, assignee)
                                    }
                                    readOnly={!isAuthenticated}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
