'use client';

import { useState, useEffect, useCallback } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { projectsService } from '@/services/database';
import { ProjectLink } from '@/types';
import { LinkItem } from './LinkItem';
import { useAsyncOperation } from '@/hooks/useAsyncOperation';

interface LinkListProps {
  projectId: string;
  links: ProjectLink[];
}


export function LinkList({ projectId, links }: LinkListProps) {
  const [sortedLinks, setSortedLinks] = useState<ProjectLink[]>([]);
  const { execute: executeDragEnd } = useAsyncOperation();

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

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = sortedLinks.findIndex((link) => link.id === active.id);
      const newIndex = sortedLinks.findIndex((link) => link.id === over?.id);

      if (oldIndex === -1 || newIndex === -1) return;

      const newLinks = arrayMove(sortedLinks, oldIndex, newIndex);
      const updatedLinks = newLinks.map((link, index) => ({ ...link, order: index }));

      // Optimistically update UI
      setSortedLinks(updatedLinks);

      // Update database
      await executeDragEnd(() => projectsService.updateProjectLinks(projectId, updatedLinks));
    }
  }, [sortedLinks, projectId, executeDragEnd]);

  const handleEdit = useCallback(async (linkId: string, title: string, url: string) => {
    await projectsService.updateLink(projectId, linkId, { title, url });
  }, [projectId]);

  const handleDelete = useCallback(async (linkId: string) => {
    await projectsService.deleteLink(projectId, linkId);
  }, [projectId]);

  if (links.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        No links yet. Add one to get started.
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sortedLinks.map(link => link.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {sortedLinks.map((link) => (
            <LinkItem
              key={link.id}
              link={link}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
} 