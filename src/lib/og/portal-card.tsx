import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { activesetMarkSrc, activesetWordmarkSrc } from '@/lib/og/activeset-logo';

/**
 * The preview card for a client portal link, 1200×630.
 *
 * Built to never fail: names of any length are sized and cut to fit, a missing
 * or broken logo becomes a monogram, missing fonts fall back to the built-in
 * one, and if the branded card still cannot be drawn a plain card that names
 * nobody is returned instead. The image is fully rendered before it is
 * returned, because ImageResponse renders lazily and a failure while streaming
 * would otherwise reach the unfurler as a broken image.
 */

export const PORTAL_CARD_SIZE = { width: 1200, height: 630 };

export interface PortalCardInput {
  brandName: string;
  projectName?: string;
  logo?: { src: string; width: number; height: number };
  /** Host shown in the footer, e.g. app.activeset.co. */
  host?: string;
}

// The portal's own palette (.portal-theme in globals.css), in hex for Satori.
const BG = '#FAF8F5';
const INK = '#1F1C19';
const MUTED = '#6F6A63';
const SOFT = '#A39D95';
const LINE = '#E6E1D9';
const CARD = '#FFFFFF';
const GLOW = '#F1E9DC';
const DOT = '#DDD6CB';

// Satori does not tile CSS backgrounds, so the grid is an SVG pattern.
const DOTS_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><pattern id="d" width="30" height="30" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="${DOT}"/></pattern></defs><rect width="1200" height="630" fill="url(#d)"/></svg>`,
)}`;

// ---------------------------------------------------------------------------
// Fonts: bundled (src/assets/og-fonts), so rendering never waits on a CDN.
// ---------------------------------------------------------------------------

type Font = { name: string; data: ArrayBuffer; weight: 400 | 500 | 700; style: 'normal' };

const FONT_FILES: Array<Omit<Font, 'data'> & { file: string }> = [
  { name: 'Funnel Display', weight: 700, style: 'normal', file: 'funnel-display-latin-700-normal.ttf' },
  { name: 'Funnel Sans', weight: 400, style: 'normal', file: 'funnel-sans-latin-400-normal.ttf' },
  { name: 'Funnel Sans', weight: 500, style: 'normal', file: 'funnel-sans-latin-500-normal.ttf' },
];

let fontsPromise: Promise<Font[]> | null = null;

function loadFonts(): Promise<Font[]> {
  fontsPromise ??= Promise.all(
    FONT_FILES.map(async ({ file, ...font }) => {
      try {
        const buf = await readFile(join(process.cwd(), 'src/assets/og-fonts', file));
        return { ...font, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer };
      } catch (err) {
        console.error(`[portal-card] font ${file} unavailable:`, err instanceof Error ? err.message : err);
        return null;
      }
    }),
  ).then((fonts) => fonts.filter((f): f is Font => f !== null));
  return fontsPromise;
}

// ---------------------------------------------------------------------------
// Text fitting
// ---------------------------------------------------------------------------

/** Cuts by characters (not UTF-16 units), so an emoji or accent is never split. */
export function clip(text: string, max: number): string {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim());
  if (chars.length <= max) return chars.join('');
  return chars.slice(0, max - 1).join('').trimEnd() + '…';
}

/** Headline size for the client's name: as large as fits in at most two lines. */
export function brandFontSize(name: string): number {
  const n = Array.from(name).length;
  if (n <= 10) return 132;
  if (n <= 16) return 112;
  if (n <= 24) return 92;
  if (n <= 34) return 76;
  return 64;
}

