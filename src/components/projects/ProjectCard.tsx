'use client';

import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/alert-dialog-confirm';
import {
    Trash2,
    ChevronDown,
    ChevronUp,
    MoreVertical,
    Plus,
    Circle,
    CircleDot,
    Archive,
    Tag,
    Check,
    CirclePause,
    SlidersHorizontal,
    DollarSign,
    Activity,
} from 'lucide-react';
import { Project, ProjectStatus, ProjectTag, PROJECT_TAG_LABELS, PROJECT_STATUS_LABELS } from '@/types';
import { projectsService } from '@/services/database';
import { cn } from '@/lib/utils';
import { PROJECT_TAG_TONES, PROJECT_STATUS_TONES } from '@/lib/ui-tones';
import { ProjectLogoDialog } from './ProjectLogoDialog';
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
import { ProjectReviewToggle } from './ProjectReviewToggle';
import { ProjectPeoplePicker } from './ProjectPeoplePicker';
import { CardLinkItem } from './CardLinkItem';

const ALL_TAGS: ProjectTag[] = ['retainer', 'one_time', 'subscription', 'maintenance', 'consulting'];

const STATUS_OPTIONS: { value: ProjectStatus; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
    { value: 'current', icon: Activity, description: 'Work in progress' },
    { value: 'paused', icon: CirclePause, description: 'Quiet maintenance' },
    { value: 'closed', icon: Archive, description: 'Done — payment pending' },
    { value: 'paid', icon: DollarSign, description: 'Payment received' },
];

