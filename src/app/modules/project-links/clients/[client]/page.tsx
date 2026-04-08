'use client';

import { use } from 'react';
import { ClientTimelineScreen } from '@/modules/timeline';

interface PageProps {
    params: Promise<{ client: string }>;
}

export default function ClientTimelinePage({ params }: PageProps) {
    const { client } = use(params);
    const decoded = decodeURIComponent(client);
    return <ClientTimelineScreen client={decoded} />;
}
