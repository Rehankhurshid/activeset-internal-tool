'use client';

import React from 'react';
import {
    ProjectChecklist,
    ChecklistItemStatus,
    SOPTemplate,
} from '@/types';
import { checklistService } from '@/services/ChecklistService';
import { ChecklistSectionBlock } from './ChecklistSection';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    ChevronsUpDown,
    Plus,
    Filter,
    Loader2,
    ListChecks,
    Trash2,
} from 'lucide-react';
import { SOP_TEMPLATES } from '@/lib/sop-templates';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/alert-dialog-confirm';

interface ChecklistOverviewProps {
    projectId: string;
    userEmail?: string;
    readOnly?: boolean;
}

type StatusFilter = 'all' | 'not_started' | 'in_progress' | 'completed' | 'skipped';

export function ChecklistOverview({
    projectId,
    userEmail,
    readOnly = false,
}: ChecklistOverviewProps) {
    const [checklists, setChecklists] = React.useState<ProjectChecklist[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [creating, setCreating] = React.useState(false);
    const [filter, setFilter] = React.useState<StatusFilter>('all');
    const [expandAll, setExpandAll] = React.useState(false);
    const [templateDialogOpen, setTemplateDialogOpen] = React.useState(false);
    const [deleteChecklistId, setDeleteChecklistId] = React.useState<string | null>(null);

    React.useEffect(() => {
        const unsub = checklistService.subscribeToProjectChecklists(projectId, (cls) => {
            setChecklists(cls);
            setLoading(false);
        });
        return () => unsub();
    }, [projectId]);

    const handleCreateChecklist = async (templateId: string) => {
        setCreating(true);
        try {
            await checklistService.createChecklist(projectId, templateId);
            toast.success('Checklist created');
            setTemplateDialogOpen(false);
        } catch {
            toast.error('Failed to create checklist');
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteChecklist = async () => {
        if (!deleteChecklistId) return;
        try {
            await checklistService.deleteChecklist(deleteChecklistId);
            toast.success('Checklist deleted');
        } catch {
            toast.error('Failed to delete checklist');
        } finally {
            setDeleteChecklistId(null);
        }
    };

    const handleItemStatusChange = async (
        checklistId: string,
        sectionId: string,
        itemId: string,
        status: ChecklistItemStatus
    ) => {
        try {
            await checklistService.updateItemStatus(checklistId, sectionId, itemId, status, userEmail);
        } catch {
            toast.error('Failed to update status');
        }
    };

    const handleItemNotesChange = async (
        checklistId: string,
        sectionId: string,
        itemId: string,
        notes: string
    ) => {
        try {
            await checklistService.updateItemNotes(checklistId, sectionId, itemId, notes);
        } catch {
            toast.error('Failed to update notes');
        }
    };

    const handleItemAssigneeChange = async (
        checklistId: string,
        sectionId: string,
        itemId: string,
        assignee: string
    ) => {
        try {
            await checklistService.updateItemAssignee(checklistId, sectionId, itemId, assignee);
        } catch {
            toast.error('Failed to update assignee');
        }
    };

    // Compute overall stats
    const getOverallProgress = (checklist: ProjectChecklist) => {
        const allItems = checklist.sections.flatMap((s) => s.items);
        const done = allItems.filter(
            (i) => i.status === 'completed' || i.status === 'skipped'
        ).length;
        return {
            total: allItems.length,
            done,
            inProgress: allItems.filter((i) => i.status === 'in_progress').length,
            percent: allItems.length > 0 ? Math.round((done / allItems.length) * 100) : 0,
        };
    };

    // Filter sections
    const filterSections = (checklist: ProjectChecklist) => {
        if (filter === 'all') return checklist.sections;
        return checklist.sections
            .map((section) => ({
                ...section,
                items: section.items.filter((item) => item.status === filter),
            }))
            .filter((section) => section.items.length > 0);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (checklists.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <ListChecks className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-1">No Checklists Yet</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                    Add a checklist from an SOP template to start tracking your project progress.
                </p>
                {!readOnly && (
                    <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="gap-2">
                                <Plus className="h-4 w-4" />
                                Add Checklist
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle>Choose SOP Template</DialogTitle>
                                <DialogDescription>
                                    Select a template to generate a checklist for this project.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3 mt-4">
                                {SOP_TEMPLATES.map((template) => (
                                    <button
                                        key={template.id}
                                        onClick={() => handleCreateChecklist(template.id)}
                                        disabled={creating}
                                        className={cn(
                                            'w-full text-left p-4 rounded-xl border border-border/50 transition-all duration-200',
                                            'hover:bg-muted/40 hover:border-primary/30',
                                            'focus:outline-none focus:ring-2 focus:ring-primary/20',
                                            creating && 'opacity-50 cursor-not-allowed'
                                        )}
                                    >
                                        <div className="flex items-start gap-3">
                                            <span className="text-2xl">{template.icon}</span>
                                            <div>
                                                <p className="font-semibold text-sm">{template.name}</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {template.description}
                                                </p>
                                                <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                                                    {template.sections.length} sections ·{' '}
                                                    {template.sections.reduce((a, s) => a + s.items.length, 0)} items
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </DialogContent>
                    </Dialog>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {checklists.map((checklist) => {
                const progress = getOverallProgress(checklist);
                const filteredSections = filterSections(checklist);

                return (
                    <div key={checklist.id} className="space-y-4">
                        {/* Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-lg font-bold">{checklist.templateName}</h3>
                                    {!readOnly && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                            onClick={() => setDeleteChecklistId(checklist.id)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                    <Badge variant="secondary" className="text-xs font-mono">
                                        {progress.done}/{progress.total} done
                                    </Badge>
                                    {progress.inProgress > 0 && (
                                        <Badge variant="outline" className="text-xs text-blue-400 border-blue-400/30">
                                            {progress.inProgress} in progress
                                        </Badge>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {/* Filter */}
                                <Select
                                    value={filter}
                                    onValueChange={(v) => setFilter(v as StatusFilter)}
                                >
                                    <SelectTrigger className="h-8 w-[140px] text-xs">
                                        <Filter className="h-3 w-3 mr-1" />
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Items</SelectItem>
                                        <SelectItem value="not_started">To Do</SelectItem>
                                        <SelectItem value="in_progress">In Progress</SelectItem>
                                        <SelectItem value="completed">Completed</SelectItem>
                                        <SelectItem value="skipped">Skipped</SelectItem>
                                    </SelectContent>
                                </Select>

                                {/* Expand/Collapse */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs gap-1.5"
                                    onClick={() => setExpandAll(!expandAll)}
                                >
                                    <ChevronsUpDown className="h-3 w-3" />
                                    {expandAll ? 'Collapse' : 'Expand'}
                                </Button>
                            </div>
                        </div>

                        {/* Overall Progress Bar */}
                        <div className="space-y-1">
                            <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                                <div
                                    className={cn(
                                        'h-full rounded-full transition-all duration-700',
                                        progress.percent === 100
                                            ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                                            : progress.percent > 50
                                                ? 'bg-gradient-to-r from-blue-500 to-blue-400'
                                                : progress.percent > 0
                                                    ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                                                    : 'bg-muted-foreground/20'
                                    )}
                                    style={{ width: `${progress.percent}%` }}
                                />
                            </div>
                            <p className="text-[10px] text-muted-foreground text-right tabular-nums">
                                {progress.percent}% complete
                            </p>
                        </div>

                        {/* Sections */}
                        <div className="space-y-2">
                            {filteredSections.map((section) => (
                                <ChecklistSectionBlock
                                    key={section.id}
                                    section={section}
                                    defaultOpen={expandAll}
                                    onItemStatusChange={(itemId, status) =>
                                        handleItemStatusChange(checklist.id, section.id, itemId, status)
                                    }
                                    onItemNotesChange={(itemId, notes) =>
                                        handleItemNotesChange(checklist.id, section.id, itemId, notes)
                                    }
                                    onItemAssigneeChange={(itemId, assignee) =>
                                        handleItemAssigneeChange(checklist.id, section.id, itemId, assignee)
                                    }
                                    readOnly={readOnly}
                                />
                            ))}

                            {filteredSections.length === 0 && (
                                <div className="text-center py-8 text-sm text-muted-foreground">
                                    No items match the current filter.
                                </div>
                            )}
                        </div>

                        {/* Add another checklist */}
                        {!readOnly && checklists.length < 3 && (
                            <div className="pt-4 border-t border-border/30">
                                <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-muted-foreground">
                                            <Plus className="h-3.5 w-3.5" />
                                            Add Another Checklist
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-md">
                                        <DialogHeader>
                                            <DialogTitle>Choose SOP Template</DialogTitle>
                                            <DialogDescription>
                                                Select a template to generate a checklist for this project.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="space-y-3 mt-4">
                                            {SOP_TEMPLATES.map((template) => (
                                                <button
                                                    key={template.id}
                                                    onClick={() => handleCreateChecklist(template.id)}
                                                    disabled={creating}
                                                    className={cn(
                                                        'w-full text-left p-4 rounded-xl border border-border/50 transition-all duration-200',
                                                        'hover:bg-muted/40 hover:border-primary/30',
                                                        'focus:outline-none focus:ring-2 focus:ring-primary/20',
                                                        creating && 'opacity-50 cursor-not-allowed'
                                                    )}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <span className="text-2xl">{template.icon}</span>
                                                        <div>
                                                            <p className="font-semibold text-sm">{template.name}</p>
                                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                                {template.description}
                                                            </p>
                                                            <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                                                                {template.sections.length} sections ·{' '}
                                                                {template.sections.reduce((a, s) => a + s.items.length, 0)} items
                                                            </p>
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Delete Confirmation */}
            <ConfirmDialog
                open={!!deleteChecklistId}
                onOpenChange={(open) => !open && setDeleteChecklistId(null)}
                title="Delete Checklist?"
                description="This will permanently delete this checklist and all its progress. This action cannot be undone."
                confirmText="Delete"
                onConfirm={handleDeleteChecklist}
                variant="destructive"
            />
        </div>
    );
}
