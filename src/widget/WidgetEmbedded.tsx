'use client';

import { WidgetConfig } from '@/types';

interface WidgetEmbeddedProps {
  config?: WidgetConfig;
}

export function WidgetEmbedded({ config }: WidgetEmbeddedProps) {
  return (
    <div className="project-links-widget text-center p-4 text-sm text-gray-500">
      Widget is currently disabled.
    </div>
  );
}