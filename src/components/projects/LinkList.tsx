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
  limit?: number;
}

export function LinkList({ projectId, links, limit }: LinkListProps) {
  const [sortedLinks, setSortedLinks] = useState<ProjectLink[]>([]);
  const [filter, setFilter] = useState('');
  const { execute: executeDragEnd } = useAsyncOperation();

  useEffect(() => {
    const validLinks = links
      .map((link, idx) => link.id ? link : { ...link, id: `temp_id_${idx}` })
      .sort((a, b) => a.order - b.order);
    setSortedLinks(validLinks);
  }, [links]);

  const filteredLinks = sortedLinks.filter(link =>
    link.title.toLowerCase().includes(filter.toLowerCase()) ||
    link.url.toLowerCase().includes(filter.toLowerCase())
  );

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
      <div className="text-center py-6 text-sm text-muted-foreground">
        No links yet. Add one to get started.
      </div>
    );
  }

  // If limiting, show plain list (no drag)
  if (limit && sortedLinks.length > 0) {
    const displayLinks = sortedLinks.slice(0, limit);
    const remaining = sortedLinks.length - limit;

    return (
      <div className="space-y-1">
        {displayLinks.map((link) => (
          <LinkItem
            key={link.id}
            link={link}
            onEdit={handleEdit}
            onDelete={handleDelete}
            compact // NEW PROP for compact view
          />
        ))}
        {remaining > 0 && (
          <div className="pt-2 text-center">
            <a
              href={`/modules/project-links/${projectId}`}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
            >
              View {remaining} more links
            </a>
          </div>
        )}
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
        items={filteredLinks.map(link => link.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-4">
          {links.length > 5 && (
            <div className="relative">
              <input
                type="text"
                placeholder="Filter links..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-transparent border rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-input placeholder:text-muted-foreground"
              />
            </div>
          )}
          <div className="space-y-2">
            {filteredLinks.map((link) => (
              <LinkItem
                key={link.id}
                link={link}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
            {filteredLinks.length === 0 && filter && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No links match "{filter}"
              </div>
            )}
          </div>
        </div>
      </SortableContext>
    </DndContext>
  );
} 