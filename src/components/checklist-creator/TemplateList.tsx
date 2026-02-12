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

    const builtIn = templates.filter(t => t.isBuiltIn);
    const custom = templates.filter(t => !t.isBuiltIn);

    return (
        <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* New Template Card */}
                <Card
                    className="border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 transition-colors cursor-pointer group"
                    onClick={onNew}
                >
                    <CardContent className="flex flex-col items-center justify-center h-full min-h-[140px] gap-3 text-muted-foreground group-hover:text-primary transition-colors">
                        <Plus className="h-8 w-8" />
                        <span className="font-medium">New Template</span>
                    </CardContent>
                </Card>

                {/* Custom templates first */}
                {custom.map(t => (
                    <TemplateCard
                        key={t.id}
                        template={t}
                        onEdit={() => onEdit(t)}
                        onDuplicate={() => handleDuplicate(t)}
                        onDelete={() => setDeleteTarget(t)}
                    />
                ))}

                {/* Built-in templates */}
                {builtIn.map(t => (
                    <TemplateCard
                        key={t.id}
                        template={t}
                        onEdit={() => handleDuplicate(t)} // duplicate to edit built-in
                        onDuplicate={() => handleDuplicate(t)}
                    />
                ))}
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
    onEdit: () => void;
    onDuplicate: () => void;
    onDelete?: () => void; // undefined for built-in
}

function TemplateCard({ template, onEdit, onDuplicate, onDelete }: TemplateCardProps) {
    const sectionCount = template.sections?.length || 0;
    const itemCount = template.sections?.reduce((sum, s) => sum + (s.items?.length || 0), 0) || 0;

    return (
        <Card className="group relative hover:shadow-md transition-shadow">
            <CardContent className="p-4 space-y-3">
                {/* Header row */}
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-2xl flex-shrink-0">{template.icon}</span>
                        <div className="min-w-0">
                            <h3 className="font-semibold text-sm truncate">{template.name}</h3>
                            {template.isBuiltIn && (
                                <Badge variant="secondary" className="text-[10px] mt-0.5 gap-1">
                                    <Lock className="h-2.5 w-2.5" /> Built-in
                                </Badge>
                            )}
                        </div>
                    </div>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
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

                {/* Stats */}
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                        {sectionCount} section{sectionCount !== 1 ? 's' : ''}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                        {itemCount} item{itemCount !== 1 ? 's' : ''}
                    </Badge>
                </div>
            </CardContent>
        </Card>
    );
}
