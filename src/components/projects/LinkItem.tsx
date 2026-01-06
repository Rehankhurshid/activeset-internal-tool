'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Edit, Trash2, Eye, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ProjectLink } from '@/types';
import { ConfirmDialog } from "@/components/ui/alert-dialog-confirm";
import { InlineEdit } from '@/components/ui/inline-edit';
import { useAsyncOperation } from '@/hooks/useAsyncOperation';
import { useMobile } from '@/hooks/useMobile';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { AuditDetailDialog } from './AuditDetailDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, SquareArrowOutUpRight } from 'lucide-react';

interface LinkItemProps {
  link: ProjectLink;
  onEdit: (linkId: string, title: string, url: string) => Promise<void>;
  onDelete: (linkId: string) => Promise<void>;
  compact?: boolean;
}

export function LinkItem({ link, onEdit, onDelete, compact }: LinkItemProps) {
  const isMobile = useMobile();
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [isReportOpen, setIsReportOpen] = React.useState(false);


  const { isLoading: isDeleting, execute: executeDelete } = useAsyncOperation();
  const { isLoading: isUpdating, execute: executeUpdate } = useAsyncOperation();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: link.id,
    disabled: compact // Disable sorting logic if compact
  });

  const style = transform ? {
    transform: CSS.Transform.toString(transform),
    transition,
  } : undefined;

  const handleSaveTitle = async (title: string) => {
    await executeUpdate(() => onEdit(link.id, title, link.url));
  };
  // ... (handlers same)

  const handleSaveUrl = async (url: string) => {
    await executeUpdate(() => onEdit(link.id, link.title, url));
  };

  const handleDelete = async () => {
    await executeDelete(() => onDelete(link.id));
  };

  const handleOpenLink = () => {
    if (link.url) window.open(link.url, '_blank');
  };

  const handleLinkClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isMobile) {
      handleOpenLink();
    } else {
      setIsReportOpen(true);
    }
  };

  if (isEditing) {
    return (
      <div className={cn("space-y-3 border rounded-lg bg-muted/50", compact ? "p-2 text-xs" : "p-4")}>
        <InlineEdit
          value={link.title}
          onSave={handleSaveTitle}
          placeholder="Link title"
          className="font-medium"
        />
        <InlineEdit
          value={link.url}
          onSave={handleSaveUrl}
          placeholder="https://..."
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setIsEditing(false)}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  // Compact View Structure
  if (compact) {
    return (
      <div
        className={cn(
          "group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors",
          isUpdating ? "opacity-50" : ""
        )}
      >
        <div className="flex-1 min-w-0">
          <a
            href={link.url}
            onClick={handleLinkClick}
            className="block cursor-pointer"
          >
            <div className="flex items-center gap-2">
              {link.url && (
                <img
                  src={`https://www.google.com/s2/favicons?domain=${link.url}&sz=32`}
                  alt=""
                  className="w-4 h-4 rounded-sm flex-shrink-0 opacity-70"
                  loading="lazy"
                  decoding="async"
                />
              )}
              <span className="font-medium text-sm truncate group-hover:text-foreground transition-colors">
                {link.title}
              </span>
            </div>
          </a>
        </div>

        {link.auditResult && (
          <div className="flex items-center flex-shrink-0">
            <div className={cn(
              "flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-medium border",
              link.auditResult.score >= 90 ? "bg-green-500/10 text-green-600 border-green-500/20" :
                link.auditResult.score >= 70 ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" :
                  "bg-red-500/10 text-red-600 border-red-500/20"
            )}
              title={`Score: ${link.auditResult.score}%`}
            >
              {link.auditResult.score}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <LinkActionsDropdown
            onEdit={() => setIsEditing(true)}
            onDelete={(e) => { e.stopPropagation(); setIsDeleteOpen(true); }}
            onPreview={(e) => { e.stopPropagation(); setIsModalOpen(true); }}
            onOpenExternal={(e) => { e.stopPropagation(); handleOpenLink(); }}
            hasUrl={!!link.url}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        relative flex items-center gap-3 p-3 rounded-lg border bg-card transition-all group
        ${isDragging ? 'shadow-lg opacity-90 z-20' : 'shadow-sm hover:shadow-md'}
        ${isUpdating ? 'opacity-50' : ''}
      `}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="touch-none cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        disabled={isUpdating || isDeleting}
      >
        <GripVertical className="h-5 w-5" />
      </button>

      {/* Link Content */}
      <div className="flex-1 min-w-0">
        <a
          href={link.url}
          onClick={handleLinkClick}
          className="block cursor-pointer"
        >
          <div className="flex items-center gap-2 mb-0.5">
            {link.url && (
              <img
                src={`https://www.google.com/s2/favicons?domain=${link.url}&sz=32`}
                alt=""
                className="w-4 h-4 rounded-sm flex-shrink-0 opacity-70"
                loading="lazy"
                decoding="async"
              />
            )}
            <div className="font-medium text-sm truncate group-hover:text-primary transition-colors">
              {link.title}
            </div>
          </div>
          {link.url && (
            <div className="text-xs text-muted-foreground truncate pl-6">
              {link.url}
            </div>
          )}
        </a>
      </div>

      {/* Audit Score Badge */}
      {link.auditResult && (
        <div className="flex items-center mr-2 flex-shrink-0 hidden sm:flex">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer transition-colors active:scale-95",
                  link.auditResult.score >= 90 ? "bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20" :
                    link.auditResult.score >= 70 ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 hover:bg-yellow-500/20" :
                      "bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/20"
                )}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsReportOpen(true);
                  }}
                >
                  <span className="relative flex h-2 w-2">
                    <span className={cn(
                      "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                      link.auditResult.score >= 90 ? "bg-green-400" :
                        link.auditResult.score >= 70 ? "bg-yellow-400" : "bg-red-400"
                    )}></span>
                    <span className={cn(
                      "relative inline-flex rounded-full h-2 w-2",
                      link.auditResult.score >= 90 ? "bg-green-500" :
                        link.auditResult.score >= 70 ? "bg-yellow-500" : "bg-red-500"
                    )}></span>
                  </span>
                  <span className="tabular-nums">{link.auditResult.score}%</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-1 p-1">
                  <p className="font-semibold text-xs">Last Scan: {new Date(link.auditResult.lastRun).toLocaleTimeString()}</p>
                  <p className="text-xs text-muted-foreground max-w-[200px]">{link.auditResult.summary || 'Click to see details'}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}

      {/* Mobile Audit Badge (Simplified) */}
      {link.auditResult && (
        <div className="flex sm:hidden items-center flex-shrink-0" onClick={() => setIsReportOpen(true)}>
          <div className={cn(
            "w-3 h-3 rounded-full border",
            link.auditResult.score >= 90 ? "bg-green-500 border-green-600" :
              link.auditResult.score >= 70 ? "bg-yellow-500 border-yellow-600" :
                "bg-red-500 border-red-600"
          )} />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <div className="hidden sm:flex items-center gap-1">
          {/* Desktop Actions */}
          {link.url && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenLink();
                }}
                title="Open in new tab"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsModalOpen(true);
                    }}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle className="flex items-center justify-between">
                      <span>{link.title}</span>
                      <Button
                        onClick={handleOpenLink}
                        size="sm"
                        variant="outline"
                        className="gap-2"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open in new tab
                      </Button>
                    </DialogTitle>
                  </DialogHeader>
                  <div className="flex-1 min-h-0">
                    <iframe
                      src={link.url}
                      className="w-full h-full border rounded-md"
                      title={link.title}
                    />
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsEditing(true)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              setIsDeleteOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Mobile Actions (Dropdown) */}
        <div className="sm:hidden">
          <LinkActionsDropdown
            onEdit={() => setIsEditing(true)}
            onDelete={(e) => { e.stopPropagation(); setIsDeleteOpen(true); }}
            onPreview={(e) => { e.stopPropagation(); setIsModalOpen(true); }}
            onOpenExternal={(e) => { e.stopPropagation(); handleOpenLink(); }}
            hasUrl={!!link.url}
          />
        </div>
      </div>

      <ConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Delete link?"
        description="Are you sure you want to delete this link? This action cannot be undone."
        confirmText="Delete"
        onConfirm={handleDelete}
        variant="destructive"
      />
      <AuditDetailDialog
        isOpen={isReportOpen}
        onOpenChange={setIsReportOpen}
        auditResult={link.auditResult}
        linkTitle={link.title}
        linkUrl={link.url}
      />
    </div>
  );
}

function LinkActionsDropdown({ onEdit, onDelete, onPreview, onOpenExternal, hasUrl }: {
  onEdit: () => void,
  onDelete: (e: any) => void,
  onPreview: (e: any) => void,
  onOpenExternal: (e: any) => void,
  hasUrl: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {hasUrl && (
          <>
            <DropdownMenuItem onClick={onOpenExternal}>
              <SquareArrowOutUpRight className="mr-2 h-4 w-4" /> Open Link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onPreview}>
              <Eye className="mr-2 h-4 w-4" /> Preview
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={onEdit}>
          <Edit className="mr-2 h-4 w-4" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}