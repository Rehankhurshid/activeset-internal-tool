'use client';

import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { GripVertical, ExternalLink, Edit, Trash2, Eye } from 'lucide-react';
import { ProjectLink } from '@/types';
import { projectsService } from '@/services/database';

interface LinkListProps {
  projectId: string;
  links: ProjectLink[];
}

interface SortableLinkItemProps {
  link: ProjectLink;
  projectId: string;
  onEdit: (linkId: string, title: string, url: string) => void;
  onDelete: (linkId: string) => void;
}

function SortableLinkItem({ link, onEdit, onDelete }: SortableLinkItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(link.title);
  const [url, setUrl] = useState(link.url);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: link.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleSave = () => {
    onEdit(link.id, title, url);
    setIsEditing(false);
  };

  const handleOpenLink = () => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleLinkClick = () => {
    if (isMobile) {
      handleOpenLink();
    } else {
      setIsModalOpen(true);
    }
  };

  if (isEditing) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="space-y-2 p-3 border border-dashed border-muted-foreground rounded-md"
      >
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Link title"
          className="text-sm"
        />
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="text-sm"
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave}>
            Save
          </Button>
          <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`sortable-item flex items-center gap-2 p-2 rounded-md border transition-all ${
        isDragging ? 'is-dragging' : 'hover:bg-muted/50'
      }`}
    >
      <button
        className="flex items-center justify-center w-6 h-6 text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex-1 min-w-0">
        <button
          onClick={handleLinkClick}
          className="text-left w-full hover:text-primary transition-colors"
        >
          <div className="font-medium text-sm truncate">{link.title}</div>
          {link.url && (
            <div className="text-xs text-muted-foreground truncate">{link.url}</div>
          )}
        </button>
      </div>

      {!isMobile && link.url && (
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <Eye className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>{link.title}</span>
                <div className="flex gap-2">
                  <Button onClick={handleOpenLink} size="sm" variant="outline">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in new tab
                  </Button>
                </div>
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-[60vh]">
              <iframe
                src={link.url}
                className="w-full h-full border rounded-md"
                title={link.title}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => setIsEditing(true)}
        >
          <Edit className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
          onClick={() => onDelete(link.id)}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export function LinkList({ projectId, links }: LinkListProps) {
  const [sortedLinks, setSortedLinks] = useState(links);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    // Ensure every link has a unique id to avoid React key warnings
    let modified = false;
    const fixedLinks = links.map((link, idx) => {
      if (!link.id) {
        modified = true;
        return {
          ...link,
          id: `link_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
        };
      }
      return link;
    });

    if (modified) {
      // Persist the fix to Firestore
      projectsService.updateProjectLinks(projectId, fixedLinks).catch(console.error);
    }

    setSortedLinks([...fixedLinks].sort((a, b) => a.order - b.order));
  }, [links, projectId]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = sortedLinks.findIndex((link) => link.id === active.id);
      const newIndex = sortedLinks.findIndex((link) => link.id === over?.id);

      const newLinks = arrayMove(sortedLinks, oldIndex, newIndex);
      const updatedLinks = newLinks.map((link, index) => ({
        ...link,
        order: index,
      }));

      setSortedLinks(updatedLinks);
      
      try {
        await projectsService.updateProjectLinks(projectId, updatedLinks);
      } catch (error) {
        console.error('Failed to update link order:', error);
        setSortedLinks(sortedLinks); // Revert on error
      }
    }
  };

  const handleEdit = async (linkId: string, title: string, url: string) => {
    try {
      await projectsService.updateLink(projectId, linkId, { title, url });
    } catch (error) {
      console.error('Failed to update link:', error);
    }
  };

  const handleDelete = async (linkId: string) => {
    if (confirm('Are you sure you want to delete this link?')) {
      try {
        await projectsService.deleteLink(projectId, linkId);
      } catch (error) {
        console.error('Failed to delete link:', error);
      }
    }
  };

  if (sortedLinks.length === 0) {
    return (
      <div className="text-center text-muted-foreground text-sm py-8">
        No links yet. Add some links to get started.
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortedLinks.map(link => link.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {sortedLinks.map((link) => (
            <SortableLinkItem
              key={link.id}
              link={link}
              projectId={projectId}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
} 