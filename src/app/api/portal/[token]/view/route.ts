import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import * as admin from 'firebase-admin';
import { db, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { portalAuthErrorResponse, requirePortalToken } from '@/lib/client-portal-auth';
import { touchPortalToken } from '@/lib/client-portal-tokens';

export const runtime = 'nodejs';

/**
 * POST /api/portal/[token]/view — the portal page's view beacon.
 *
 * Mirrors /api/proposals/[id]/view: skips crawlers and link-preview bots, hashes
 * the IP, records a row under `projects/{id}/portal_views` (a subcollection so
 * the Client tab can order by `viewedAt` without a composite index), bumps
 * counters under the project's `clientFacing` map, and stamps the token's
 * usage. This is the only place usage is counted — the page loader itself is
 * read-only, so unfurlers and previews never count. The counter merge never touches `updatedAt`, so
 * a client opening their page cannot reorder the team's project lists.
 *
 * The page sends `preview: true` for signed-in agency users and `?preview=1`
 * opens; those are acknowledged but not counted.
 */

const IP_HASH_SALT = process.env.PROPOSAL_VIEW_IP_SALT || 'client-portal-view-ip-salt';
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  try {
    const { projectId, tokenHash } = await requirePortalToken(token);

    const body = (await req.json().catch(() => ({}))) as { preview?: boolean };
    if (body?.preview === true) return NextResponse.json({ ok: true, skipped: 'preview' });

    const userAgent = firstHeader(req, 'user-agent');
    if (userAgent && BOT_UA_PATTERN.test(userAgent)) {
      return NextResponse.json({ ok: true, skipped: 'bot' });
    }

    const nowIso = new Date().toISOString();
    const ipHash = hashIp(resolveClientIp(req));
    const referrer = firstHeader(req, 'referer');
    const country = firstHeader(req, 'x-vercel-ip-country');
    const city = firstHeader(req, 'x-vercel-ip-city');

    const viewDoc: Record<string, unknown> = { projectId, tokenHash, viewedAt: nowIso };
    if (ipHash) viewDoc.ipHash = ipHash;
    if (userAgent) viewDoc.userAgent = userAgent.slice(0, 512);
    if (referrer) viewDoc.referrer = referrer.slice(0, 512);
    if (country) viewDoc.country = country;
    if (city) viewDoc.city = decodeURIComponent(city);

    const counters: Record<string, unknown> = {
      viewCount: admin.firestore.FieldValue.increment(1),
      lastViewedAt: nowIso,
    };
    if (country) counters.lastViewCountry = country;
    if (city) counters.lastViewCity = decodeURIComponent(city);

    const projectRef = db.collection(COLLECTIONS.PROJECTS).doc(projectId);
    await Promise.all([
      projectRef.collection(COLLECTIONS.CLIENT_PORTAL_VIEWS).add(viewDoc),
      // Nested merge: only the listed clientFacing.* keys change. No updatedAt.
      projectRef.set({ clientFacing: counters }, { merge: true }),
      touchPortalToken(tokenHash),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return portalAuthErrorResponse(err);
  }
}
