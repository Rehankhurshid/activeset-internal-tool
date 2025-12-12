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

interface LinkItemProps {
  link: ProjectLink;
  onEdit: (linkId: string, title: string, url: string) => Promise<void>;
  onDelete: (linkId: string) => Promise<void>;
}

export function LinkItem({ link, onEdit, onDelete }: LinkItemProps) {
  const isMobile = useMobile();
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);

  const { isLoading: isDeleting, execute: executeDelete } = useAsyncOperation();
  const { isLoading: isUpdating, execute: executeUpdate } = useAsyncOperation();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: link.id
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSaveTitle = async (title: string) => {
    await executeUpdate(() => onEdit(link.id, title, link.url));
  };

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
      setIsModalOpen(true);
    }
  };

  if (isEditing) {
    return (
      <div className="p-4 space-y-3 border rounded-lg bg-muted/50">
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        flex items-center gap-3 p-3 rounded-lg border bg-card transition-all
        ${isDragging ? 'shadow-lg opacity-90' : 'shadow-sm hover:shadow-md'}
        ${isUpdating ? 'opacity-50' : ''}
      `}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground transition-colors"
        disabled={isUpdating || isDeleting}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Link Content */}
      <div className="flex-1 min-w-0">
        <a
          href={link.url}
          onClick={handleLinkClick}
          className="group block cursor-pointer"
        >
          <div className="font-medium text-sm truncate group-hover:text-primary transition-colors">
            {link.title}
          </div>
          {link.url && (
            <div className="text-xs text-muted-foreground truncate mt-0.5">
              {link.url}
            </div>
          )}
        </a>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-1">
        {/* Preview Button */}
        {link.url && (
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
                disabled={isUpdating || isDeleting}
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
        )}

        {/* Edit Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setIsEditing(true)}
          disabled={isUpdating || isDeleting}
        >
          <Edit className="h-4 w-4" />
        </Button>

        {/* Delete Button */}
        {/* Delete Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            setIsDeleteOpen(true);
          }}
          disabled={isUpdating || isDeleting}
        >
          <Trash2 className="h-4 w-4" />
        </Button>

        <ConfirmDialog
          open={isDeleteOpen}
          onOpenChange={setIsDeleteOpen}
          title="Delete link?"
          description="Are you sure you want to delete this link? This action cannot be undone."
          confirmText="Delete"
          onConfirm={handleDelete}
          variant="destructive"
        />
      </div>
    </div>
  );
}