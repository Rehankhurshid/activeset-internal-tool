import { ImageResponse } from 'next/og';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Proposal } from '@/app/modules/proposal/types/Proposal';

export const runtime = 'nodejs';
export const alt = 'Proposal preview';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

async function fetchProposal(id: string): Promise<Partial<Proposal> | null> {
  try {
    const snap = await getDoc(doc(db, 'shared_proposals', id));
    return snap.exists() ? (snap.data() as Proposal) : null;
  } catch (err) {
    console.error('[og-image] proposal fetch failed:', err);
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  let clientName = 'Proposal';
  let title = 'Website Proposal';
  let agencyName = 'ActiveSet';

  try {
    const { id } = await params;
    const proposal = await fetchProposal(id);
    if (proposal) {
      clientName = proposal.clientName || clientName;
      title = proposal.title || title;
      agencyName = proposal.agencyName || agencyName;
    }
  } catch (err) {
    console.error('[og-image] param/fetch error:', err);
  }

  try {
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
            background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 45%, #16213e 100%)',
            color: 'white',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                background: '#3b82f6',
              }}
            />
            <div
              style={{
                display: 'flex',
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div
              style={{
                display: 'flex',
                fontSize: '32px',
                color: '#60a5fa',
                fontWeight: 500,
              }}
            >
              Prepared for
            </div>
            <div
              style={{
                display: 'flex',
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
                display: 'flex',
                fontSize: '44px',
                color: '#cbd5e1',
                fontWeight: 400,
                marginTop: '12px',
                lineHeight: 1.2,
              }}
            >
              {truncate(title, 60)}
            </div>
          </div>

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
                display: 'flex',
                fontSize: '22px',
                color: '#64748b',
                letterSpacing: '1px',
              }}
            >
              app.activeset.co
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(96, 165, 250, 0.3)' }} />
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(96, 165, 250, 0.55)' }} />
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(96, 165, 250, 0.85)' }} />
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(96, 165, 250, 1)' }} />
            </div>
          </div>
        </div>
      ),
      size
    );
  } catch (err) {
    console.error('[og-image] render failed:', err);
    // Last-resort fallback — a plain black image with minimal text.
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a0a0a',
            color: 'white',
            fontSize: '80px',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          Proposal
        </div>
      ),
      size
    );
  }
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1).trimEnd() + '…';
}
