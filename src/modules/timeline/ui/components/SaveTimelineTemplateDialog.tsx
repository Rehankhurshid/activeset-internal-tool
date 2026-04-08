'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { ProjectTimeline, TimelineTemplate } from '@/types';
import { timelineTemplateService } from '@/services/TimelineTemplateService';

const ICON_OPTIONS = ['📌', '🌐', '✍️', '🧱', '🚀', '🛠️', '🎯', '📅', '🎨', '📊'];

interface SaveTimelineTemplateDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    timeline: ProjectTimeline | null;
    customTemplates: TimelineTemplate[];
    /** When set, prefill with this template's metadata and select "replace" mode. */
    editingTemplate?: TimelineTemplate | null;
    onSaved?: () => void;
}

export function SaveTimelineTemplateDialog({
    open,
    onOpenChange,
    timeline,
    customTemplates,
    editingTemplate,
    onSaved,
}: SaveTimelineTemplateDialogProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [icon, setIcon] = useState('📌');
    // 'new' = create a new custom template; otherwise holds the id of a custom
    // template to overwrite with the current timeline snapshot.
    const [targetId, setTargetId] = useState<string>('new');
    const [saving, setSaving] = useState(false);

    // Reset / prefill when the dialog opens
    useEffect(() => {
        if (!open) return;
        if (editingTemplate) {
            setName(editingTemplate.name);
            setDescription(editingTemplate.description);
            setIcon(editingTemplate.icon || '📌');
            setTargetId(editingTemplate.id);
        } else {
            setName('');
            setDescription('');
            setIcon('📌');
            setTargetId('new');
        }
    }, [open, editingTemplate]);

    const hasMilestones = !!timeline && timeline.milestones.length > 0;
    const isReplace = targetId !== 'new';
    const canSave =
        !!name.trim() && hasMilestones && !saving;

    const handleSave = async () => {
        if (!timeline) return;
        const trimmedName = name.trim();
        if (!trimmedName) return;

        setSaving(true);
        try {
            const meta = {
                name: trimmedName,
                description: description.trim(),
                icon: icon || '📌',
            };
            if (isReplace) {
                await timelineTemplateService.replaceFromTimeline(
                    targetId,
                    timeline,
                    meta
                );
                toast.success('Template updated');
            } else {
                await timelineTemplateService.saveFromTimeline(timeline, meta);
                toast.success('Template saved');
            }
            onSaved?.();
            onOpenChange(false);
        } catch {
            toast.error('Failed to save template');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Save className="h-5 w-5" />
                        Save timeline as template
                    </DialogTitle>
                    <DialogDescription>
                        Captures the current phases and milestones. Dates become
                        day offsets so the template can start from any date.
                    </DialogDescription>
                </DialogHeader>

                {!hasMilestones ? (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-600 dark:text-amber-400">
                        Add at least one milestone before saving as a template.
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="template-name">Name</Label>
                            <Input
                                id="template-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Brand refresh sprint"
                                autoFocus
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="template-description">Description</Label>
                            <Textarea
                                id="template-description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Short summary of what this template covers."
                                className="min-h-[64px] resize-y"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Icon</Label>
                            <div className="flex flex-wrap gap-1.5">
                                {ICON_OPTIONS.map((emoji) => (
                                    <button
                                        key={emoji}
                                        type="button"
                                        onClick={() => setIcon(emoji)}
                                        className={`h-9 w-9 rounded-md border text-lg transition-all ${
                                            icon === emoji
                                                ? 'border-primary bg-primary/10 scale-110'
                                                : 'border-border hover:border-primary/40'
                                        }`}
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {customTemplates.length > 0 && (
                            <div className="space-y-2">
                                <Label htmlFor="template-target">Save to</Label>
                                <Select
                                    value={targetId}
                                    onValueChange={(v) => setTargetId(v)}
                                >
                                    <SelectTrigger id="template-target">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="new">
                                            + Create new template
                                        </SelectItem>
                                        {customTemplates.map((t) => (
                                            <SelectItem key={t.id} value={t.id}>
                                                Replace: {t.icon} {t.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {isReplace && (
                                    <p className="text-[11px] text-muted-foreground">
                                        The existing template&apos;s contents will be
                                        overwritten with the current timeline.
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-[11px] font-mono text-muted-foreground">
                            {timeline.phases.length} phase
                            {timeline.phases.length === 1 ? '' : 's'} ·{' '}
                            {timeline.milestones.length} milestone
                            {timeline.milestones.length === 1 ? '' : 's'}
                        </div>
                    </div>
                )}

                <DialogFooter className="gap-2">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={saving}
                    >
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={!canSave} className="gap-1.5">
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {isReplace ? 'Update template' : 'Save template'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