function detectWebsiteUrl(project: Project): string | undefined {
    const custom = project.webflowConfig?.customDomain;
    if (custom) return custom.startsWith('http') ? custom : `https://${custom}`;
    const links = project.links || [];
    const live = links.find(l => /live|production|website/i.test(l.title) && !/staging|dev/i.test(l.title));
    if (live?.url) return live.url;
    const firstHttp = links.find(l => /^https?:\/\//i.test(l.url));
    return firstHttp?.url;
}

interface ProjectCardProps {
    project: Project;
    onDelete: (projectId: string) => void;
}

function ProjectCardComponent({ project, onDelete }: ProjectCardProps) {
    const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
    const [editingLinkId, setEditingLinkId] = React.useState<string | null>(null);
    const [isExpanded, setIsExpanded] = React.useState(false);

    const status: ProjectStatus = project.status || 'current';
    const tags: ProjectTag[] = project.tags || [];
    const isCurrent = status === 'current';
    const statusStyles = PROJECT_STATUS_TONES[status];
    const disableAuditBadge = project.disableAuditBadge === true;
    const disableDropdown = project.disableDropdown === true;
    const spellcheckEnabled = project.enableSpellcheck !== false;
    const assigneeEmails = project.assigneeEmails ?? [];

    const handleDelete = async () => {
        try {
            await projectsService.deleteProject(project.id);
            onDelete(project.id);
        } finally {
            setIsDeleteOpen(false);
        }
    };

    const handleSetStatus = async (newStatus: ProjectStatus) => {
        if (newStatus === status) return;
        await projectsService.updateProjectStatus(project.id, newStatus);
    };

    const handleToggleTag = async (tag: ProjectTag) => {
        const newTags = tags.includes(tag)
            ? tags.filter(t => t !== tag)
            : [...tags, tag];
        await projectsService.updateProjectTags(project.id, newTags);
    };

    const handleToggleAuditBadge = async () => {
        await projectsService.updateProjectWidgetFlags(project.id, {
            disableAuditBadge: !disableAuditBadge,
        });
    };

    const handleToggleDropdown = async () => {
        await projectsService.updateProjectWidgetFlags(project.id, {
            disableDropdown: !disableDropdown,
        });
    };

    const handleSetSpellcheck = async (checked: boolean) => {
        await projectsService.updateProjectWidgetFlags(project.id, {
            enableSpellcheck: checked,
        });
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
    const manualLinks = React.useMemo(
        () => project.links?.filter(l => l.source !== 'auto') || [],
        [project.links],
    );
    const websiteUrl = React.useMemo(() => detectWebsiteUrl(project), [project]);
    const displayLimit = 3;
    const displayLinks = isExpanded ? manualLinks : manualLinks.slice(0, displayLimit);
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

    const visibleTags = tags.slice(0, 2);
    const hiddenTagCount = tags.length - visibleTags.length;

    return (
        <>
            <Card
                role="article"
                aria-label={`Project: ${project.name}`}
                className={cn(
                    "group relative flex h-full flex-col overflow-hidden border transition-colors",
                    "hover:border-foreground/20",
                    "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                    isCurrent
                        ? "border-border/60 bg-card"
                        : "border-border/30 bg-card/60 opacity-75 hover:opacity-100"
                )}
            >
                {/* Row 1 — identity */}
                <div className="flex items-start justify-between gap-2 p-3 pb-2 sm:p-4 sm:pb-2">
                    <Link
                        href={`/modules/project-links/${project.id}`}
                        aria-label={`Open ${project.name}`}
                        className="group/header flex min-w-0 flex-1 items-start gap-3 overflow-hidden"
                    >
                        <ProjectLogoDialog
                            projectId={project.id}
                            currentLogoUrl={project.logoUrl}
                            autoFetchUrl={websiteUrl}
                            trigger={
                                <button
                                    type="button"
                                    aria-label={`Set logo for ${project.name}`}
                                    onClick={(e) => {
                                        // Nested inside the header Link — stop this click from also
                                        // triggering navigation while the logo popover still opens
                                        // (Radix composes its own trigger onClick after this one).
                                        e.preventDefault();
                                        e.stopPropagation();
                                    }}
                                    className={cn(
                                        "flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl text-sm font-bold transition-colors sm:h-10 sm:w-10",
                                        "shadow-sm border cursor-pointer hover:ring-2 hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        isCurrent
                                            ? "bg-primary/10 text-primary border-primary/20"
                                            : "bg-muted text-muted-foreground border-border/30"
                                    )}
                                >
                                    {project.logoUrl ? (
                                        <img
                                            src={project.logoUrl}
                                            alt=""
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    ) : (
                                        project.name.charAt(0).toUpperCase()
                                    )}
                                </button>
                            }
                        />

                        <div className="min-w-0 flex flex-col gap-1">
                            <h3 className={cn(
                                "font-semibold text-base leading-tight truncate transition-colors",
                                isCurrent
                                    ? "text-foreground group-hover/header:text-primary"
                                    : "text-muted-foreground group-hover/header:text-foreground"
                            )}>
                                {project.name}
                            </h3>
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Circle className={cn("h-2 w-2 fill-current", statusStyles.dot)} />
                                {PROJECT_STATUS_LABELS[status]}
                            </span>
                        </div>
                    </Link>

                    {/* Dropdown menu */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 text-muted-foreground/50 hover:text-foreground -mr-1 mt-0.5 shrink-0 sm:h-7 sm:w-7"
                                aria-label={`Actions for ${project.name}`}
                            >
                                <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                            {isCurrent && tags.length > 0 && (
                                <>
                                    <DropdownMenuItem asChild>
                                        <ProjectReviewToggle project={project} variant="button" className="w-full justify-start" />
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                </>
                            )}

                            {/* Status sub-menu */}
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                    <CircleDot className={cn("mr-2 h-4 w-4", statusStyles.dot)} />
                                    Status: {PROJECT_STATUS_LABELS[status]}
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                    {STATUS_OPTIONS.map(({ value, icon: Icon, description }) => {
                                        const styles = PROJECT_STATUS_TONES[value];
                                        return (
                                            <DropdownMenuItem
                                                key={value}
                                                onClick={() => handleSetStatus(value)}
                                                className="flex items-start gap-2"
                                            >
                                                <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", styles.dot)} />
                                                <div className="flex flex-col">
                                                    <span className="flex items-center gap-1.5">
                                                        {PROJECT_STATUS_LABELS[value]}
                                                        {value === status && (
                                                            <Check className="h-3 w-3 text-muted-foreground" />
                                                        )}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {description}
                                                    </span>
                                                </div>
                                            </DropdownMenuItem>
                                        );
                                    })}
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>

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
                                                PROJECT_TAG_TONES[tag].bg.replace('/10', ''),
                                            )} style={{ backgroundColor: `hsl(var(--${tag === 'retainer' ? 'primary' : 'muted-foreground'}))` }} />
                                            {PROJECT_TAG_LABELS[tag]}
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>

                            {/* Embedded widget settings sub-menu */}
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                                    Widget Settings
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                    <DropdownMenuCheckboxItem
                                        checked={!disableAuditBadge}
                                        onCheckedChange={handleToggleAuditBadge}
                                    >
                                        Show audit badge
                                    </DropdownMenuCheckboxItem>
                                    <DropdownMenuCheckboxItem
                                        checked={!disableDropdown}
                                        onCheckedChange={handleToggleDropdown}
                                    >
                                        Show links dropdown
                                    </DropdownMenuCheckboxItem>
                                    <DropdownMenuCheckboxItem
                                        checked={spellcheckEnabled}
                                        onCheckedChange={(checked) => handleSetSpellcheck(checked === true)}
                                    >
                                        Run spell checker
                                    </DropdownMenuCheckboxItem>
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

                {/* Row 2 — links */}
                <div className="flex-1 px-2.5 py-1.5 space-y-0.5 sm:px-3 sm:py-2">
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
                                    <button
                                        type="button"
                                        onClick={() => setIsExpanded(v => !v)}
                                        aria-expanded={isExpanded}
                                        aria-label={isExpanded ? 'Show fewer links' : `Show ${remainingCount} more links`}
                                        className="inline-flex min-h-8 items-center gap-1 rounded-md bg-muted/50 px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0 sm:px-1.5 sm:py-0.5"
                                    >
                                        {isExpanded ? (
                                            <>
                                                <ChevronUp className="w-2.5 h-2.5" />
                                                Show less
                                            </>
                                        ) : (
                                            <>
                                                <ChevronDown className="w-2.5 h-2.5" />
                                                +{remainingCount} more
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                            <div className="pt-1.5 px-1">
                                <AddLinkDialog
                                    onAddLink={handleAddLink}
                                    trigger={
                                        <Button variant="ghost" size="sm" className="w-full h-9 sm:h-7 text-xs sm:text-[10px] gap-1.5 text-muted-foreground hover:text-primary justify-start px-2">
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
                                    <Button variant="outline" size="sm" className="h-9 sm:h-7 text-xs gap-1.5">
                                        <Plus className="w-3.5 h-3.5" />
                                        Add Link
                                    </Button>
                                }
                            />
                        </div>
                    )}
                </div>

                {/* Row 3 — footer: tags + people */}
                <div className="flex items-center justify-between gap-2 p-3 pt-2 mt-auto">
                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                        {visibleTags.map(tag => {
                            const tone = PROJECT_TAG_TONES[tag];
                            return (
                                <Badge
                                    key={tag}
                                    variant="outline"
                                    className={cn(
                                        "text-[10px] px-1.5 py-0 h-[18px] font-medium border rounded-full",
                                        tone.bg, tone.text, tone.border
                                    )}
                                >
                                    {PROJECT_TAG_LABELS[tag]}
                                </Badge>
                            );
                        })}
                        {hiddenTagCount > 0 && (
                            <span className="text-[10px] font-medium text-muted-foreground">
                                +{hiddenTagCount}
                            </span>
                        )}
                    </div>
                    <ProjectPeoplePicker
                        projectId={project.id}
                        projectName={project.name}
                        assigneeEmails={assigneeEmails}
                        reviewOwnerEmail={project.reviewOwnerEmail}
                        className="shrink-0"
                    />
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

// Memoized: the dashboard renders 47 of these and re-renders on every keystroke
// in the search box. onDelete is stabilized with useCallback at the call site.
export const ProjectCard = React.memo(ProjectCardComponent);
