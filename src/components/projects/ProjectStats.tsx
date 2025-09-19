'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Link as LinkIcon } from 'lucide-react';

interface ProjectStatsProps {
  linkCount: number;
  isLive?: boolean;
}

export const ProjectStats = React.memo(function ProjectStats({ linkCount, isLive = true }: ProjectStatsProps) {
  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="gap-1">
        <LinkIcon className="h-3 w-3" />
        {linkCount} {linkCount === 1 ? 'link' : 'links'}
      </Badge>
      {isLive && (
        <Badge variant="outline" className="gap-1">
          <div className="h-2 w-2 bg-green-500 rounded-full"></div>
          Live
        </Badge>
      )}
    </div>
  );
});