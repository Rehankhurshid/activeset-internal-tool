'use client';

import { useEffect, useState } from 'react';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { ConfirmDialog } from '@/components/ui/alert-dialog-confirm';
import { Trash2, Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
    TimelineColor,
    TimelineItemStatus,
    TimelineMilestone,
    TimelinePhase,
} from '@/types';
import { TIMELINE_COLORS, TIMELINE_STATUS_LABELS } from '@/types';
import { TIMELINE_COLOR_BG } from '../../domain/timeline.types';

export interface MilestoneDraft {
    title: string;
    phaseId?: string;
    status: TimelineItemStatus;
    startDate: string;
    endDate: string;
    color?: TimelineColor;
    assignee?: string;
    notes?: string;
}

interface TimelineEditSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    milestone: TimelineMilestone | null;    // null = creating new
    phases: TimelinePhase[];
    onSave: (draft: MilestoneDraft) => Promise<void>;
    onDelete?: () => Promise<void>;
    onAddPhase?: (title: string) => Promise<string | undefined>;
    defaultStartDate?: string;
}

const NEW_PHASE_VALUE = '__new__';
const NO_PHASE_VALUE = '__none__';

const NEW_DRAFT = (startDate?: string): MilestoneDraft => ({
    title: '',
    phaseId: undefined,
    status: 'not_started',
    startDate: startDate ?? new Date().toISOString().slice(0, 10),
    endDate: (() => {
        const d = new Date(startDate ?? new Date().toISOString().slice(0, 10));
        d.setDate(d.getDate() + 6);
        return d.toISOString().slice(0, 10);
    })(),
    color: undefined,
    assignee: '',
    notes: '',
});