function monogram(name: string): string {
  const first = Array.from(name.trim()).find((c) => /\p{L}|\p{N}/u.test(c));
  return (first ?? 'A').toLocaleUpperCase();
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

const TILE = 104;

function Tile({ children, dark = false, width = TILE }: { children: React.ReactNode; dark?: boolean; width?: number }) {
  return (
    <div
      style={{
        width,
        height: TILE,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 28,
        background: dark ? INK : CARD,
        border: `1.5px solid ${dark ? INK : LINE}`,
        boxShadow: '0 1px 2px rgba(31,28,25,0.06), 0 12px 32px -12px rgba(31,28,25,0.18)',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

function ClientTile({ brandName, logo }: Pick<PortalCardInput, 'brandName' | 'logo'>) {
  if (logo) {
    // Square marks sit in a square tile; wordmarks get a wider one, so a wide
    // logo is not shrunk to a sliver.
    const pad = 24;
    const maxH = TILE - pad * 2;
    const maxW = 300 - pad * 2;
    const scale = Math.min(maxH / logo.height, maxW / logo.width);
    const w = Math.max(1, Math.round(logo.width * scale));
    const h = Math.max(1, Math.round(logo.height * scale));
    return (
      <Tile width={Math.max(TILE, w + pad * 2)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo.src} alt="" width={w} height={h} />
      </Tile>
    );
  }
  return (
    <Tile>
      <div style={{ display: 'flex', fontFamily: 'Funnel Display', fontWeight: 700, fontSize: 52, color: INK, lineHeight: 1 }}>
        {monogram(brandName)}
      </div>
    </Tile>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        background: BG,
        color: INK,
        fontFamily: 'Funnel Sans',
      }}
    >
      {/* Dot grid, fading out towards the text. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={DOTS_SRC} alt="" width={PORTAL_CARD_SIZE.width} height={PORTAL_CARD_SIZE.height} style={{ position: 'absolute', top: 0, left: 0 }} />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          backgroundImage: `linear-gradient(100deg, ${BG} 34%, rgba(250,248,245,0.6) 64%, rgba(250,248,245,0) 100%)`,
        }}
      />
      {/* Warm glow behind the lockup. */}
      <div
        style={{
          position: 'absolute',
          top: -260,
          right: -200,
          width: 760,
          height: 760,
          display: 'flex',
          borderRadius: 9999,
          backgroundImage: `radial-gradient(circle, ${GLOW} 0%, rgba(241,233,220,0) 68%)`,
        }}
      />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: '64px 72px 56px' }}>
        {children}
      </div>
    </div>
  );
}

function Footer({ host }: { host?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 'auto',
        paddingTop: 28,
        borderTop: `1.5px solid ${LINE}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', fontSize: 22, color: MUTED }}>Prepared by</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={activesetWordmarkSrc(INK)} alt="ActiveSet" width={158} height={22} />
      </div>
      {host ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 22, color: MUTED }}>
          <div style={{ display: 'flex', width: 8, height: 8, borderRadius: 9999, background: SOFT }} />
          {host}
        </div>
      ) : null}
    </div>
  );
}

function BrandedCard({ brandName, projectName, logo, host }: PortalCardInput) {
  const name = clip(brandName, 56);
  const project = projectName ? clip(projectName, 64) : undefined;
  const size = brandFontSize(name);
  return (
    <Frame>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <ClientTile brandName={brandName} logo={logo} />
        <div style={{ display: 'flex', fontSize: 34, color: SOFT, lineHeight: 1 }}>×</div>
        <Tile dark>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={activesetMarkSrc(BG)} alt="" width={58} height={39} />
        </Tile>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', marginBottom: 36 }}>
        <div style={{ display: 'flex', fontSize: 22, fontWeight: 500, color: MUTED, letterSpacing: 3, textTransform: 'uppercase' }}>
          Project page
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 14,
            maxWidth: 1056,
            fontFamily: 'Funnel Display',
            fontWeight: 700,
            fontSize: size,
            lineHeight: 1.02,
            letterSpacing: size >= 100 ? -4 : -2.5,
            color: INK,
          }}
        >
          {name}
        </div>
        {project ? (
          <div style={{ display: 'flex', marginTop: 16, maxWidth: 1000, fontSize: 36, lineHeight: 1.25, color: MUTED }}>{project}</div>
        ) : null}
      </div>

      <Footer host={host} />
    </Frame>
  );
}

/** Names nobody: for links that do not resolve, and as the last resort. */
function PlainCard({ host }: { host?: string }) {
  return (
    <Frame>
      <Tile dark>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={activesetMarkSrc(BG)} alt="" width={58} height={39} />
      </Tile>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', marginBottom: 36 }}>
        <div style={{ display: 'flex', fontFamily: 'Funnel Display', fontWeight: 700, fontSize: 112, lineHeight: 1.02, letterSpacing: -4 }}>
          Project page
        </div>
        <div style={{ display: 'flex', marginTop: 16, fontSize: 36, color: MUTED }}>A private page prepared by ActiveSet.</div>
      </div>
      <Footer host={host} />
    </Frame>
  );
}

async function draw(node: React.ReactElement, fonts: Font[]): Promise<ArrayBuffer> {
  const res = new ImageResponse(node, { ...PORTAL_CARD_SIZE, fonts: fonts.length ? fonts : undefined });
  return res.arrayBuffer();
}

/** PNG bytes for a portal link's preview. `null` input draws the plain card. Never throws. */
export async function renderPortalCard(input: PortalCardInput | null, host?: string): Promise<{ png: ArrayBuffer; branded: boolean }> {
  const fonts = await loadFonts();
  if (input) {
    try {
      return { png: await draw(<BrandedCard {...input} host={host} />, fonts), branded: true };
    } catch (err) {
      console.error('[portal-card] branded card failed, drawing the plain one:', err);
    }
  }
  try {
    return { png: await draw(<PlainCard host={host} />, fonts), branded: false };
  } catch (err) {
    console.error('[portal-card] plain card failed, retrying without fonts:', err);
    return { png: await draw(<PlainCard host={host} />, []), branded: false };
  }
}
