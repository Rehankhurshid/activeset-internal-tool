'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
    Plus,
    GanttChartSquare,
    List,
    CalendarRange,
    Loader2,
    Sparkles,
} from 'lucide-react';
import type { TimelineMilestone } from '@/types';
import { TIMELINE_TEMPLATES } from '@/lib/timeline-templates';
import { timelineRepository } from '../../infrastructure/timeline.repository';
import { useProjectTimeline } from '@/hooks/useProjectTimeline';
import type {
    TimelineViewMode,
    TimelineZoom,
} from '../../domain/timeline.types';
import { TimelineGantt } from '../components/TimelineGantt';
import { TimelineList } from '../components/TimelineList';
import {
    TimelineEditSheet,
    type MilestoneDraft,
} from '../components/TimelineEditSheet';

interface ProjectTimelineOverviewProps {
    projectId: string;
    userEmail?: string;
}

export function ProjectTimelineOverview({
    projectId,
}: ProjectTimelineOverviewProps) {
    const { timeline, loading } = useProjectTimeline(projectId);

    const [viewMode, setViewMode] = useState<TimelineViewMode>('timeline');
    const [zoom, setZoom] = useState<TimelineZoom>('week');
    const [editOpen, setEditOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
    const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);

    // Auto-switch to list on small viewports
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia('(max-width: 640px)');
        const apply = () => {
            if (mq.matches) setViewMode('list');
        };
        apply();
        mq.addEventListener('change', apply);
        return () => mq.removeEventListener('change', apply);
    }, []);

    const editingMilestone: TimelineMilestone | null = useMemo(() => {
        if (!timeline || !editingId) return null;
        return timeline.milestones.find((m) => m.id === editingId) ?? null;
    }, [timeline, editingId]);

    const openNew = () => {
        setEditingId(null);
        setEditOpen(true);
    };

    const openEdit = (milestoneId: string) => {
        setEditingId(milestoneId);
        setEditOpen(true);
    };

    const handleSave = useCallback(
        async (draft: MilestoneDraft) => {
            try {
                if (editingId) {
                    await timelineRepository.updateMilestone(projectId, editingId, {
                        title: draft.title,
                        phaseId: draft.phaseId,
                        status: draft.status,
                        startDate: draft.startDate,
                        endDate: draft.endDate,
                        progress: draft.progress,
                        color: draft.color,
                        assignee: draft.assignee,
                        notes: draft.notes,
                    });
                    toast.success('Milestone updated');
                } else {
                    await timelineRepository.addMilestone(projectId, {
                        title: draft.title,
                        phaseId: draft.phaseId,
                        status: draft.status,
                        startDate: draft.startDate,
                        endDate: draft.endDate,
                        progress: draft.progress,
                        color: draft.color,
                        assignee: draft.assignee,
                        notes: draft.notes,
                    });
                    toast.success('Milestone created');
                }
            } catch {
                toast.error('Failed to save milestone');
            }
        },
        [editingId, projectId]
    );

    const handleDelete = useCallback(async () => {
        if (!editingId) return;
        try {
            await timelineRepository.deleteMilestone(projectId, editingId);
            toast.success('Milestone deleted');
        } catch {
            toast.error('Failed to delete milestone');
        }
    }, [editingId, projectId]);

    const handleUpdateDates = useCallback(
        async (milestoneId: string, startDate: string, endDate: string) => {
            try {
                await timelineRepository.updateMilestone(projectId, milestoneId, {
                    startDate,
                    endDate,
                });
            } catch {
                toast.error('Failed to update dates');
            }
        },
        [projectId]
    );

    const handleTogglePhaseCollapsed = useCallback(
        async (phaseId: string) => {
            if (!timeline) return;
            const phase = timeline.phases.find((p) => p.id === phaseId);
            if (!phase) return;
            try {
                await timelineRepository.updatePhase(projectId, phaseId, {
                    collapsed: !phase.collapsed,
                });
            } catch {
                toast.error('Failed to toggle phase');
            }
        },
        [projectId, timeline]
    );

    const handleAddPhase = useCallback(
        async (title: string): Promise<string | undefined> => {
            try {
                const id = await timelineRepository.addPhase(projectId, { title });
                return id;
            } catch {
                toast.error('Failed to add phase');
                return undefined;
            }
        },
        [projectId]
    );

    const handleApplyTemplate = useCallback(
        async (templateId: string) => {
            setApplyingTemplateId(templateId);
            try {
                await timelineRepository.applyTemplate(projectId, templateId);
                toast.success('Template applied');
                setTemplateDialogOpen(false);
            } catch {
                toast.error('Failed to apply template');
            } finally {
                setApplyingTemplateId(null);
            }
        },
        [projectId]
    );

    if (loading) {
        return (
            <div className="space-y-3">
                <Skeleton className="h-10 w-full max-w-md" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    const isEmpty = !timeline || timeline.milestones.length === 0;

    return (
        <div className="space-y-4">
            {/* Header row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-lg border bg-card p-0.5">
                        <ViewToggle
                            active={viewMode === 'timeline'}
                            onClick={() => setViewMode('timeline')}
                            icon={<GanttChartSquare className="h-3.5 w-3.5" />}
                            label="Timeline"
                        />
                        <ViewToggle
                            active={viewMode === 'list'}
                            onClick={() => setViewMode('list')}
                            icon={<List className="h-3.5 w-3.5" />}
                            label="List"
                        />
                    </div>

                    {viewMode === 'timeline' && (
                        <Select value={zoom} onValueChange={(v) => setZoom(v as TimelineZoom)}>
                            <SelectTrigger className="h-8 w-[110px] text-xs">
                                <CalendarRange className="h-3 w-3 mr-1" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="week">Week</SelectItem>
                                <SelectItem value="month">Month</SelectItem>
                                <SelectItem value="quarter">Quarter</SelectItem>
                            </SelectContent>
                        </Select>
                    )}

                    {timeline && timeline.milestones.length > 0 && (
                        <Badge variant="secondary" className="font-mono text-xs">
                            {timeline.milestones.length} milestone
                            {timeline.milestones.length === 1 ? '' : 's'}
                        </Badge>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {!isEmpty && (
                        <TemplateDialogButton
                            open={templateDialogOpen}
                            onOpenChange={setTemplateDialogOpen}
                            onApply={handleApplyTemplate}
                            applyingId={applyingTemplateId}
                            variant="ghost"
                        />
                    )}
                    <Button size="sm" className="gap-1.5" onClick={openNew}>
                        <Plus className="h-4 w-4" />
                        Add Milestone
                    </Button>
                </div>
            </div>

            {/* Body */}
            {isEmpty ? (
                <EmptyState
                    onNew={openNew}
                    templateDialogOpen={templateDialogOpen}
                    onTemplateDialogOpenChange={setTemplateDialogOpen}
                    onApplyTemplate={handleApplyTemplate}
                    applyingTemplateId={applyingTemplateId}
                />
            ) : viewMode === 'timeline' ? (
                <TimelineGantt
                    timeline={timeline!}
                    zoom={zoom}
                    onOpenMilestone={openEdit}
                    onUpdateMilestoneDates={handleUpdateDates}
                    onTogglePhaseCollapsed={handleTogglePhaseCollapsed}
                />
            ) : (
                <TimelineList timeline={timeline!} onOpenMilestone={openEdit} />
            )}

            <TimelineEditSheet
                open={editOpen}
                onOpenChange={setEditOpen}
                milestone={editingMilestone}
                phases={timeline?.phases ?? []}
                onSave={handleSave}
                onDelete={editingMilestone ? handleDelete : undefined}
                onAddPhase={handleAddPhase}
            />
        </div>
    );
}

function ViewToggle({
    active,
    onClick,
    icon,
    label,
}: {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
            )}
        >
            {icon}
            {label}
        </button>
    );
}

