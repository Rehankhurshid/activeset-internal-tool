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

// fontsource via jsdelivr serves TTF files directly — more reliable with
// Satori than scraping Google Fonts CSS (which returns woff2 URLs that
// older Satori builds can't parse).
const FONT_URLS = {
  funnelDisplay800:
    'https://cdn.jsdelivr.net/fontsource/fonts/funnel-display@latest/latin-800-normal.ttf',
  funnelSans400:
    'https://cdn.jsdelivr.net/fontsource/fonts/funnel-sans@latest/latin-400-normal.ttf',
  funnelSans500:
    'https://cdn.jsdelivr.net/fontsource/fonts/funnel-sans@latest/latin-500-normal.ttf',
  jetbrainsMono500:
    'https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-500-normal.ttf',
};

async function loadFont(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) {
      console.error(`[og-image] font ${res.status}: ${url}`);
      return null;
    }
    return await res.arrayBuffer();
  } catch (err) {
    console.error(`[og-image] font fetch error ${url}:`, err);
    return null;
  }
}

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
    loadFont(FONT_URLS.funnelDisplay800),
    loadFont(FONT_URLS.funnelSans400),
    loadFont(FONT_URLS.funnelSans500),
    loadFont(FONT_URLS.jetbrainsMono500),
  ]);

  type FontEntry = { name: string; data: ArrayBuffer; weight: 400 | 500 | 800; style: 'normal' };
  const fonts: FontEntry[] = [];
  if (displayBold) fonts.push({ name: 'Funnel Display', data: displayBold, weight: 800, style: 'normal' });
  if (sansRegular) fonts.push({ name: 'Funnel Sans', data: sansRegular, weight: 400, style: 'normal' });
  if (sansMedium) fonts.push({ name: 'Funnel Sans', data: sansMedium, weight: 500, style: 'normal' });
  if (mono) fonts.push({ name: 'JetBrains Mono', data: mono, weight: 500, style: 'normal' });

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
          }}
        >
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
              fontSize: clientName.length > 16 ? '136px' : '172px',
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
              marginTop: '40px',
              maxWidth: '820px',
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
              {truncate(title, 80)}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
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
    console.error('[og-image] render failed, using fallback:', err);
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            background: CREAM,
            color: INK,
            fontFamily: 'system-ui, sans-serif',
            padding: '60px',
          }}
        >
          <div style={{ display: 'flex', fontSize: '30px', color: MUTED, marginBottom: '20px' }}>
            / PROPOSAL
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: '96px',
              fontWeight: 800,
              textAlign: 'center',
            }}
          >
            {truncate(clientName, 24)}
          </div>
          <div style={{ display: 'flex', fontSize: '28px', marginTop: '20px', color: ACCENT }}>
            {truncate(title, 60)}
          </div>
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
