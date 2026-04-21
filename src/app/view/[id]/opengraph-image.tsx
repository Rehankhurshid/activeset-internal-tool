import { ImageResponse } from 'next/og';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Proposal } from '@/app/modules/proposal/types/Proposal';

export const runtime = 'nodejs';
export const alt = 'Proposal preview';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const CREAM = '#EFE8DD';
const INK = '#111111';
const MUTED = '#5A5A5A';
const ACCENT = '#2D2D2D';

async function fetchProposal(id: string): Promise<Partial<Proposal> | null> {
  try {
    const snap = await getDoc(doc(db, 'shared_proposals', id));
    return snap.exists() ? (snap.data() as Proposal) : null;
  } catch (err) {
    console.error('[og-image] proposal fetch failed:', err);
    return null;
  }
}

// Fetch a Google Font file as an ArrayBuffer. We hit the CSS endpoint
// with a Chromium-ish UA so Google returns a woff2 URL, then download it.
async function loadGoogleFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
      family
    )}:wght@${weight}&display=swap`;
    const css = await fetch(cssUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
    }).then((r) => r.text());
    const match = css.match(/url\((https:\/\/[^)]+)\)\s*format\(['"]?(?:woff2|truetype)['"]?\)/);
    if (!match) return null;
    return await fetch(match[1]).then((r) => r.arrayBuffer());
  } catch (err) {
    console.error(`[og-image] font load failed (${family} ${weight}):`, err);
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  let clientName = 'Proposal';
  let title = 'Website Proposal';
  let agencyName = 'ActiveSet';
  let services: string[] = [];

  try {
    const { id } = await params;
    const proposal = await fetchProposal(id);
    if (proposal) {
      clientName = proposal.clientName || clientName;
      title = proposal.title || title;
      agencyName = proposal.agencyName || agencyName;
      services = proposal.data?.overviewDetails?.services?.slice(0, 4) || [];
    }
  } catch (err) {
    console.error('[og-image] param/fetch error:', err);
  }

  const [displayBold, sansRegular, sansMedium, mono] = await Promise.all([
    loadGoogleFont('Funnel Display', 800),
    loadGoogleFont('Funnel Sans', 400),
    loadGoogleFont('Funnel Sans', 500),
    loadGoogleFont('JetBrains Mono', 500),
  ]);

  const fonts = [
    displayBold && { name: 'Funnel Display', data: displayBold, weight: 800 as const, style: 'normal' as const },
    sansRegular && { name: 'Funnel Sans', data: sansRegular, weight: 400 as const, style: 'normal' as const },
    sansMedium && { name: 'Funnel Sans', data: sansMedium, weight: 500 as const, style: 'normal' as const },
    mono && { name: 'JetBrains Mono', data: mono, weight: 500 as const, style: 'normal' as const },
  ].filter(Boolean) as Array<{
    name: string;
    data: ArrayBuffer;
    weight: 400 | 500 | 800;
    style: 'normal';
  }>;

  const agencyInitial = (agencyName[0] || 'A').toUpperCase();
  const servicePills = services.length ? services : ['Strategy', 'Design', 'Development'];

  try {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: CREAM,
            color: INK,
            fontFamily: 'Funnel Sans, system-ui, sans-serif',
            padding: '60px 64px',
            position: 'relative',
          }}
        >
          {/* Plus-mark grid background */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '240px 64px 90px',
              pointerEvents: 'none',
            }}
          >
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: MUTED,
                  fontSize: '18px',
                  opacity: 0.35,
                }}
              >
                <span style={{ display: 'flex' }}>+</span>
                <span style={{ display: 'flex' }}>+</span>
                <span style={{ display: 'flex' }}>+</span>
                <span style={{ display: 'flex' }}>+</span>
                <span style={{ display: 'flex' }}>+</span>
                <span style={{ display: 'flex' }}>+</span>
                <span style={{ display: 'flex' }}>+</span>
                <span style={{ display: 'flex' }}>+</span>
              </div>
            ))}
          </div>

          {/* Top label row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: `1px solid ${INK}`,
              paddingBottom: '12px',
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              fontSize: '16px',
              color: ACCENT,
              letterSpacing: '1px',
            }}
          >
            <div style={{ display: 'flex' }}>/ PROPOSAL</div>
            <div style={{ display: 'flex' }}>{agencyName.toUpperCase()}</div>
          </div>

          {/* Headline */}
          <div
            style={{
              display: 'flex',
              marginTop: '48px',
              fontFamily: 'Funnel Display, Funnel Sans, system-ui, sans-serif',
              fontSize: clientName.length > 16 ? '140px' : '176px',
              fontWeight: 800,
              lineHeight: 0.95,
              letterSpacing: '-5px',
              color: INK,
            }}
          >
            {truncate(clientName, 26)}
          </div>

          {/* Subtitle + pills */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              marginTop: '40px',
              maxWidth: '780px',
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: '32px',
                lineHeight: 1.25,
                color: ACCENT,
                fontWeight: 500,
              }}
            >
              {truncate(title, 72)}
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {servicePills.slice(0, 4).map((label, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                    fontSize: '16px',
                    padding: '8px 14px',
                    border: `1px solid ${INK}`,
                    borderRadius: '4px',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    color: INK,
                    background: 'transparent',
                  }}
                >
                  {truncate(label, 18)}
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 'auto',
              paddingTop: '32px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  border: `1.5px solid ${INK}`,
                  fontFamily: 'Funnel Display, system-ui, sans-serif',
                  fontSize: '24px',
                  fontWeight: 800,
                  color: INK,
                }}
              >
                {agencyInitial}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                  fontSize: '14px',
                  letterSpacing: '1px',
                  color: ACCENT,
                }}
              >
                app.activeset.co
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                fontSize: '14px',
                letterSpacing: '2px',
                color: ACCENT,
              }}
            >
              © {agencyName.toUpperCase()}
            </div>
          </div>
        </div>
      ),
      { ...size, fonts: fonts.length ? fonts : undefined }
    );
  } catch (err) {
    console.error('[og-image] render failed:', err);
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: CREAM,
            color: INK,
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
