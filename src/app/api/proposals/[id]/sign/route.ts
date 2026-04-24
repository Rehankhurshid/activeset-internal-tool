import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { db, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import type { Proposal, SignatureAudit } from '@/app/modules/proposal/types/Proposal';

export const runtime = 'nodejs';

const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;
const IP_HASH_SALT = process.env.PROPOSAL_VIEW_IP_SALT || 'proposal-view-ip-salt';

function isLikelyImageDataUrl(value: string): boolean {
  return /^data:image\/(png|jpeg|jpg|svg\+xml);base64,/.test(value)
    || /^data:image\/svg\+xml,/.test(value);
}

function firstHeader(req: NextRequest, name: string): string | undefined {
  return req.headers.get(name) || undefined;
}

function resolveClientIp(req: NextRequest): string | undefined {
  const forwarded = firstHeader(req, 'x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim();
  return firstHeader(req, 'x-real-ip');
}

function hashIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  return createHash('sha256').update(`${IP_HASH_SALT}:${ip}`).digest('hex').slice(0, 16);
}

function parseUserAgent(ua: string | undefined): { browser?: string; os?: string } {
  if (!ua) return {};
  let browser: string | undefined;
  let os: string | undefined;

  const edge = ua.match(/Edg\/([\d.]+)/);
  const opera = ua.match(/OPR\/([\d.]+)/);
  const chrome = ua.match(/Chrome\/([\d.]+)/);
  const firefox = ua.match(/Firefox\/([\d.]+)/);
  const safari = ua.match(/Version\/([\d.]+).*Safari\//);

  if (edge) browser = `Edge ${edge[1].split('.')[0]}`;
  else if (opera) browser = `Opera ${opera[1].split('.')[0]}`;
  else if (firefox) browser = `Firefox ${firefox[1].split('.')[0]}`;
  else if (chrome) browser = `Chrome ${chrome[1].split('.')[0]}`;
  else if (safari) browser = `Safari ${safari[1].split('.')[0]}`;

  if (/iPhone|iPad|iPod/.test(ua)) {
    const m = ua.match(/OS (\d+)_(\d+)/);
    os = m ? `iOS ${m[1]}.${m[2]}` : 'iOS';
  } else if (/Android/.test(ua)) {
    const m = ua.match(/Android ([\d.]+)/);
    os = m ? `Android ${m[1]}` : 'Android';
  } else if (/Mac OS X ([\d_]+)/.test(ua)) {
    const m = ua.match(/Mac OS X ([\d_]+)/);
    os = m ? `macOS ${m[1].replace(/_/g, '.')}` : 'macOS';
  } else if (/Windows NT 10/.test(ua)) {
    os = 'Windows 10/11';
  } else if (/Windows/.test(ua)) {
    os = 'Windows';
  } else if (/Linux/.test(ua)) {
    os = 'Linux';
  }

  return { browser, os };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Invalid proposal id' }, { status: 400 });
  }

  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  let body: { signatureData?: unknown; method?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const signatureData = body?.signatureData;
  if (typeof signatureData !== 'string' || !signatureData.trim()) {
    return NextResponse.json({ error: 'Missing signature data' }, { status: 400 });
  }
  if (signatureData.length > MAX_SIGNATURE_BYTES) {
    return NextResponse.json({ error: 'Signature too large' }, { status: 413 });
  }
  if (!isLikelyImageDataUrl(signatureData)) {
    return NextResponse.json({ error: 'Signature must be an image data URL' }, { status: 400 });
  }

  const method: SignatureAudit['method'] = body?.method === 'typed' ? 'typed' : 'drawn';

  const sharedRef = db.collection('shared_proposals').doc(id);
  const sharedSnap = await sharedRef.get();
  if (!sharedSnap.exists) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
  }

  const proposal = sharedSnap.data() as Proposal;

  if (proposal.isLocked || proposal.data?.signatures?.client?.signedAt) {
    return NextResponse.json({ error: 'Proposal is already signed' }, { status: 409 });
  }

  const signedAt = new Date().toISOString();

  const userAgent = firstHeader(req, 'user-agent');
  const country = firstHeader(req, 'x-vercel-ip-country');
  const rawCity = firstHeader(req, 'x-vercel-ip-city');
  const city = rawCity ? decodeURIComponent(rawCity) : undefined;
  const ipHash = hashIp(resolveClientIp(req));
  const { browser, os } = parseUserAgent(userAgent);

  const signatureAudit: SignatureAudit = { method };
  if (country) signatureAudit.country = country;
  if (city) signatureAudit.city = city;
  if (ipHash) signatureAudit.ipHash = ipHash;
  if (userAgent) signatureAudit.userAgent = userAgent.slice(0, 512);
  if (browser) signatureAudit.browser = browser;
  if (os) signatureAudit.os = os;

  const updatedProposal: Proposal = {
    ...proposal,
    status: 'approved',
    updatedAt: signedAt,
    isLocked: true,
    lockedAt: signedAt,
    lockedReason: 'signed',
    data: {
      ...proposal.data,
      signatures: {
        ...proposal.data.signatures,
        client: {
          ...proposal.data.signatures.client,
          signatureData,
          signedAt,
          signatureAudit,
        },
      },
    },
  };

  try {
    await Promise.all([
      sharedRef.set(updatedProposal),
      db.collection('proposals').doc(id).set(updatedProposal),
    ]);
  } catch (error) {
    console.error('[proposal-sign] failed to write signature:', error);
    return NextResponse.json({ error: 'Failed to save signature' }, { status: 500 });
  }

  const historyId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  db.collection('proposal_history').doc(historyId).set({
    id: historyId,
    proposalId: id,
    timestamp: signedAt,
    editorName: proposal.data.signatures.client.name,
    editorEmail: proposal.data.signatures.client.email,
    sectionChanged: 'signatures',
    changeType: 'signed',
    summary: `Proposal signed by ${proposal.data.signatures.client.name}`,
  }).catch(err => console.error('[proposal-sign] history write failed:', err));

  const baseUrl = new URL(req.url).origin;
  fetch(`${baseUrl}/api/send-notification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'proposal-signed',
      proposalId: id,
      proposalTitle: proposal.title,
      clientName: proposal.clientName,
      agencyEmail: proposal.data.signatures.agency.email,
      signedAt,
    }),
  }).catch(err => console.error('[proposal-sign] notification failed:', err));

  return NextResponse.json({ ok: true, signedAt });
}
