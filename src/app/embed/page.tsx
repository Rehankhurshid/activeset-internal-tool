'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { WidgetEmbedded } from '@/widget/WidgetEmbedded';
import { WidgetConfig } from '@/types';

function EmbedContent() {
  const searchParams = useSearchParams();
  
  // Parse config from URL parameters
  const config: WidgetConfig = {
    projectId: searchParams.get('projectId') || undefined,
    theme: (searchParams.get('theme') as 'dark' | 'light') || 'dark',
    allowReordering: searchParams.get('allowReordering') !== 'false',
    showModal: searchParams.get('showModal') !== 'false',
  };

  // Parse initial links if provided
  const initialLinksParam = searchParams.get('initialLinks');
  if (initialLinksParam) {
    try {
      config.initialLinks = JSON.parse(decodeURIComponent(initialLinksParam));
    } catch (error) {
      console.error('Failed to parse initialLinks:', error);
    }
  }

  return (
    <div className="p-4">
      <WidgetEmbedded config={config} />
    </div>
  );
}

export default function EmbedPage() {
  return (
    <Suspense fallback={
      <div className="p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
      </div>
    }>
      <EmbedContent />
    </Suspense>
  );
} 