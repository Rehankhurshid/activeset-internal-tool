import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { doc as clientDoc, getDoc as getClientDoc } from 'firebase/firestore';
import { db as adminDb } from '@/lib/firebase-admin';
import { db as clientDb } from '@/lib/firebase';
import { Proposal } from '@/app/modules/proposal/types/Proposal';
import ProposalViewer from '@/app/modules/proposal/components/ProposalViewer';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const proposal = await getPublicProposalCached(id);

  if (!proposal) {
    return {
      title: 'Proposal not found',
      description: 'This proposal is no longer available.',
    };
  }

  const title = `${proposal.clientName} · ${proposal.title}`;
  const plain = (proposal.data.overview || '').replace(/\s+/g, ' ').trim();
  const description =
    plain.length > 200 ? plain.slice(0, 197) + '…' : plain ||
    `Proposal from ${proposal.agencyName} for ${proposal.clientName}.`;

  // The opengraph-image.tsx colocated with this route is auto-injected by
  // Next into openGraph.images and twitter.images, so we don't set them here.
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      siteName: proposal.agencyName,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

const getPublicProposalCached = unstable_cache(
  async (id: string): Promise<Proposal | null> => {
    try {
      const adminSnapshot = await adminDb.collection('shared_proposals').doc(id).get();
      if (adminSnapshot.exists) {
        return adminSnapshot.data() as Proposal;
      }
    } catch (error) {
      console.error('Server-side admin proposal fetch failed:', error);
    }

    try {
      const clientSnapshot = await getClientDoc(clientDoc(clientDb, 'shared_proposals', id));
      if (clientSnapshot.exists()) {
        return clientSnapshot.data() as Proposal;
      }
    } catch (error) {
      console.error('Server-side fallback proposal fetch failed:', error);
    }

    return null;
  },
  ['public-proposal-by-id'],
  { revalidate: 60 }
);

export default async function PublicProposalView({ params }: PageProps) {
  const { id } = await params;
  const proposal = await getPublicProposalCached(id);

  if (!proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Unavailable</h1>
          <p className="text-gray-600">This proposal could not be found.</p>
        </div>
      </div>
    );
  }

  return (
    <ProposalViewer
      proposal={proposal}
      isPublic
    />
  );
}
