'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { AlertTriangle, Code2, Loader2 } from 'lucide-react';
import type { ProjectTimeline } from '@/types';
import {
    detectEarliestDate,
    parseTimelineMarkdown,
    serializeTimelineToMarkdown,
    type ParsedTimelineMarkdown,
} from '../../domain/timeline.markdown';

interface TimelineMarkdownEditorDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    timeline: ProjectTimeline;
    onSave: (parsed: ParsedTimelineMarkdown) => Promise<void>;
}

export function TimelineMarkdownEditorDialog({
    open,
    onOpenChange,
    timeline,
    onSave,
}: TimelineMarkdownEditorDialogProps) {
    const [markdown, setMarkdown] = useState('');
    const [saving, setSaving] = useState(false);

    // Serialize the current timeline into markdown when dialog opens
    useEffect(() => {
        if (open) {
            setMarkdown(serializeTimelineToMarkdown(timeline));
        }
    }, [open, timeline]);

    const parsed = useMemo<ParsedTimelineMarkdown | null>(() => {
        if (!markdown.trim()) return null;
        const anchor = detectEarliestDate(markdown);
        return parseTimelineMarkdown(markdown, anchor);
    }, [markdown]);

    const canSave =
        !!parsed &&
        (parsed.phases.length > 0 || parsed.milestones.length > 0) &&
        !saving;

    const handleSave = async () => {
        if (!parsed) return;
        setSaving(true);
        try {
            await onSave(parsed);
            onOpenChange(false);
        } finally {
            setSaving(false);
        }
    };

    const reset = (nextOpen: boolean) => {
        if (!nextOpen) {
            setMarkdown('');
        }
        onOpenChange(nextOpen);
    };

    return (
        <Dialog open={open} onOpenChange={reset}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Code2 className="h-5 w-5" />
                        Edit timeline as Markdown
                    </DialogTitle>
                    <DialogDescription>
                        Edit phases and milestones directly. Saving replaces the
                        entire timeline with what&apos;s below.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-3 -mx-1 px-1">
                    <Textarea
                        value={markdown}
                        onChange={(e) => setMarkdown(e.target.value)}
                        className="font-mono text-xs min-h-[280px] resize-y"
                    />

                    {/* Live stats */}
                    {parsed && (
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[10px] font-mono">
                                {parsed.phases.length} phase
                                {parsed.phases.length === 1 ? '' : 's'}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] font-mono">
                                {parsed.milestones.length} milestone
                                {parsed.milestones.length === 1 ? '' : 's'}
                            </Badge>
                            {parsed.warnings.length > 0 && (
                                <div
                                    className={cn(
                                        'flex items-center gap-1 text-[11px]',
                                        'text-amber-600 dark:text-amber-400'
                                    )}
                                >
                                    <AlertTriangle className="h-3 w-3" />
                                    {parsed.warnings.length} warning
                                    {parsed.warnings.length === 1 ? '' : 's'}
                                </div>
                            )}
                        </div>
                    )}

                    {parsed && parsed.warnings.length > 0 && (
                        <div
                            className={cn(
                                'rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2',
                                'text-[11px] text-amber-600 dark:text-amber-400 space-y-0.5'
                            )}
                        >
                            {parsed.warnings.slice(0, 5).map((w, i) => (
                                <div key={i}>{w}</div>
                            ))}
                            {parsed.warnings.length > 5 && (
                                <div className="opacity-70">
                                    …and {parsed.warnings.length - 5} more.
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button
                        variant="outline"
                        onClick={() => reset(false)}
                        disabled={saving}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!canSave}
                        className="gap-1.5"
                    >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Replace timeline
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
