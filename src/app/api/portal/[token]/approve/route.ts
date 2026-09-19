import { NextRequest, NextResponse } from 'next/server';
import { db, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { portalAuthErrorResponse, requirePortalToken } from '@/lib/client-portal-auth';
import type { ChecklistSection, StageApproval } from '@/types';

export const runtime = 'nodejs';

/**
 * POST /api/portal/[token]/approve — the client signs off a review stage.
 *
 * This is the only write the portal accepts, so it is deliberately narrow.
 *
 * The body names a stage, and the stage is then looked up in the project's own
 * checklists and rejected unless it really carries the `client_review` role.
 * Nothing about where to write comes from the request: the project comes from
 * the token, and the only field touched is `delivery.approvals`. A caller
 * cannot name a different project, a different field, or a stage the team never
 * offered for approval.
 *
 * Approving does not tick any of our own checklist items. Somebody holding the
 * link is the client saying yes; it is not the team saying the work is done,
 * and conflating the two would let an unauthenticated URL complete internal
 * work. The team sees the approval and ticks their own step.
 *
 * Idempotent: approving twice leaves the first timestamp alone, because the
 * client double-tapping a button on a phone should not rewrite the record of
 * when they agreed.
 */

/** Matches the delivery module's `roleOf`, including the tag that came before roles. */
function roleOf(section: ChecklistSection): string | undefined {
  if (section.role) return section.role;
  if (section.stage === 'kickoff' || section.stage === 'launch') return section.stage;
  return undefined;
}

const MAX_NOTE = 2000;

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Temporarily unavailable' }, { status: 503 });
  }

  const { token } = await context.params;

  let projectId: string;
  try {
    ({ projectId } = await requirePortalToken(token));
  } catch (err) {
    return portalAuthErrorResponse(err);
  }

  let body: { stageKey?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const stageKey = typeof body.stageKey === 'string' ? body.stageKey.trim() : '';
  if (!stageKey) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, MAX_NOTE) : '';

  // The stage has to be one the team marked for client review on this project.
  const [checklistId, sectionId] = stageKey.split(':');
  if (!checklistId || !sectionId) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    const checklistSnap = await db.collection(COLLECTIONS.PROJECT_CHECKLISTS).doc(checklistId).get();
    const checklist = checklistSnap.data() as { projectId?: string; sections?: ChecklistSection[] } | undefined;

    // Belongs to this project, is a real section, and is genuinely up for review.
    if (!checklistSnap.exists || checklist?.projectId !== projectId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const section = (checklist.sections ?? []).find((s) => s.id === sectionId);
    if (!section || roleOf(section) !== 'client_review') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const projectRef = db.collection(COLLECTIONS.PROJECTS).doc(projectId);

    // A transaction because two taps land at once more often than anyone
    // expects, and the first answer is the one that should survive.
    const approval = await db.runTransaction(async (tx) => {
      const snap = await tx.get(projectRef);
      const existing = ((snap.data()?.delivery?.approvals ?? []) as StageApproval[]).filter(
        (a) => a && typeof a.stageKey === 'string',
      );

      const already = existing.find((a) => a.stageKey === stageKey);
      if (already) return already;

      const next: StageApproval = {
        stageKey,
        stageTitle: section.title,
        approvedAt: new Date().toISOString(),
        ...(note ? { note } : {}),
      };

      // Merged, and `updatedAt` is deliberately left alone: every project list
      // sorts by it, and a client approving must not reorder the team's board.
      tx.set(projectRef, { delivery: { approvals: [...existing, next] } }, { merge: true });
      return next;
    });

    return NextResponse.json({ ok: true, approvedAt: approval.approvedAt });
  } catch {
    // Nothing from the failure reaches the client: this endpoint is reachable
    // by anyone holding the link, so it says as little as possible.
    return NextResponse.json({ error: 'Could not record that' }, { status: 500 });
  }
}
