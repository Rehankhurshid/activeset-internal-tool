'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
    AlertTriangle,
    FileSignature,
    Loader2,
    Search,
    CheckCircle2,
} from 'lucide-react';
import type { Proposal } from '@/app/modules/proposal/types/Proposal';
import { proposalService } from '@/app/modules/proposal/services/ProposalService';
import {
    proposalToParsedTimeline,
} from '../../domain/timeline.proposal';
import type { ParsedTimelineMarkdown } from '../../domain/timeline.markdown';

interface TimelineImportProposalDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onImport: (parsed: ParsedTimelineMarkdown, proposal: Proposal) => Promise<void>;
}

export function TimelineImportProposalDialog({
    open,
    onOpenChange,
    onImport,
}: TimelineImportProposalDialogProps) {
    const [proposals, setProposals] = useState<Proposal[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setProposals(null);
        setLoadError(null);
        proposalService
            .getProposals()
            .then((list) => {
                if (cancelled) return;
                setProposals(list);
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setLoadError(
                    err instanceof Error ? err.message : 'Failed to load proposals'
                );
            });
        return () => {
            cancelled = true;
        };
    }, [open]);

    const filtered = useMemo(() => {
        if (!proposals) return [];
        const q = search.trim().toLowerCase();
        if (!q) return proposals;
        return proposals.filter((p) =>
            [p.title, p.clientName, p.agencyName]
                .filter(Boolean)
                .some((s) => s.toLowerCase().includes(q))
        );
    }, [proposals, search]);

    const selected = useMemo(
        () => proposals?.find((p) => p.id === selectedId) ?? null,
        [proposals, selectedId]
    );

    const parsed = useMemo<ParsedTimelineMarkdown | null>(
        () => (selected ? proposalToParsedTimeline(selected) : null),
        [selected]
    );

    const canImport =
        !!selected && !!parsed && parsed.milestones.length > 0 && !importing;

    const handleImport = async () => {
        if (!selected || !parsed) return;
        setImporting(true);
        try {
            await onImport(parsed, selected);
            reset(false);
        } catch {
            // Caller surfaces its own toast; keep dialog open so user can retry.
        } finally {
            setImporting(false);
        }
    };

    const reset = (nextOpen: boolean) => {
        if (!nextOpen) {
            setSelectedId(null);
            setSearch('');
        }
        onOpenChange(nextOpen);
    };

    return (
        <Dialog open={open} onOpenChange={reset}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileSignature className="h-5 w-5" />
                        Import timeline from Proposal
                    </DialogTitle>
                    <DialogDescription>
                        Pick a proposal to copy its phases into this project&apos;s
                        timeline. You can edit, split, or delete phases afterwards.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-3 -mx-1 px-1">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by title, client, or agency"
                            className="pl-8 h-9 text-sm"
                            disabled={!proposals}
                        />
                    </div>

                    {loadError && (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            {loadError}
                            <Button
                                variant="link"
                                className="px-1 h-auto text-xs"
                                onClick={() => {
                                    setProposals(null);
                                    setLoadError(null);
                                    proposalService
                                        .getProposals()
                                        .then(setProposals)
                                        .catch((err: unknown) =>
                                            setLoadError(
                                                err instanceof Error
                                                    ? err.message
                                                    : 'Failed to load proposals'
                                            )
                                        );
                                }}
                            >
                                Retry
                            </Button>
                        </div>
                    )}

                    {!loadError && !proposals && (
                        <div className="flex items-center justify-center py-10 text-xs text-muted-foreground gap-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Loading proposals…
                        </div>
                    )}

                    {proposals && filtered.length === 0 && (
                        <div className="rounded-lg border bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
                            {proposals.length === 0
                                ? 'No proposals found.'
                                : 'No proposals match that search.'}
                        </div>
                    )}

                    {proposals && filtered.length > 0 && (
                        <ScrollArea className="max-h-72 rounded-lg border">
                            <ul className="divide-y divide-border/60">
                                {filtered.map((p) => {
                                    const phaseCount = p.data?.timeline?.phases?.length ?? 0;
                                    const isSelected = p.id === selectedId;
                                    return (
                                        <li key={p.id}>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedId(p.id)}
                                                className={cn(
                                                    'w-full text-left px-3 py-2.5 flex items-start gap-3 hover:bg-muted/40 transition-colors',
                                                    isSelected && 'bg-muted/60'
                                                )}
                                            >
                                                <div
                                                    className={cn(
                                                        'mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0',
                                                        isSelected
                                                            ? 'border-primary bg-primary text-primary-foreground'
                                                            : 'border-muted-foreground/40'
                                                    )}
                                                >
                                                    {isSelected && (
                                                        <CheckCircle2 className="h-3 w-3" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-sm font-medium truncate">
                                                            {p.title || 'Untitled proposal'}
                                                        </span>
                                                        <Badge
                                                            variant="secondary"
                                                            className="text-[10px] font-mono"
                                                        >
                                                            {phaseCount} phase
                                                            {phaseCount === 1 ? '' : 's'}
                                                        </Badge>
                                                        <Badge
                                                            variant="outline"
                                                            className="text-[10px] capitalize"
                                                        >
                                                            {p.status}
                                                        </Badge>
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground truncate">
                                                        {p.clientName || 'No client'}
                                                        {p.updatedAt &&
                                                            ` · updated ${formatRelativeDate(p.updatedAt)}`}
                                                    </div>
                                                </div>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </ScrollArea>
                    )}

                    {parsed && selected && (
                        <ProposalImportPreview parsed={parsed} />
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
                        onClick={handleImport}
                        disabled={!canImport}
                        className="gap-1.5"
                    >
                        {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                        Import{' '}
                        {parsed && parsed.milestones.length > 0
                            ? `(${parsed.milestones.length})`
                            : ''}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ProposalImportPreview({ parsed }: { parsed: ParsedTimelineMarkdown }) {
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
                        anchor {parsed.referenceStart}
                    </Badge>
                </div>
            </div>
            <div className="px-3 py-2 space-y-1 max-h-44 overflow-y-auto text-xs">
                {parsed.phases.map((phase, i) => {
                    const m = parsed.milestones[i];
                    return (
                        <div key={`pp-${i}`} className="flex items-baseline gap-2">
                            <span className="font-medium text-foreground truncate">
                                {phase.title}
                            </span>
                            {m && (
                                <span className="text-[10px] text-muted-foreground font-mono">
                                    +{m.startOffsetDays}d · {m.durationDays}d
                                </span>
                            )}
                        </div>
                    );
                })}
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
                        {parsed.warnings.length} note
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

function formatRelativeDate(iso: string): string {
    try {
        const then = new Date(iso).getTime();
        if (!Number.isFinite(then)) return '';
        const diffMs = Date.now() - then;
        const days = Math.round(diffMs / 86400000);
        if (days < 1) return 'today';
        if (days < 2) return 'yesterday';
        if (days < 30) return `${days}d ago`;
        if (days < 365) return `${Math.round(days / 30)}mo ago`;
        return `${Math.round(days / 365)}y ago`;
    } catch {
        return '';
    }
}

