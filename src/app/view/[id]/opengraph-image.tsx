import { ImageResponse } from 'next/og';
import { unstable_cache } from 'next/cache';
import { doc as clientDoc, getDoc as getClientDoc } from 'firebase/firestore';
import { db as adminDb } from '@/lib/firebase-admin';
import { db as clientDb } from '@/lib/firebase';
import { Proposal } from '@/app/modules/proposal/types/Proposal';

export const runtime = 'nodejs';
export const alt = 'Proposal preview';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Mirror the lookup used by page.tsx / generateMetadata so the cache hit
// is shared between them — at-most-one Firestore read per proposal per minute.
const getProposal = unstable_cache(
  async (id: string): Promise<Proposal | null> => {
    try {
      const snap = await adminDb.collection('shared_proposals').doc(id).get();
      if (snap.exists) return snap.data() as Proposal;
    } catch (err) {
      console.error('OG admin fetch failed:', err);
    }
    try {
      const snap = await getClientDoc(clientDoc(clientDb, 'shared_proposals', id));
      if (snap.exists()) return snap.data() as Proposal;
    } catch (err) {
      console.error('OG client fetch failed:', err);
    }
    return null;
  },
  ['og-proposal-by-id'],
  { revalidate: 60 }
);

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposal = await getProposal(id);

  const clientName = proposal?.clientName || 'Proposal';
  const title = proposal?.title || 'Website Proposal';
  const agencyName = proposal?.agencyName || 'ActiveSet';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '80px',
          background:
            'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 45%, #16213e 100%)',
          color: 'white',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Top: agency label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              background: '#3b82f6',
              boxShadow: '0 0 24px #3b82f6',
            }}
          />
          <div
            style={{
              fontSize: '24px',
              textTransform: 'uppercase',
              letterSpacing: '4px',
              color: '#94a3b8',
              fontWeight: 500,
            }}
          >
            {agencyName} · Proposal
          </div>
        </div>

        {/* Center: client name + proposal title */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div
            style={{
              fontSize: '32px',
              color: '#60a5fa',
              fontWeight: 500,
              letterSpacing: '-0.5px',
            }}
          >
            Prepared for
          </div>
          <div
            style={{
              fontSize: '110px',
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: '-3px',
              color: 'white',
            }}
          >
            {truncate(clientName, 28)}
          </div>
          <div
            style={{
              fontSize: '44px',
              color: '#cbd5e1',
              fontWeight: 400,
              marginTop: '12px',
              lineHeight: 1.2,
              letterSpacing: '-0.5px',
            }}
          >
            {truncate(title, 60)}
          </div>
        </div>

        {/* Bottom: decorative line + brand */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid rgba(148, 163, 184, 0.2)',
            paddingTop: '32px',
          }}
        >
          <div
            style={{
              fontSize: '22px',
              color: '#64748b',
              letterSpacing: '1px',
            }}
          >
            app.activeset.co
          </div>
          <div
            style={{
              display: 'flex',
              gap: '8px',
            }}
          >
            {[0.3, 0.55, 0.85, 1].map((opacity, i) => (
              <div
                key={i}
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: `rgba(96, 165, 250, ${opacity})`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    ),
    size
  );
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1).trimEnd() + '…';
}
