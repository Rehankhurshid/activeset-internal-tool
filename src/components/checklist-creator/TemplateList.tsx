'use client';

import React, { useState, useEffect } from 'react';
import { SOPTemplate } from '@/types';
import { checklistService } from '@/services/ChecklistService';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { SERVICE_LABELS, SERVICE_ORDER, clientStepCount, isServiceId, templatesByService, usedIn } from '@/lib/engagements';
import { Plus, MoreVertical, Pencil, Copy, Trash2, Lock, FileDown, FileText, ClipboardCopy } from 'lucide-react';
import { downloadAsPDF, downloadAsMarkdown, copyAsMarkdown } from '@/lib/template-export';
import { toast } from 'sonner';

interface TemplateListProps {
    onEdit: (template: SOPTemplate) => void;
    onNew: () => void;
}

export function TemplateList({ onEdit, onNew }: TemplateListProps) {
    const [templates, setTemplates] = useState<SOPTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleteTarget, setDeleteTarget] = useState<SOPTemplate | null>(null);

    const fetchTemplates = async () => {
        try {
            setLoading(true);
            const data = await checklistService.getSOPTemplates();
            setTemplates(data);
        } catch {
            toast.error('Failed to load templates');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTemplates();
    }, []);

    const handleDuplicate = async (template: SOPTemplate) => {
        try {
            await checklistService.duplicateSOPTemplate(template.id);
            toast.success(`Duplicated "${template.name}"`);
            fetchTemplates();
        } catch {
            toast.error('Failed to duplicate template');
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            await checklistService.deleteSOPTemplate(deleteTarget.id);
            toast.success(`Deleted "${deleteTarget.name}"`);
            setDeleteTarget(null);
            fetchTemplates();
        } catch {
            toast.error('Failed to delete template');
        }
    };

    if (loading) {
        return (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-[140px] rounded-xl" />
                ))}
            </div>
        );
    }

    // One group per service, in working order; the team's own SOPs first, so
    // the first card in a group is the one a new project gets.
    const byService = templatesByService(templates);
    const untagged = templates.filter((t) => !isServiceId(t.service));
    const card = (t: SOPTemplate, isDefault: boolean) => (
        <TemplateCard
            key={t.id}
            template={t}
            isDefault={isDefault}
            // A built-in opens in the editor as a copy: saving makes it yours.
            onEdit={() => onEdit(t)}
            onDuplicate={() => handleDuplicate(t)}
            onDelete={t.isBuiltIn ? undefined : () => setDeleteTarget(t)}
        />
    );

    return (
        <>
            <div className="space-y-8">
                {SERVICE_ORDER.map((service) => {
                    const list = byService[service];
                    return (
                        <section key={service} aria-labelledby={`sop-group-${service}`} className="space-y-3">
                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2">
                                <h2 id={`sop-group-${service}`} className="text-base font-semibold">
                                    {SERVICE_LABELS[service]}
                                </h2>
                                <span className="text-xs text-muted-foreground">{usedIn(service)}</span>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {list.length > 0 ? (
                                    list.map((t, i) => card(t, i === 0 && list.length > 1))
                                ) : (
                                    <button
                                        type="button"
                                        onClick={onNew}
                                        className="flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-muted-foreground/25 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                                    >
                                        <Plus className="h-5 w-5" />
                                        No SOP for {SERVICE_LABELS[service]} yet
                                    </button>
                                )}
                            </div>
                        </section>
                    );
                })}

                {untagged.length > 0 && (
                    <section aria-labelledby="sop-group-other" className="space-y-3">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2">
                            <h2 id="sop-group-other" className="text-base font-semibold">
                                Other
                            </h2>
                            <span className="text-xs text-muted-foreground">
                                Not one of our services: picked by hand under “Something else” in New project
                            </span>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{untagged.map((t) => card(t, false))}</div>
                    </section>
                )}
            </div>

            {/* Delete confirmation */}
            <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Template</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

// ── Individual Template Card ────────────────────────────────

interface TemplateCardProps {
    template: SOPTemplate;
    /** The one a new project gets, where a service has more than one. */
    isDefault?: boolean;
    onEdit: () => void;
    onDuplicate: () => void;
    onDelete?: () => void; // undefined for built-in
}

function TemplateCard({ template, isDefault, onEdit, onDuplicate, onDelete }: TemplateCardProps) {
    const sectionCount = template.sections?.length || 0;
    const itemCount = template.sections?.reduce((sum, s) => sum + (s.items?.length || 0), 0) || 0;
    const clientSteps = clientStepCount(template);

    return (
        <Card
            role="button"
            tabIndex={0}
            aria-label={`Open ${template.name}`}
            onClick={onEdit}
            onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onEdit();
                }
            }}
            className="group relative cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            <CardContent className="p-4 space-y-3">
                {/* Header row */}
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-2xl flex-shrink-0">{template.icon}</span>
                        <div className="min-w-0">
                            <h3 className="font-semibold text-sm truncate">{template.name}</h3>
                            {(isDefault || template.isBuiltIn) && (
                                <div className="mt-0.5 flex gap-1">
                                    {isDefault && (
                                        <Badge className="text-[10px]" title="New projects that buy this service get this one">
                                            Default
                                        </Badge>
                                    )}
                                    {template.isBuiltIn && (
                                        <Badge variant="secondary" className="text-[10px] gap-1" title="Ships with the app: editing makes your own copy">
                                            <Lock className="h-2.5 w-2.5" /> Built-in
                                        </Badge>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`More for ${template.name}`}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                                className="h-7 w-7 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 focus-visible:opacity-100 transition-opacity"
                            >
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onClick={onEdit}>
                                <Pencil className="h-4 w-4 mr-2" />
                                {template.isBuiltIn ? 'Duplicate & Edit' : 'Edit'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={onDuplicate}>
                                <Copy className="h-4 w-4 mr-2" />
                                Duplicate
                            </DropdownMenuItem>
                            {onDelete && (
                                <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => downloadAsPDF(template)}>
                                <FileDown className="h-4 w-4 mr-2" />
                                Download PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => downloadAsMarkdown(template)}>
                                <FileText className="h-4 w-4 mr-2" />
                                Download Markdown
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={async () => {
                                await copyAsMarkdown(template);
                                toast.success('Copied to clipboard');
                            }}>
                                <ClipboardCopy className="h-4 w-4 mr-2" />
                                Copy as Markdown
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {/* Description */}
                {template.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{template.description}</p>
                )}

                {/* What it holds, and how much of it the client sees. */}
                <p className="text-[11px] tabular-nums text-muted-foreground">
                    {sectionCount} stage{sectionCount !== 1 ? 's' : ''} · {itemCount} step{itemCount !== 1 ? 's' : ''}
                    {clientSteps > 0 ? ` · the client sees ${clientSteps}` : ' · nothing labelled for the client'}
                </p>
            </CardContent>
        </Card>
    );
}
