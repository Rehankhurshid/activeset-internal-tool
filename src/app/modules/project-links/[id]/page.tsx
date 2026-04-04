'use client';

import { ProjectDetailScreen } from '@/modules/project-links';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ProjectDetailPage({ params }: PageProps) {
  return <ProjectDetailScreen params={params} />;
}

