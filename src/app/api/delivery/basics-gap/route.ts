import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse, requireCaller } from '@/lib/api-auth';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { basicsGap } from '@/modules/delivery/domain/delivery.basics';
import { refineBasicsGap } from '@/lib/jev-basics';
import { hasJevCredentials, JevUnavailableError } from '@/lib/jev';
import type { ProjectChecklist } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/delivery/basics-gap — which standard steps a checklist is missing,
 * judged rather than guessed.
 *
 * The browser already computes this with `basicsGap`, which shortlists by
 * counting shared words. That is fine for finding candidates and bad at the
 * actual question, which is whether two differently worded steps ask for the
 * same work. This re-runs the same gap and puts each candidate pair to Jev.
 *
 * It exists as a route rather than a function the dialog calls because the Jev
 * key is server-only and must never reach the browser. The dialog shows the
 * cheap answer immediately and replaces it with this one when it lands, so a
 * slow or absent judgment costs nothing.
 *
 * The checklist is re-read here from its id rather than accepted from the
 * request body: what the client believes the checklist says is not a safe
 * basis for deciding what to write back to it.
 */
export async function POST(req: NextRequest) {
  try {
    await requireCaller(req);
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    throw err;
  }

  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server is not configured' }, { status: 503 });
  }

  let body: { checklistId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const checklistId = typeof body.checklistId === 'string' ? body.checklistId.trim() : '';
  if (!checklistId) {
    return NextResponse.json({ error: 'checklistId is required' }, { status: 400 });
  }

  const snap = await adminDb.collection(COLLECTIONS.PROJECT_CHECKLISTS).doc(checklistId).get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const checklist = { id: snap.id, ...(snap.data() as object) } as ProjectChecklist;
  const gap = basicsGap(checklist);

  if (!hasJevCredentials()) {
    // Honest about it: the caller keeps its own word-overlap answer rather than
    // being told this one was judged when it was not.
    return NextResponse.json({ gap, judged: false, reason: 'no-key' });
  }

  const existingTitles = (checklist.sections ?? []).flatMap((section) =>
    (section.items ?? []).map((item) => item.title),
  );

  try {
    const refined = await refineBasicsGap(gap, existingTitles);
    return NextResponse.json({ gap: refined, judged: true });
  } catch (err) {
    // A judgment failing is not a reason to fail the request. The unjudged gap
    // is exactly what the browser already has, so the dialog still works.
    const reason = err instanceof JevUnavailableError ? err.message : 'judgment failed';
    console.warn('[basics-gap] falling back to the unjudged gap:', reason);
    return NextResponse.json({ gap, judged: false, reason });
  }
}
