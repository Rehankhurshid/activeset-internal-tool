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

// ActiveSet wordmark. Replace fill=white with ink so it reads on the
// cream background. Inline SVG via data: URL is the most reliable way
// to embed vector art in a Satori ImageResponse.
const LOGO_SVG = `<svg width="280" height="39" viewBox="0 0 280 39" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M47.7452 18.4081H37.7669C37.745 18.4081 37.7236 18.4019 37.7051 18.3903C37.6867 18.3787 37.672 18.3622 37.6629 18.3426C37.6538 18.3231 37.6506 18.3014 37.6537 18.2801C37.6568 18.2589 37.6661 18.239 37.6805 18.2227L52.6925 1.23567C52.7492 1.17156 52.7858 1.09284 52.7981 1.00889C52.8104 0.924942 52.7979 0.839295 52.7619 0.762153C52.7259 0.685011 52.6681 0.619624 52.5952 0.57378C52.5224 0.527936 52.4377 0.503566 52.3511 0.503572H33.7795C33.5393 0.503573 33.3019 0.554185 33.0835 0.651977C32.865 0.749768 32.6706 0.89245 32.5134 1.07034L0.110221 37.7365C0.0535536 37.8007 0.0168855 37.8794 0.00458383 37.9633C-0.00771784 38.0473 0.00486533 38.1329 0.0408349 38.2101C0.0768044 38.2872 0.134645 38.3526 0.207467 38.3984C0.28029 38.4443 0.365026 38.4686 0.451586 38.4686H19.0232C19.2634 38.4686 19.5008 38.418 19.7192 38.3202C19.9377 38.2224 20.1321 38.0798 20.2893 37.9019L37.2895 18.6651C37.3048 18.6478 37.325 18.6356 37.3476 18.6299C37.3702 18.6242 37.394 18.6255 37.4159 18.6335C37.4377 18.6414 37.4566 18.6558 37.4699 18.6745C37.4832 18.6933 37.4903 18.7156 37.4903 18.7385V28.4559C37.4903 31.1207 38.5707 33.6764 40.4939 35.5607C42.417 37.445 45.0254 38.5036 47.7451 38.5036C50.4649 38.5036 53.0733 37.445 54.9964 35.5607C56.9196 33.6764 58 31.1207 58 28.4559C58 27.1364 57.7348 25.8298 57.2194 24.6108C56.7041 23.3917 55.9487 22.2841 54.9964 21.351C54.0442 20.418 52.9137 19.6779 51.6695 19.173C50.4254 18.668 49.0919 18.4081 47.7452 18.4081Z" fill="${INK}"/><path d="M146.993 33.3423V37.6846H140.87C139.003 37.6846 137.628 37.1988 136.74 36.2372C135.852 35.2707 135.409 33.8017 135.41 31.8305V16.4593C135.416 16.1379 135.399 15.8166 135.36 15.4976C135.347 15.3154 135.286 15.1396 135.184 14.987C135.092 14.8773 134.961 14.8051 134.818 14.7838C134.613 14.746 134.405 14.7294 134.196 14.7342H131.215V10.7886H134.196C134.405 10.7934 134.613 10.7768 134.818 10.7391C134.961 10.7179 135.092 10.6455 135.184 10.5358C135.286 10.3833 135.347 10.2075 135.36 10.0253C135.399 9.70628 135.416 9.385 135.41 9.06372V3.88381H140.67V9.06372C140.666 9.38495 140.683 9.70608 140.72 10.0253C140.733 10.2075 140.794 10.3833 140.895 10.5358C140.988 10.6456 141.118 10.7179 141.262 10.7391C141.467 10.7766 141.675 10.7931 141.884 10.7886H146.927V14.7342H141.884C141.675 14.7297 141.467 14.7463 141.262 14.7838C141.118 14.8051 140.988 14.8774 140.895 14.987C140.794 15.1396 140.733 15.3154 140.72 15.4976C140.683 15.8168 140.666 16.138 140.67 16.4593V31.6124C140.666 31.9336 140.683 32.2548 140.72 32.5739C140.733 32.7562 140.794 32.9319 140.895 33.0845C140.989 33.1941 141.119 33.2677 141.262 33.2927C141.467 33.3277 141.675 33.3443 141.884 33.3422L146.993 33.3423Z" fill="${INK}"/><path d="M83.4378 0.658849L70.8558 37.6805H76.714L80.3361 26.6331H95.8596L99.4816 37.6805H105.407L92.558 0.658849H83.4378ZM81.7593 22.2929L87.4294 4.99902H88.7663L94.4364 22.2929H81.7593Z" fill="${INK}"/><path d="M113.961 16.6052C115.203 15.8384 116.712 15.4547 118.488 15.4541C120.529 15.4541 122.215 15.9364 123.547 16.901C124.88 17.8681 125.786 19.3043 126.077 20.9125H131.203C130.981 19.1162 130.319 17.4006 129.273 15.9149C128.151 14.3322 126.654 13.0451 124.912 12.1663C123.07 11.203 120.862 10.7209 118.288 10.7199C115.869 10.6813 113.481 11.2709 111.365 12.4296C109.323 13.5691 107.65 15.2561 106.538 17.2955C105.361 19.3997 104.729 21.8985 104.641 24.7918C104.641 27.6856 105.24 30.1406 106.438 32.1569C107.579 34.119 109.265 35.7166 111.298 36.7599C113.419 37.8307 115.773 38.3724 118.155 38.338C120.728 38.338 122.947 37.8449 124.812 36.8587C126.584 35.9527 128.104 34.6319 129.239 33.0118C130.306 31.4851 130.98 29.7246 131.203 27.8826H126.077C125.721 29.7235 124.834 31.1263 123.414 32.0911C121.941 33.0712 120.197 33.5767 118.421 33.538C115.758 33.538 113.695 32.7049 112.23 31.0387C110.766 29.3735 110.033 27.1597 110.033 24.3973C110.042 22.7938 110.406 21.2117 111.098 19.7613C111.73 18.4624 112.723 17.3677 113.961 16.6052Z" fill="${INK}"/><path d="M154.222 10.7857H148.696V37.6807H154.222V10.7857Z" fill="${INK}"/><path d="M151.493 0.59323C150.205 0.59323 149.339 0.911102 148.896 1.54685C148.448 2.19508 148.216 2.96475 148.23 3.74936C148.212 4.56537 148.444 5.36768 148.896 6.05107C149.339 6.70892 150.205 7.03776 151.493 7.03759C152.824 7.03759 153.689 6.70875 154.089 6.05107C154.499 5.35282 154.706 4.55639 154.688 3.74936C154.703 2.97399 154.496 2.21022 154.089 1.54685C153.689 0.911748 152.824 0.593876 151.493 0.59323Z" fill="${INK}"/><path d="M178.167 10.7864L170.113 33.142H169.982L161.592 10.7864H155.801L166.053 37.6826H173.841L183.998 10.7864H178.167Z" fill="${INK}"/><path d="M206.591 16.5416C205.528 14.7225 203.987 13.2218 202.13 12.1994C200.268 11.1683 198.138 10.6527 195.741 10.6528C192.986 10.6528 190.622 11.2675 188.65 12.4968C186.69 13.7017 185.119 15.4354 184.124 17.4933C183.06 19.6852 182.546 22.0976 182.623 24.5271C182.622 26.8032 183.099 29.0548 184.024 31.1397C184.937 33.242 186.437 35.0439 188.349 36.3345C190.301 37.6679 192.809 38.3354 195.872 38.3372C198.271 38.3372 200.357 37.9109 202.13 37.0583C203.831 36.2645 205.298 35.0527 206.39 33.5389C207.451 32.0555 208.136 30.3419 208.387 28.5424H202.998C202.719 30.0677 201.845 31.4239 200.564 32.3195C199.254 33.2663 197.668 33.7388 195.807 33.7371C193.322 33.7371 191.38 32.9589 189.98 31.4024C188.58 29.8459 187.881 27.6649 187.883 24.8594H208.452V23.9027C208.466 23.6498 208.444 23.3963 208.387 23.1492C208.297 20.6063 207.698 18.4037 206.591 16.5416ZM188.359 20.8144C188.439 20.517 188.535 20.2097 188.65 19.8925C188.951 19.0599 189.391 18.2826 189.95 17.5924C190.556 16.8444 191.331 16.2468 192.213 15.8476C193.281 15.3837 194.44 15.1602 195.606 15.1933C197.071 15.1933 198.271 15.4561 199.204 15.9815C200.075 16.4542 200.825 17.1171 201.397 17.9196C201.901 18.6274 202.273 19.4179 202.496 20.2543C202.546 20.4476 202.591 20.636 202.632 20.8144H188.359Z" fill="${INK}"/><path d="M234.889 20.7149C233.336 19.9002 231.694 19.2605 229.996 18.8077C228.22 18.326 226.434 17.8659 224.637 17.4271C222.95 17.0238 221.293 16.5075 219.677 15.882C218.3 15.3797 217.067 14.5562 216.082 13.4815C215.194 12.4736 214.772 11.1366 214.818 9.47046C214.906 7.54193 215.938 5.95273 217.913 4.70285C219.888 3.45347 222.406 2.82885 225.469 2.82901C226.588 2.84432 227.702 2.96541 228.798 3.19061C230.063 3.44057 231.278 3.89613 232.392 4.53874C233.563 5.21214 234.546 6.16083 235.255 7.30038C236.009 8.48393 236.342 9.99632 236.254 11.8376H239.249C239.338 9.2076 238.772 7.02671 237.552 5.29487C236.315 3.55084 234.609 2.18395 232.626 1.34921C230.45 0.428632 228.102 -0.0304809 225.735 0.00156961C223.369 -0.0249915 221.015 0.353154 218.779 1.11927C216.67 1.86524 214.983 2.92826 213.719 4.30834C212.462 5.66984 211.742 7.43169 211.689 9.27344C211.599 11.3341 211.988 13.0108 212.854 14.3034C213.748 15.6227 214.976 16.6882 216.415 17.3942C218 18.1912 219.661 18.8301 221.375 19.3014C223.172 19.8058 224.959 20.277 226.734 20.7149C228.416 21.1234 230.064 21.662 231.66 22.3259C233.039 22.8713 234.27 23.7269 235.255 24.8247C236.142 25.8553 236.564 27.2032 236.52 28.8686C236.482 29.4529 236.358 30.0287 236.154 30.5783C235.838 31.4425 235.352 32.2361 234.723 32.913C234.013 33.7248 232.958 34.4043 231.56 34.9514C230.163 35.5004 228.31 35.7743 226.002 35.7734C223.472 35.7734 221.397 35.4774 219.777 34.8856C218.157 34.294 216.892 33.5599 215.983 32.6831C215.157 31.9262 214.5 31.008 214.052 29.9868C213.722 29.2291 213.487 28.4341 213.353 27.6197C213.264 26.9618 213.22 26.5673 213.22 26.4357H210.157C210.201 28.5839 210.667 30.4142 211.556 31.9265C212.44 33.4367 213.672 34.7205 215.151 35.6746C216.68 36.6702 218.368 37.4039 220.144 37.8447C221.993 38.3089 223.894 38.5409 225.802 38.5355C228.159 38.5711 230.503 38.1925 232.726 37.4173C234.766 36.6723 236.408 35.5983 237.652 34.1953C238.894 32.7925 239.559 31.0827 239.649 29.0661C239.692 26.9618 239.282 25.2411 238.417 23.904C237.541 22.5571 236.325 21.4583 234.889 20.7149Z" fill="${INK}"/><path d="M264.274 16.6053C263.26 14.8801 261.801 13.4509 260.047 12.4627C258.293 11.4762 256.285 10.9829 254.022 10.9829C251.314 10.9829 249.017 11.6077 247.131 12.8572C245.262 14.087 243.775 15.8058 242.837 17.8219C241.857 19.9011 241.357 22.1697 241.373 24.4633C241.327 26.7354 241.781 28.9904 242.705 31.0718C243.606 33.1619 245.068 34.9694 246.932 36.2998C248.818 37.659 251.203 38.3385 254.088 38.3382C256.04 38.3665 257.974 37.9621 259.747 37.1547C261.382 36.4057 262.817 35.2911 263.941 33.8993C265.051 32.516 265.785 30.8749 266.072 29.1322H263.075C262.725 31.0729 261.612 32.7983 259.98 33.9322C258.316 35.1162 256.352 35.7081 254.088 35.7078C250.981 35.7078 248.574 34.6996 246.865 32.6833C245.156 30.6671 244.302 27.971 244.302 24.5949H266.138V23.7401C266.141 23.4756 266.119 23.2114 266.072 22.9511C265.938 20.4963 265.339 18.381 264.274 16.6053ZM244.502 22.6223C244.668 21.4345 244.993 20.2737 245.467 19.1699C245.919 18.1181 246.549 17.1505 247.331 16.309C248.13 15.4611 249.092 14.7792 250.16 14.3035C251.377 13.7782 252.694 13.5202 254.022 13.5474C255.619 13.5474 256.984 13.8543 258.116 14.4681C259.203 15.0445 260.147 15.8531 260.879 16.8352C261.559 17.7433 262.087 18.7536 262.443 19.8272C262.751 20.7314 262.941 21.6706 263.009 22.6223L244.502 22.6223Z" fill="${INK}"/><path d="M279.551 10.9833V13.4122H274.392C274.164 13.41 273.936 13.4216 273.709 13.4469C273.644 13.4519 273.58 13.4715 273.522 13.504C273.465 13.5366 273.416 13.5814 273.378 13.6352C273.297 13.7934 273.254 13.9683 273.253 14.1458C273.238 14.3837 273.228 14.7109 273.228 15.1421V33.3884C273.228 33.8146 273.238 34.1468 273.253 34.3848C273.254 34.5622 273.297 34.7368 273.378 34.8953C273.416 34.9491 273.465 34.9939 273.522 35.0265C273.58 35.0591 273.644 35.0786 273.709 35.0836C273.936 35.1068 274.164 35.1168 274.392 35.1134H279.551V37.681H273.624C272.249 37.681 271.351 37.2862 270.929 36.4964C270.487 35.6184 270.27 34.6464 270.297 33.666V15.1421C270.297 14.7109 270.287 14.3837 270.272 14.1458C270.271 13.9683 270.228 13.7934 270.146 13.6352C270.109 13.5815 270.06 13.5367 270.002 13.5041C269.945 13.4715 269.881 13.452 269.815 13.4469C269.589 13.4214 269.361 13.4098 269.133 13.4122H265.836V10.9833H269.133C269.361 10.9857 269.589 10.9741 269.815 10.9486C269.881 10.9435 269.945 10.924 270.002 10.8914C270.06 10.8588 270.109 10.814 270.146 10.7603C270.228 10.6021 270.271 10.4272 270.272 10.2497C270.287 10.0118 270.297 9.6846 270.297 9.25336V4.07833H273.228V9.25336C273.228 9.6846 273.238 10.0118 273.253 10.2497C273.254 10.4272 273.297 10.6021 273.378 10.7603C273.416 10.814 273.465 10.8589 273.522 10.8915C273.58 10.924 273.644 10.9436 273.709 10.9486C273.936 10.9739 274.164 10.9855 274.392 10.9833H279.551Z" fill="${INK}"/></svg>`;
const LOGO_URL = `data:image/svg+xml;utf8,${encodeURIComponent(LOGO_SVG)}`;

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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_URL} alt={agencyName} width={180} height={25} />
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO_URL} alt={agencyName} width={220} height={31} />
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                  fontSize: '14px',
                  letterSpacing: '1px',
                  color: ACCENT,
                  borderLeft: `1px solid ${MUTED}`,
                  paddingLeft: '18px',
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
