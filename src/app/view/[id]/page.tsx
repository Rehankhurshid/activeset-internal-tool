'use client';

import { useState, useEffect, use } from 'react';
import { Proposal } from '@/app/modules/proposal/types/Proposal';
import { proposalService } from '@/app/modules/proposal/services/ProposalService';
import ProposalViewer from '@/app/modules/proposal/components/ProposalViewer';
import LoadingScreen from '@/app/modules/proposal/components/LoadingScreen';
import { Toaster, toast } from 'sonner';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function PublicProposalView({ params }: PageProps) {
    // Unwrap params using React.use()
    const { id } = use(params);

    const [proposal, setProposal] = useState<Proposal | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadProposal = async () => {
            try {
                if (!id) return;
                const data = await proposalService.getPublicProposal(id);
                setProposal(data);
            } catch (err) {
                console.error('Error loading proposal:', err);
                setError('Proposal not found or access denied.');
                toast.error('Failed to load proposal');
            } finally {
                setLoading(false);
            }
        };

        loadProposal();
    }, [id]);

    if (loading) {
        return <LoadingScreen message="Loading proposal..." />;
    }

    if (error || !proposal) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <div className="text-center max-w-md">
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Unavailable</h1>
                    <p className="text-gray-600">{error || 'This proposal could not be found.'}</p>
                </div>
                <Toaster />
            </div>
        );
    }

    return (
        <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link href="https://fonts.googleapis.com/css2?family=Funnel+Display:wght@300..800&family=Funnel+Sans:ital,wght@0,300..800;1,300..800&display=swap" rel="stylesheet" />
            <ProposalViewer
                proposal={proposal}
                onBack={() => { }} // No back action for public view
                isPublic={true}
            />
            <Toaster />
        </>
    );
}
