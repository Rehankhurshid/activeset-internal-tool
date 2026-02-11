'use client';

import React from 'react';
import {
    ChecklistSection as ChecklistSectionType,
    ProjectChecklist,
    ChecklistItemStatus,
    SOPTemplate,
} from '@/types';
import { checklistService } from '@/services/ChecklistService';
import { ChecklistSectionBlock, SortableChecklistSection } from './ChecklistSection';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
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
    const [templates, setTemplates] = React.useState<SOPTemplate[]>([]);
    const [selectedTemplateIds, setSelectedTemplateIds] = React.useState<string[]>([]);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    React.useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                // Subscribe to checklists
                const unsub = checklistService.subscribeToProjectChecklists(projectId, (cls) => {
                    setChecklists(cls);
                    setLoading(false);
                });

                // Load templates (static + custom)
                const tpls = await checklistService.getSOPTemplates();
                setTemplates(tpls);

                return unsub;
            } catch (error) {
                console.error("Failed to load data", error);
                setLoading(false);
            }
        };

        const cleanup = loadData();
        return () => { cleanup.then(unsub => unsub && unsub()); };
    }, [projectId]);

    const [isEditing, setIsEditing] = React.useState(false);

    const handleDragEnd = async (event: DragEndEvent, checklistId: string) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const checklist = checklists.find(c => c.id === checklistId);
        if (!checklist) return;

        const oldIndex = checklist.sections.findIndex(s => s.id === active.id);
        const newIndex = checklist.sections.findIndex(s => s.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
            const newSections = arrayMove(checklist.sections, oldIndex, newIndex);
            // Optimistic update (optional, but handled by subscription mostly)
            // Ideally we call service
            try {
                // Re-assign order based on index
                const orderedSections = newSections.map((s, idx) => ({ ...s, order: idx }));
                await checklistService.updateSections(checklistId, orderedSections);
            } catch {
                toast.error('Failed to reorder sections');
            }
        }
    };

    const handleCreateChecklist = async () => {
        if (selectedTemplateIds.length === 0) return;
        setCreating(true);
        try {
            await checklistService.createChecklist(projectId, selectedTemplateIds);
            toast.success('Checklist created');
            setTemplateDialogOpen(false);
            setSelectedTemplateIds([]);
        } catch {
            toast.error('Failed to create checklist');
        } finally {
            setCreating(false);
        }
    };

    const toggleTemplateSelection = (id: string) => {
        setSelectedTemplateIds(prev =>
            prev.includes(id) ? prev.filter(tid => tid !== id) : [...prev, id]
        );
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

    // -- Structure Editing Handlers --

    const handleDeleteSection = async (checklistId: string, sectionId: string) => {
        try {
            await checklistService.deleteSection(checklistId, sectionId);
            toast.success('Section deleted');
        } catch {
            toast.error('Failed to delete section');
        }
    };

    const handleAddSection = async (checklistId: string) => {
        const checklist = checklists.find(c => c.id === checklistId);
        if (!checklist) return;

        try {
            await checklistService.addSection(checklistId, {
                id: `sec_${Date.now()}`,
                title: 'New Section',
                items: [],
                order: checklist.sections.length
            });
            toast.success('Section added');
        } catch {
            toast.error('Failed to add section');
        }
    };

    const handleAddItem = async (checklistId: string, sectionId: string) => {
        const checklist = checklists.find(c => c.id === checklistId);
        if (!checklist) return;
        const section = checklist.sections.find(s => s.id === sectionId);
        if (!section) return;

        try {
            await checklistService.addItem(checklistId, sectionId, {
                id: `item_${Date.now()}`,
                title: 'New Item',
                status: 'not_started',
                order: section.items.length
            });
            toast.success('Item added');
        } catch {
            toast.error('Failed to add item');
        }
    };

    const handleDeleteItem = async (checklistId: string, sectionId: string, itemId: string) => {
        try {
            await checklistService.deleteItem(checklistId, sectionId, itemId);
            toast.success('Item deleted');
        } catch {
            toast.error('Failed to delete item');
        }
    };

    const handleUpdateSection = async (checklistId: string, sectionId: string, updates: Partial<ChecklistSectionType>) => {
        try {
            await checklistService.updateSectionDetails(checklistId, sectionId, updates);
        } catch {
            toast.error('Failed to update section');
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
                    <Dialog open={templateDialogOpen} onOpenChange={(open) => {
                        setTemplateDialogOpen(open);
                        if (!open) setSelectedTemplateIds([]);
                    }}>
                        <DialogTrigger asChild>
                            <Button className="gap-2">
                                <Plus className="h-4 w-4" />
                                Add Checklist
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle>Choose SOP Templates</DialogTitle>
                                <DialogDescription>
                                    Select one or more templates to merge into a single project checklist.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3 mt-4 max-h-[60vh] overflow-y-auto">
                                {templates.map((template) => {
                                    const isSelected = selectedTemplateIds.includes(template.id);
                                    return (
                                        <button
                                            key={template.id}
                                            onClick={() => toggleTemplateSelection(template.id)}
                                            disabled={creating}
                                            className={cn(
                                                'w-full text-left p-4 rounded-xl border transition-all duration-200 relative',
                                                isSelected
                                                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                                    : 'border-border/50 hover:bg-muted/40 hover:border-primary/30',
                                                creating && 'opacity-50 cursor-not-allowed'
                                            )}
                                        >
                                            <div className="flex items-start gap-3">
                                                <span className="text-2xl">{template.icon || '📋'}</span>
                                                <div>
                                                    <p className="font-semibold text-sm">{template.name}</p>
                                                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                                        {template.description}
                                                    </p>
                                                    <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                                                        {template.sections.length} sections ·{' '}
                                                        {template.sections.reduce((a, s) => a + s.items.length, 0)} items
                                                    </p>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex justify-end gap-2 mt-4">
                                <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Cancel</Button>
                                <Button onClick={handleCreateChecklist} disabled={selectedTemplateIds.length === 0 || creating}>
                                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Checklist'}
                                </Button>
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
                                        <>
                                            <Button
                                                variant={isEditing ? "secondary" : "ghost"}
                                                size="sm"
                                                className="h-7 text-xs gap-1.5 ml-2"
                                                onClick={() => setIsEditing(!isEditing)}
                                            >
                                                {isEditing ? 'Done Editing' : 'Edit Structure'}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                onClick={() => setDeleteChecklistId(checklist.id)}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </>
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
                        {!isEditing && (
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
                        )}

                        {/* Sections */}
                        <div className="space-y-2">
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={(e) => handleDragEnd(e, checklist.id)}
                            >
                                <SortableContext
                                    items={filteredSections.map((s) => s.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    {filteredSections.map((section) => (
                                        <SortableChecklistSection
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
                                            isEditing={isEditing}
                                            onDeleteSection={() => handleDeleteSection(checklist.id, section.id)}
                                            onAddItem={() => handleAddItem(checklist.id, section.id)}
                                            onDeleteItem={(itemId) => handleDeleteItem(checklist.id, section.id, itemId)}
                                            onUpdateSection={(updates) => handleUpdateSection(checklist.id, section.id, updates)}
                                            readOnly={readOnly}
                                        />
                                    ))}
                                </SortableContext>
                            </DndContext>

                            {filteredSections.length === 0 && (
                                <div className="text-center py-8 text-sm text-muted-foreground">
                                    No items match the current filter.
                                </div>
                            )}

                            {/* Add Section Button */}
                            {isEditing && (
                                <Button
                                    variant="outline"
                                    className="w-full border-dashed border-2 py-6 text-muted-foreground hover:text-primary hover:border-primary/50"
                                    onClick={() => handleAddSection(checklist.id)}
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add New Section
                                </Button>
                            )}
                        </div>

                        {/* Add another checklist */}
                        {!readOnly && !isEditing && checklists.length < 5 && (
                            <div className="pt-4 border-t border-border/30">
                                <Dialog open={templateDialogOpen} onOpenChange={(open) => {
                                    setTemplateDialogOpen(open);
                                    if (!open) setSelectedTemplateIds([]);
                                }}>
                                    <DialogTrigger asChild>
                                        <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-muted-foreground">
                                            <Plus className="h-3.5 w-3.5" />
                                            Add Another Checklist
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-md">
                                        <DialogHeader>
                                            <DialogTitle>Choose SOP Templates</DialogTitle>
                                            <DialogDescription>
                                                Select one or more templates to merge into a single project checklist.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="space-y-3 mt-4 max-h-[60vh] overflow-y-auto">
                                            {templates.map((template) => {
                                                const isSelected = selectedTemplateIds.includes(template.id);
                                                return (
                                                    <button
                                                        key={template.id}
                                                        onClick={() => toggleTemplateSelection(template.id)}
                                                        disabled={creating}
                                                        className={cn(
                                                            'w-full text-left p-4 rounded-xl border transition-all duration-200 relative',
                                                            isSelected
                                                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                                                : 'border-border/50 hover:bg-muted/40 hover:border-primary/30',
                                                            creating && 'opacity-50 cursor-not-allowed'
                                                        )}
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            <span className="text-2xl">{template.icon || '📋'}</span>
                                                            <div>
                                                                <p className="font-semibold text-sm">{template.name}</p>
                                                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                                                    {template.description}
                                                                </p>
                                                                <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                                                                    {template.sections.length} sections ·{' '}
                                                                    {template.sections.reduce((a, s) => a + s.items.length, 0)} items
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div className="flex justify-end gap-2 mt-4">
                                            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Cancel</Button>
                                            <Button onClick={handleCreateChecklist} disabled={selectedTemplateIds.length === 0 || creating}>
                                                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Checklist'}
                                            </Button>
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
