'use client';

import { useMemo, useRef, useState } from 'react';
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
import { AlertTriangle, Copy, FileText, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
    detectEarliestDate,
    parseTimelineMarkdown,
    type ParsedTimelineMarkdown,
} from '../../domain/timeline.markdown';

const EXAMPLE_MARKDOWN = `## Discovery [violet]
- Kickoff & requirements: 2026-04-15 → 2026-04-19 [in_progress]
- Research & inspiration: 2026-04-17 → 2026-04-24

## Design [blue]
- Wireframes: 2026-04-25 → 2026-05-02
- Visual design: 2026-05-03 → 2026-05-12

## Build [emerald]
- Development sprint: 2026-05-13 → 2026-05-26
- QA & revisions: 2026-05-25 → 2026-06-01 [blocked]

## Launch [amber]
- Launch day: 2026-06-02`;

const LLM_PROMPT = `Generate a project timeline in this exact markdown format:

## Phase name [color]
- Milestone title: YYYY-MM-DD → YYYY-MM-DD [status]

Rules:
- \`##\` starts a phase. Optional \`[color]\`: blue, emerald, amber, rose, violet, slate.
- \`-\` bullets are milestones. Use \`:\` between title and dates.
- Dates are ISO \`YYYY-MM-DD\`. Separator: \`→\`, \`->\`, or \`to\`. A single date means a 1-day milestone.
- Optional \`[status]\`: not_started, in_progress, completed, blocked.
- Leave a blank line between phases. No extra prose, no code fences.

Ask me for the project name, target start date, and rough scope, then generate the timeline.`;

interface TimelineImportMarkdownDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onImport: (parsed: ParsedTimelineMarkdown) => Promise<void>;
}

