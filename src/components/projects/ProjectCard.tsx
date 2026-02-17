'use client';

import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/alert-dialog-confirm';
import {
    Trash2,
    ChevronRight,
    Link as LinkIcon,
    Edit,
    MoreVertical,
    Plus,
    Circle,
    Archive,
    Tag,
    Check,
} from 'lucide-react';
import { Project, ProjectLink, ProjectStatus, ProjectTag, PROJECT_TAG_LABELS } from '@/types';
import { projectsService } from '@/services/database';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { AddLinkDialog } from './AddLinkDialog';
import { ChecklistProgressBadge } from '@/components/checklist/ChecklistProgressBadge';

const TAG_COLORS: Record<ProjectTag, { bg: string; text: string; border: string }> = {
    retainer: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
    one_time: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
    subscription: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
    maintenance: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
    consulting: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20' },
};

const ALL_TAGS: ProjectTag[] = ['retainer', 'one_time', 'subscription', 'maintenance', 'consulting'];

interface ProjectCardProps {
    project: Project;
    onDelete: (projectId: string) => void;
}

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
    const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
    const [isDeleting, setIsDeleting] = React.useState(false);
    const [editingLinkId, setEditingLinkId] = React.useState<string | null>(null);

    const status: ProjectStatus = project.status || 'current';
    const tags: ProjectTag[] = project.tags || [];
    const isCurrent = status === 'current';

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await projectsService.deleteProject(project.id);
            onDelete(project.id);
        } finally {
            setIsDeleting(false);
            setIsDeleteOpen(false);
        }
    };

    const handleToggleStatus = async () => {
        const newStatus: ProjectStatus = isCurrent ? 'past' : 'current';
        await projectsService.updateProjectStatus(project.id, newStatus);
    };

    const handleToggleTag = async (tag: ProjectTag) => {
        const newTags = tags.includes(tag)
            ? tags.filter(t => t !== tag)
            : [...tags, tag];
        await projectsService.updateProjectTags(project.id, newTags);
    };

    const handleAddLink = async (title: string, url: string) => {
        await projectsService.addLinkToProject(project.id, {
            title,
            url,
            order: (project.links?.length || 0),
            isDefault: false,
            source: 'manual'
        });
    };

    // ONLY manual links (source !== 'auto')
    const manualLinks = project.links?.filter(l => l.source !== 'auto') || [];
    const displayLimit = 3;
    const displayLinks = manualLinks.slice(0, displayLimit);
    const remainingCount = manualLinks.length > displayLimit ? manualLinks.length - displayLimit : 0;

    const handleEditLink = async (linkId: string, title: string, url: string) => {
        await projectsService.updateLink(project.id, linkId, { title, url });
        setEditingLinkId(null);
    };

    const handleDeleteLink = async (linkId: string) => {
        await projectsService.deleteLink(project.id, linkId);
    };

    const handleOpenLink = (url: string) => {
        if (url) window.open(url, '_blank');
    };

    return (
        <>
            <Card
                role="article"
                aria-label={`Project: ${project.name}`}
                className={cn(
                    "group relative flex flex-col h-full overflow-hidden border transition-all duration-300",
                    "hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-0.5",
                    "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                    isCurrent
                        ? "border-border/60 bg-gradient-to-br from-card via-card to-card/80"
                        : "border-border/30 bg-card/60 opacity-75 hover:opacity-100"
                )}
            >
                {/* Accent stripe */}
                <div className={cn(
                    "absolute top-0 left-0 right-0 h-[3px] transition-all duration-300",
                    isCurrent
                        ? "bg-gradient-to-r from-primary via-primary/80 to-primary/40"
                        : "bg-gradient-to-r from-muted-foreground/30 via-muted-foreground/20 to-transparent"
                )} />

                {/* Header */}
                <div className="flex items-start justify-between p-4 pb-2 pt-5">
                    <div className="flex items-start gap-3 overflow-hidden flex-1 min-w-0">
                        {/* Status dot + Project initial */}
                        <div className={cn(
                            "relative flex items-center justify-center w-10 h-10 rounded-xl text-sm font-bold shrink-0 transition-all duration-300",
                            "shadow-sm border",
                            isCurrent
                                ? "bg-primary/10 text-primary border-primary/20"
                                : "bg-muted text-muted-foreground border-border/30"
                        )}>
                            {project.name.charAt(0).toUpperCase()}
                            {/* Live dot */}
                            <div className={cn(
                                "absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card transition-colors",
                                isCurrent ? "bg-emerald-500" : "bg-muted-foreground/40"
                            )} />
                        </div>

                        <div className="min-w-0 flex flex-col gap-1">
                            <h3 className={cn(
                                "font-semibold text-base leading-tight truncate transition-colors",
                                isCurrent
                                    ? "text-foreground group-hover:text-primary"
                                    : "text-muted-foreground group-hover:text-foreground"
                            )}>
                                {project.name}
                            </h3>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {/* Status badge */}
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        "text-[10px] px-1.5 py-0 h-[18px] font-medium border transition-colors cursor-default",
                                        isCurrent
                                            ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/5"
                                            : "text-muted-foreground border-border bg-muted/30"
                                    )}
                                >
                                    <Circle className={cn(
                                        "w-1.5 h-1.5 mr-1 fill-current",
                                        isCurrent ? "text-emerald-500" : "text-muted-foreground/50"
                                    )} />
                                    {isCurrent ? 'Current' : 'Past'}
                                </Badge>

                                {/* Link count */}
                                <span className="text-[10px] text-muted-foreground">
                                    · {manualLinks.length} {manualLinks.length === 1 ? 'link' : 'links'}
                                </span>

                                <ChecklistProgressBadge projectId={project.id} className="ml-0.5" />
                            </div>
                        </div>
                    </div>

                    {/* Dropdown menu */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground/50 hover:text-foreground -mr-1 mt-0.5 shrink-0"
                                aria-label={`Actions for ${project.name}`}
                            >
                                <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            {/* Status toggle */}
                            <DropdownMenuItem onClick={handleToggleStatus}>
                                {isCurrent ? (
                                    <>
                                        <Archive className="mr-2 h-4 w-4" />
                                        Mark as Past
                                    </>
                                ) : (
                                    <>
                                        <Circle className="mr-2 h-4 w-4 fill-emerald-500 text-emerald-500" />
                                        Mark as Current
                                    </>
                                )}
                            </DropdownMenuItem>

                            {/* Tag sub-menu */}
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                    <Tag className="mr-2 h-4 w-4" />
                                    Tags
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                    {ALL_TAGS.map(tag => (
                                        <DropdownMenuCheckboxItem
                                            key={tag}
                                            checked={tags.includes(tag)}
                                            onCheckedChange={() => handleToggleTag(tag)}
                                        >
                                            <span className={cn(
                                                "inline-block w-2 h-2 rounded-full mr-1.5",
                                                TAG_COLORS[tag].bg.replace('/10', ''),
                                            )} style={{ backgroundColor: `hsl(var(--${tag === 'retainer' ? 'primary' : 'muted-foreground'}))` }} />
                                            {PROJECT_TAG_LABELS[tag]}
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                                onClick={() => setIsDeleteOpen(true)}
                                className="text-destructive focus:text-destructive"
                            >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete Project
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {/* Tag pills */}
                {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 px-4 pb-1">
                        {tags.map(tag => {
                            const colors = TAG_COLORS[tag];
                            return (
                                <Badge
                                    key={tag}
                                    variant="outline"
                                    className={cn(
                                        "text-[10px] px-1.5 py-0 h-[18px] font-medium border rounded-full",
                                        colors.bg, colors.text, colors.border
                                    )}
                                >
                                    {PROJECT_TAG_LABELS[tag]}
                                </Badge>
                            );
                        })}
                    </div>
                )}

                {/* Content — Links */}
                <div className="flex-1 px-3 py-2 space-y-0.5">
                    {manualLinks.length > 0 ? (
                        <>
                            {displayLinks.map((link) => (
                                <CardLinkItem
                                    key={link.id}
                                    link={link}
                                    isEditing={editingLinkId === link.id}
                                    onStartEdit={() => setEditingLinkId(link.id)}
                                    onCancelEdit={() => setEditingLinkId(null)}
                                    onSave={(title, url) => handleEditLink(link.id, title, url)}
                                    onDelete={() => handleDeleteLink(link.id)}
                                    onOpen={() => handleOpenLink(link.url)}
                                />
                            ))}
                            {remainingCount > 0 && (
                                <div className="pt-1 pl-2">
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-muted/50 text-[10px] font-medium text-muted-foreground">
                                        +{remainingCount} more
                                    </span>
                                </div>
                            )}
                            <div className="pt-1.5 px-1">
                                <AddLinkDialog
                                    onAddLink={handleAddLink}
                                    trigger={
                                        <Button variant="ghost" size="sm" className="w-full h-7 text-[10px] gap-1.5 text-muted-foreground hover:text-primary justify-start px-2">
                                            <div className="flex items-center justify-center w-4 h-4 rounded-full border border-current opacity-60">
                                                <Plus className="w-2.5 h-2.5" />
                                            </div>
                                            Add link
                                        </Button>
                                    }
                                />
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-20 text-center border-2 border-dashed border-muted rounded-lg bg-muted/5 mx-1">
                            <p className="text-xs text-muted-foreground mb-2">No links yet</p>
                            <AddLinkDialog
                                onAddLink={handleAddLink}
                                trigger={
                                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                                        <Plus className="w-3.5 h-3.5" />
                                        Add Link
                                    </Button>
                                }
                            />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 pt-2 mt-auto">
                    <Link href={`/modules/project-links/${project.id}`} className="block">
                        <Button
                            variant="default"
                            size="sm"
                            className={cn(
                                "w-full h-8 text-xs justify-center group/btn shadow-sm hover:shadow transition-all",
                                isCurrent
                                    ? "bg-primary/90 hover:bg-primary"
                                    : "bg-muted hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Open Project
                            <ChevronRight className="ml-1.5 h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-1" />
                        </Button>
                    </Link>
                </div>
            </Card>

            <ConfirmDialog
                open={isDeleteOpen}
                onOpenChange={setIsDeleteOpen}
                title="Delete Project?"
                description={`Are you sure you want to delete "${project.name}"? All links will be permanently removed.`}
                confirmText="Delete"
                onConfirm={handleDelete}
                variant="destructive"
            />
        </>
    );
}

interface CardLinkItemProps {
    link: ProjectLink;
    isEditing: boolean;
    onStartEdit: () => void;
    onCancelEdit: () => void;
    onSave: (title: string, url: string) => Promise<void>;
    onDelete: () => void;
    onOpen: () => void;
}

function CardLinkItem({ link, isEditing, onStartEdit, onCancelEdit, onSave, onDelete, onOpen }: CardLinkItemProps) {
    const [title, setTitle] = React.useState(link.title);
    const [url, setUrl] = React.useState(link.url);
    const [isSaving, setIsSaving] = React.useState(false);

    React.useEffect(() => {
        setTitle(link.title);
        setUrl(link.url);
    }, [link]);

    const handleSave = async () => {
        setIsSaving(true);
        await onSave(title, url);
        setIsSaving(false);
    };

    if (isEditing) {
        return (
            <div className="p-2 bg-muted/40 rounded-lg space-y-1.5 border border-border/50 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Link title"
                    className="w-full px-2 py-1 text-xs bg-background/50 border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                    autoFocus
                />
                <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-2 py-1 text-[10px] bg-background/50 border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground"
                />
                <div className="flex gap-2 pt-0.5">
                    <Button size="sm" onClick={handleSave} disabled={isSaving} className="h-6 text-[10px] px-2">
                        {isSaving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={onCancelEdit} className="h-6 text-[10px] px-2">
                        Cancel
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div
            className="group/item relative flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/50 transition-all duration-200 cursor-pointer"
            onClick={onOpen}
            role="link"
            tabIndex={0}
            aria-label={`Open ${link.title}`}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
        >
            {/* Favicon */}
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-background/80 border shadow-sm shrink-0 group-hover/item:border-primary/20 transition-colors">
                {link.url ? (
                    <img
                        src={`https://www.google.com/s2/favicons?domain=${link.url}&sz=32`}
                        alt=""
                        className="w-3.5 h-3.5 opacity-80"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                    />
                ) : null}
                <LinkIcon className={`w-3.5 h-3.5 text-muted-foreground/70 ${link.url ? 'hidden' : ''}`} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pr-6">
                <div className="text-sm font-medium truncate text-foreground/90 group-hover/item:text-primary transition-colors leading-none mb-0.5">
                    {link.title}
                </div>
                <div className="text-[10px] text-muted-foreground/60 truncate group-hover/item:text-muted-foreground transition-colors leading-none">
                    {(() => {
                        try {
                            return new URL(link.url).hostname.replace('www.', '');
                        } catch {
                            return link.url;
                        }
                    })()}
                </div>
            </div>

            {/* Hover Actions */}
            <div className="absolute right-1 opacity-0 group-hover/item:opacity-100 transition-all duration-200 flex items-center bg-background/90 backdrop-blur-sm rounded-md shadow-sm border px-0.5">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    aria-label={`Edit ${link.title}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onStartEdit();
                    }}
                >
                    <Edit className="h-3 w-3" />
                </Button>
                <div className="w-[1px] h-2.5 bg-border mx-0.5" />
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${link.title}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                >
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>
        </div>
    );
}
