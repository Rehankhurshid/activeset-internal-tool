'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Edit, Link as LinkIcon, Trash2 } from 'lucide-react';
import type { ProjectLink } from '@/types';
import { cn } from '@/lib/utils';

interface CardLinkItemProps {
    link: ProjectLink;
    isEditing: boolean;
    onStartEdit: () => void;
    onCancelEdit: () => void;
    onSave: (title: string, url: string) => Promise<void>;
    onDelete: () => void;
    onOpen: () => void;
}

export function CardLinkItem({ link, isEditing, onStartEdit, onCancelEdit, onSave, onDelete, onOpen }: CardLinkItemProps) {
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
            className="group/item relative flex min-h-9 items-center gap-2.5 rounded-lg p-2 hover:bg-muted/50 transition-colors cursor-pointer"
            onClick={onOpen}
            role="link"
            tabIndex={0}
            aria-label={`Open ${link.title}`}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
        >
            {link.url ? (
                <img
                    src={`https://www.google.com/s2/favicons?domain=${link.url}&sz=32`}
                    alt=""
                    className="w-3.5 h-3.5 shrink-0 opacity-80"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                />
            ) : null}
            <LinkIcon className={cn('w-3.5 h-3.5 shrink-0 text-muted-foreground/70', link.url && 'hidden')} />

            {/* Content */}
            <div className="flex-1 min-w-0 pr-16 sm:pr-6">
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

            {/* Hover actions — ghost buttons only, opacity fade, no container chrome */}
            <div className="absolute right-1 flex items-center gap-0.5 opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover/item:opacity-100">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground sm:h-6 sm:w-6"
                    aria-label={`Edit ${link.title}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onStartEdit();
                    }}
                >
                    <Edit className="h-3 w-3" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive sm:h-6 sm:w-6"
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