export function TimelineImportMarkdownDialog({
    open,
    onOpenChange,
    onImport,
}: TimelineImportMarkdownDialogProps) {
    const [markdown, setMarkdown] = useState('');
    const [importing, setImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const parsed = useMemo<ParsedTimelineMarkdown | null>(() => {
        if (!markdown.trim()) return null;
        const anchor = detectEarliestDate(markdown);
        return parseTimelineMarkdown(markdown, anchor);
    }, [markdown]);

    const canImport =
        !!parsed &&
        (parsed.phases.length > 0 || parsed.milestones.length > 0) &&
        !importing;

    const handleFile = async (file: File) => {
        if (!file) return;
        const text = await file.text();
        setMarkdown(text);
    };

    const handleImportClick = async () => {
        if (!parsed) return;
        setImporting(true);
        try {
            await onImport(parsed);
            setMarkdown('');
            onOpenChange(false);
        } finally {
            setImporting(false);
        }
    };

    const handleUseExample = () => {
        setMarkdown(EXAMPLE_MARKDOWN);
    };

    const handleCopyPrompt = async () => {
        try {
            await navigator.clipboard.writeText(LLM_PROMPT);
            toast.success('Prompt copied');
        } catch {
            toast.error('Failed to copy prompt');
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
                        <FileText className="h-5 w-5" />
                        Import timeline from Markdown
                    </DialogTitle>
                    <DialogDescription>
                        Paste or upload a markdown file. Use{' '}
                        <code className="px-1 py-0.5 rounded bg-muted text-[11px]">##</code>{' '}
                        for phases and{' '}
                        <code className="px-1 py-0.5 rounded bg-muted text-[11px]">-</code>{' '}
                        for milestones with ISO dates.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-4 -mx-1 px-1">
                    {/* Format helper */}
                    <details className="rounded-lg border bg-muted/30 text-xs">
                        <summary className="cursor-pointer px-3 py-2 font-medium text-muted-foreground hover:text-foreground">
                            Show format guide
                        </summary>
                        <div className="px-3 pb-3 pt-1 space-y-2 text-muted-foreground">
                            <p>
                                <code className="text-foreground">## Phase name [color]</code>{' '}
                                — starts a new phase. Color is optional; valid values:{' '}
                                <code>blue</code>, <code>emerald</code>, <code>amber</code>,{' '}
                                <code>rose</code>, <code>violet</code>, <code>slate</code>.
                            </p>
                            <p>
                                <code className="text-foreground">
                                    - Title: 2026-04-15 → 2026-04-17 [status]
                                </code>{' '}
                                — adds a milestone. Use <code>:</code> or <code>|</code> as the
                                title-date separator. End date is optional (defaults to start).
                                Status is optional; valid values:{' '}
                                <code>not_started</code>, <code>in_progress</code>,{' '}
                                <code>completed</code>, <code>blocked</code>.
                            </p>
                            <p>
                                Lines before the first <code>##</code> become ungrouped
                                milestones.
                            </p>
                        </div>
                    </details>

                    {/* Textarea */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-medium text-muted-foreground">
                                Markdown
                            </label>
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[11px] gap-1"
                                    onClick={handleCopyPrompt}
                                >
                                    <Copy className="h-3 w-3" />
                                    Copy prompt
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[11px]"
                                    onClick={handleUseExample}
                                >
                                    Use example
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[11px] gap-1"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <Upload className="h-3 w-3" />
                                    Upload .md
                                </Button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".md,.markdown,text/markdown,text/plain"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) void handleFile(file);
                                        e.target.value = '';
                                    }}
                                />
                            </div>
                        </div>
                        <Textarea
                            value={markdown}
                            onChange={(e) => setMarkdown(e.target.value)}
                            placeholder={`## Discovery\n- Kickoff: 2026-04-15 → 2026-04-17\n...`}
                            className="font-mono text-xs min-h-[180px] resize-y"
                        />
                    </div>

                    {/* Preview */}
                    {parsed && (
                        <ImportPreview parsed={parsed} />
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button
                        variant="outline"
                        onClick={() => reset(false)}
                        disabled={importing}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleImportClick}
                        disabled={!canImport}
                        className="gap-1.5"
                    >
                        {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                        Import{' '}
                        {parsed &&
                            parsed.milestones.length > 0 &&
                            `(${parsed.milestones.length})`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ImportPreview({ parsed }: { parsed: ParsedTimelineMarkdown }) {
    const hasContent =
        parsed.phases.length > 0 || parsed.milestones.length > 0;

    return (
        <div className="rounded-lg border bg-card">
            <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                    Preview
                </span>
                <div className="flex items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px] font-mono">
                        {parsed.phases.length} phase
                        {parsed.phases.length === 1 ? '' : 's'}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] font-mono">
                        {parsed.milestones.length} milestone
                        {parsed.milestones.length === 1 ? '' : 's'}
                    </Badge>
                </div>
            </div>
            <div className="px-3 py-2 space-y-1 max-h-44 overflow-y-auto text-xs">
                {!hasContent && (
                    <p className="text-muted-foreground italic">
                        Nothing parsed yet — add phases and milestones above.
                    </p>
                )}
                {parsed.phases.map((phase, i) => {
                    const phaseMilestones = parsed.milestones.filter(
                        (m) => m.phaseIndex === i
                    );
                    return (
                        <div key={`phase-${i}`}>
                            <div className="font-semibold text-foreground">
                                {phase.title}
                                {phase.color && (
                                    <span className="ml-1.5 text-[10px] text-muted-foreground">
                                        [{phase.color}]
                                    </span>
                                )}
                            </div>
                            {phaseMilestones.map((m, j) => (
                                <div key={`m-${i}-${j}`} className="ml-3 text-muted-foreground">
                                    • {m.title}
                                    <span className="ml-1 text-[10px] opacity-70">
                                        ({m.durationDays}d)
                                    </span>
                                </div>
                            ))}
                        </div>
                    );
                })}
                {parsed.milestones
                    .filter((m) => m.phaseIndex === undefined)
                    .map((m, i) => (
                        <div key={`u-${i}`} className="text-muted-foreground">
                            • {m.title}{' '}
                            <span className="text-[10px] opacity-70">
                                ({m.durationDays}d)
                            </span>
                        </div>
                    ))}
            </div>
            {parsed.warnings.length > 0 && (
                <div
                    className={cn(
                        'border-t border-amber-500/30 bg-amber-500/10 px-3 py-2',
                        'text-[11px] text-amber-600 dark:text-amber-400 space-y-0.5'
                    )}
                >
                    <div className="flex items-center gap-1.5 font-semibold">
                        <AlertTriangle className="h-3 w-3" />
                        {parsed.warnings.length} warning
                        {parsed.warnings.length === 1 ? '' : 's'}
                    </div>
                    {parsed.warnings.slice(0, 5).map((w, i) => (
                        <div key={i} className="pl-4">
                            {w}
                        </div>
                    ))}
                    {parsed.warnings.length > 5 && (
                        <div className="pl-4 opacity-70">
                            …and {parsed.warnings.length - 5} more.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