function EmptyState({
    onNew,
    templateDialogOpen,
    onTemplateDialogOpenChange,
    onApplyTemplate,
    applyingTemplateId,
}: {
    onNew: () => void;
    templateDialogOpen: boolean;
    onTemplateDialogOpenChange: (open: boolean) => void;
    onApplyTemplate: (id: string) => void;
    applyingTemplateId: string | null;
}) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-xl bg-card">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <GanttChartSquare className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No timeline yet</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                Plan phases, milestones, and dates on a visual timeline. Drag bars to
                move them, resize to change duration.
            </p>
            <div className="flex items-center gap-2">
                <Button className="gap-1.5" onClick={onNew}>
                    <Plus className="h-4 w-4" />
                    Add Milestone
                </Button>
                <TemplateDialogButton
                    open={templateDialogOpen}
                    onOpenChange={onTemplateDialogOpenChange}
                    onApply={onApplyTemplate}
                    applyingId={applyingTemplateId}
                    variant="outline"
                />
            </div>
        </div>
    );
}

function TemplateDialogButton({
    open,
    onOpenChange,
    onApply,
    applyingId,
    variant,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onApply: (id: string) => void;
    applyingId: string | null;
    variant: 'outline' | 'ghost';
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                <Button variant={variant} size="sm" className="gap-1.5">
                    <Sparkles className="h-4 w-4" />
                    Use Template
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Start from a template</DialogTitle>
                    <DialogDescription>
                        Seed the timeline with phases and milestones. Dates start from today
                        and can be dragged around afterward.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 mt-2">
                    {TIMELINE_TEMPLATES.map((t) => {
                        const isApplying = applyingId === t.id;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => onApply(t.id)}
                                disabled={applyingId !== null}
                                className={cn(
                                    'w-full text-left p-4 rounded-xl border transition-all',
                                    'hover:border-primary/40 hover:bg-muted/40',
                                    applyingId !== null && 'opacity-50 cursor-not-allowed'
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <span className="text-2xl">{t.icon}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold text-sm">{t.name}</p>
                                            {isApplying && (
                                                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {t.description}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                                            {t.phases.length} phases · {t.milestones.length} milestones
                                        </p>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </DialogContent>
        </Dialog>
    );
}
