'use client';

import { useState, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { GripVertical, Edit, Trash2, Eye, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { projectsService } from '@/services/database';
import { ProjectLink } from '@/types';

interface LinkListProps {
  projectId: string;
  links: ProjectLink[];
}

interface SortableLinkItemProps {
  link: ProjectLink;
  onEdit: (linkId: string, title:string, url: string) => void;
  onDelete: (linkId: string) => void;
}

function SortableLinkItem({ link, onEdit, onDelete }: SortableLinkItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(link.title);
  const [url, setUrl] = useState(link.url);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: link.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleSave = () => {
    onEdit(link.id, title, url);
    setIsEditing(false);
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
      <div className="p-2 space-y-2 border rounded-lg bg-muted/50">
        <Input 
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Link title"
        />
        <Input 
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-2 rounded-lg border bg-card ${isDragging ? 'shadow-lg' : 'shadow-sm'}`}
    >
      <button {...attributes} {...listeners} className="cursor-grab p-1 text-muted-foreground hover:text-foreground">
        <GripVertical className="h-5 w-5" />
      </button>

      <div className="flex-1 min-w-0">
         <a href={link.url} onClick={handleLinkClick} className="group block">
          <div className="font-medium text-sm truncate group-hover:text-primary">{link.title}</div>
          {link.url && <div className="text-xs text-muted-foreground truncate">{link.url}</div>}
        </a>
      </div>

      <div className="flex gap-1">
         {link.url && (
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setIsModalOpen(true); }}>
                <Eye className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span>{link.title}</span>
                  <Button onClick={handleOpenLink} size="sm" variant="outline" className="gap-2">
                    <ExternalLink className="h-4 w-4" /> Open in new tab
                  </Button>
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 min-h-0">
                <iframe src={link.url} className="w-full h-full border rounded-md" title={link.title} />
              </div>
            </DialogContent>
          </Dialog>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsEditing(true)}>
          <Edit className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onDelete(link.id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function LinkList({ projectId, links }: LinkListProps) {
  const [sortedLinks, setSortedLinks] = useState<ProjectLink[]>([]);

  useEffect(() => {
    const validLinks = links
      .map((link, idx) => link.id ? link : { ...link, id: `temp_id_${idx}` })
      .sort((a, b) => a.order - b.order);
    setSortedLinks(validLinks);
  }, [links]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = sortedLinks.findIndex((link) => link.id === active.id);
      const newIndex = sortedLinks.findIndex((link) => link.id === over?.id);
      const newLinks = arrayMove(sortedLinks, oldIndex, newIndex);
      const updatedLinks = newLinks.map((link, index) => ({ ...link, order: index }));
      setSortedLinks(updatedLinks);
      await projectsService.updateProjectLinks(projectId, updatedLinks);
    }
  };

  const handleEdit = async (linkId: string, title: string, url: string) => {
    await projectsService.updateLink(projectId, linkId, { title, url });
  };

  const handleDelete = async (linkId: string) => {
    if (confirm('Are you sure you want to delete this link?')) {
      await projectsService.deleteLink(projectId, linkId);
    }
  };

  if (links.length === 0) {
    return (
       <div className="text-center py-8 text-sm text-muted-foreground">
          No links yet. Add one to get started.
       </div>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sortedLinks.map(link => link.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {sortedLinks.map((link) => (
            <SortableLinkItem key={link.id} link={link} onEdit={handleEdit} onDelete={handleDelete} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
} 