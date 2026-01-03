'use client';

import { Badge } from '@/components/ui/badge';
import { SEOHealthScore } from '@/types/webflow';
import { cn } from '@/lib/utils';

interface WebflowSEOHealthBadgeProps {
  health: SEOHealthScore;
  showScore?: boolean;
  size?: 'sm' | 'default';
}

export function WebflowSEOHealthBadge({
  health,
  showScore = true,
  size = 'default',
}: WebflowSEOHealthBadgeProps) {
  const statusConfig = {
    good: {
      variant: 'default' as const,
      className: 'bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/20',
      label: 'Good',
    },
    warning: {
      variant: 'default' as const,
      className: 'bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20 border-yellow-500/20',
      label: 'Needs Work',
    },
    critical: {
      variant: 'default' as const,
      className: 'bg-red-500/10 text-red-600 hover:bg-red-500/20 border-red-500/20',
      label: 'Critical',
    },
  };

  const config = statusConfig[health.status];

  return (
    <Badge
      variant={config.variant}
      className={cn(
        config.className,
        size === 'sm' && 'text-xs px-1.5 py-0'
      )}
    >
      {showScore ? `${health.score}%` : config.label}
    </Badge>
  );
}
