import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import * as admin from 'firebase-admin';
import { db, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

const IP_HASH_SALT = process.env.PROPOSAL_VIEW_IP_SALT || 'proposal-view-ip-salt';

const BOT_UA_PATTERN = /(bot|crawler|spider|preview|facebookexternalhit|slackbot|discordbot|vercelbot|linkedinbot|twitterbot|whatsapp|telegram|lighthouse|headlesschrome|pingdom|uptimerobot|gtmetrix)/i;

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

  const userAgent = firstHeader(req, 'user-agent');
  if (userAgent && BOT_UA_PATTERN.test(userAgent)) {
    return NextResponse.json({ ok: true, skipped: 'bot' });
  }

  const sharedRef = db.collection('shared_proposals').doc(id);
  const sharedSnap = await sharedRef.get();
  if (!sharedSnap.exists) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const ipHash = hashIp(resolveClientIp(req));
  const referrer = firstHeader(req, 'referer');
  const country = firstHeader(req, 'x-vercel-ip-country');
  const city = firstHeader(req, 'x-vercel-ip-city');

  const viewDoc: Record<string, unknown> = {
    proposalId: id,
    viewedAt: nowIso,
  };
  if (ipHash) viewDoc.ipHash = ipHash;
  if (userAgent) viewDoc.userAgent = userAgent.slice(0, 512);
  if (referrer) viewDoc.referrer = referrer.slice(0, 512);
  if (country) viewDoc.country = country;
  if (city) viewDoc.city = decodeURIComponent(city);

  try {
    const viewRef = await db.collection('proposal_views').add(viewDoc);

    const existing = sharedSnap.data() as { firstViewedAt?: string } | undefined;
    const counterUpdate: Record<string, unknown> = {
      viewCount: admin.firestore.FieldValue.increment(1),
      lastViewedAt: nowIso,
    };
    if (!existing?.firstViewedAt) counterUpdate.firstViewedAt = nowIso;
    if (country) counterUpdate.lastViewCountry = country;
    if (city) counterUpdate.lastViewCity = decodeURIComponent(city);

    await Promise.all([
      db.collection('proposals').doc(id).set(counterUpdate, { merge: true }),
      sharedRef.set(counterUpdate, { merge: true }),
    ]);

    return NextResponse.json({ ok: true, viewId: viewRef.id });
  } catch (error) {
    console.error('[proposal-view] failed to record view:', error);
    return NextResponse.json({ error: 'Failed to record view' }, { status: 500 });
  }
}
