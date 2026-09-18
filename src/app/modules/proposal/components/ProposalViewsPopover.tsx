'use client';

import type { ReactNode } from 'react';
import { ViewsPopover } from '@/components/views/ViewsPopover';

interface ProposalViewsPopoverProps {
    proposalId: string;
    viewCount: number;
    children: ReactNode;
}

/** Proposal flavour of the shared ViewsPopover (kept as a default export for ProposalCard). */
export default function ProposalViewsPopover({ proposalId, viewCount, children }: ProposalViewsPopoverProps) {
    return (
        <ViewsPopover
            endpoint={`/api/proposals/${encodeURIComponent(proposalId)}/views`}
            viewCount={viewCount}
            subtitle="Public share link · viewer identity not captured"
        >
            {children}
        </ViewsPopover>
    );
}