export function TimelineEditSheet({
    open,
    onOpenChange,
    milestone,
    phases,
    onSave,
    onDelete,
    onAddPhase,
    defaultStartDate,
}: TimelineEditSheetProps) {
    const isEditing = milestone !== null;
    const [draft, setDraft] = useState<MilestoneDraft>(NEW_DRAFT(defaultStartDate));
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [newPhaseMode, setNewPhaseMode] = useState(false);
    const [newPhaseTitle, setNewPhaseTitle] = useState('');

    // Sync draft when milestone changes
    useEffect(() => {
        if (!open) return;
        if (milestone) {
            setDraft({
                title: milestone.title,
                phaseId: milestone.phaseId,
                status: milestone.status,
                startDate: milestone.startDate,
                endDate: milestone.endDate,
                color: milestone.color,
                assignee: milestone.assignee ?? '',
                notes: milestone.notes ?? '',
            });
        } else {
            setDraft(NEW_DRAFT(defaultStartDate));
        }
        setNewPhaseMode(false);
        setNewPhaseTitle('');
    }, [milestone, open, defaultStartDate]);

    const handleSave = async () => {
        if (!draft.title.trim()) return;
        if (draft.endDate < draft.startDate) return;
        setSaving(true);
        try {
            // Handle new phase creation if the user typed one
            let phaseId = draft.phaseId;
            if (newPhaseMode && newPhaseTitle.trim() && onAddPhase) {
                phaseId = await onAddPhase(newPhaseTitle.trim());
            }
            await onSave({
                ...draft,
                phaseId,
                title: draft.title.trim(),
                assignee: draft.assignee?.trim() || undefined,
                notes: draft.notes?.trim() || undefined,
            });
            onOpenChange(false);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!onDelete) return;
        setSaving(true);
        try {
            await onDelete();
            setConfirmDelete(false);
            onOpenChange(false);
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetContent className="w-full sm:max-w-md overflow-y-auto gap-0">
                    <SheetHeader>
                        <SheetTitle>{isEditing ? 'Edit Milestone' : 'New Milestone'}</SheetTitle>
                        <SheetDescription>
                            {isEditing
                                ? 'Update dates, status, assignee, and notes.'
                                : 'Add a new milestone to the project timeline.'}
                        </SheetDescription>
                    </SheetHeader>

                    <div className="px-4 pb-4 space-y-4">
                        {/* Title */}
                        <div className="space-y-1.5">
                            <Label htmlFor="ms-title">Title</Label>
                            <Input
                                id="ms-title"
                                placeholder="e.g. Visual design"
                                value={draft.title}
                                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                                autoFocus
                            />
                        </div>

                        {/* Phase */}
                        <div className="space-y-1.5">
                            <Label>Phase</Label>
                            {newPhaseMode ? (
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="New phase name"
                                        value={newPhaseTitle}
                                        onChange={(e) => setNewPhaseTitle(e.target.value)}
                                        autoFocus
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setNewPhaseMode(false);
                                            setNewPhaseTitle('');
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            ) : (
                                <Select
                                    value={draft.phaseId ?? NO_PHASE_VALUE}
                                    onValueChange={(v) => {
                                        if (v === NEW_PHASE_VALUE) {
                                            setNewPhaseMode(true);
                                        } else if (v === NO_PHASE_VALUE) {
                                            setDraft({ ...draft, phaseId: undefined });
                                        } else {
                                            setDraft({ ...draft, phaseId: v });
                                        }
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NO_PHASE_VALUE}>No phase</SelectItem>
                                        {phases.map((p) => (
                                            <SelectItem key={p.id} value={p.id}>
                                                {p.title}
                                            </SelectItem>
                                        ))}
                                        {onAddPhase && (
                                            <SelectItem value={NEW_PHASE_VALUE}>
                                                <span className="flex items-center gap-1 text-primary">
                                                    <Plus className="h-3 w-3" />
                                                    New phase…
                                                </span>
                                            </SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>

                        {/* Status */}
                        <div className="space-y-1.5">
                            <Label>Status</Label>
                            <Select
                                value={draft.status}
                                onValueChange={(v) =>
                                    setDraft({ ...draft, status: v as TimelineItemStatus })
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(Object.keys(TIMELINE_STATUS_LABELS) as TimelineItemStatus[]).map(
                                        (s) => (
                                            <SelectItem key={s} value={s}>
                                                {TIMELINE_STATUS_LABELS[s]}
                                            </SelectItem>
                                        )
                                    )}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Dates */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Start</Label>
                                <DatePicker
                                    value={draft.startDate}
                                    onChange={(v) => {
                                        // Push the end date if start goes past it
                                        const end = draft.endDate < v ? v : draft.endDate;
                                        setDraft({ ...draft, startDate: v, endDate: end });
                                    }}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>End</Label>
                                <DatePicker
                                    value={draft.endDate}
                                    onChange={(v) => setDraft({ ...draft, endDate: v })}
                                />
                            </div>
                        </div>

                        {/* Color */}
                        <div className="space-y-1.5">
                            <Label>Color</Label>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setDraft({ ...draft, color: undefined })}
                                    className={cn(
                                        'h-7 w-7 rounded-full border-2 flex items-center justify-center text-[10px] text-muted-foreground',
                                        draft.color === undefined
                                            ? 'border-primary'
                                            : 'border-border'
                                    )}
                                    aria-label="Inherit from phase"
                                    title="Inherit from phase"
                                >
                                    —
                                </button>
                                {TIMELINE_COLORS.map((c) => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => setDraft({ ...draft, color: c })}
                                        className={cn(
                                            'h-7 w-7 rounded-full border-2',
                                            TIMELINE_COLOR_BG[c],
                                            draft.color === c
                                                ? 'border-primary ring-2 ring-primary/30'
                                                : 'border-transparent'
                                        )}
                                        aria-label={c}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Assignee */}
                        <div className="space-y-1.5">
                            <Label htmlFor="ms-assignee">Assignee</Label>
                            <Input
                                id="ms-assignee"
                                placeholder="email@example.com"
                                value={draft.assignee ?? ''}
                                onChange={(e) => setDraft({ ...draft, assignee: e.target.value })}
                            />
                        </div>

                        {/* Notes */}
                        <div className="space-y-1.5">
                            <Label htmlFor="ms-notes">Notes</Label>
                            <Textarea
                                id="ms-notes"
                                placeholder="Context, blockers, links…"
                                rows={4}
                                value={draft.notes ?? ''}
                                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-auto flex items-center justify-between border-t bg-background p-4 sticky bottom-0">
                        {isEditing && onDelete ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setConfirmDelete(true)}
                                disabled={saving}
                            >
                                <Trash2 className="h-4 w-4 mr-1.5" />
                                Delete
                            </Button>
                        ) : (
                            <span />
                        )}
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                disabled={saving}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                onClick={handleSave}
                                disabled={
                                    saving ||
                                    !draft.title.trim() ||
                                    draft.endDate < draft.startDate
                                }
                            >
                                {saving ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : isEditing ? (
                                    'Save changes'
                                ) : (
                                    'Create milestone'
                                )}
                            </Button>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>

            <ConfirmDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title="Delete milestone?"
                description="This milestone will be permanently removed from the timeline."
                confirmText="Delete"
                variant="destructive"
                onConfirm={handleDelete}
            />
        </>
    );
}
