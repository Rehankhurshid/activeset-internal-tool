import { NextRequest, NextResponse } from 'next/server';
import { db, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { portalAuthErrorResponse, requirePortalToken } from '@/lib/client-portal-auth';
import { portalPageState } from '@/modules/client-portal/domain/portal-pages';
import { disciplineOwners } from '@/modules/delivery/domain/delivery.progress';
import { getStack } from '@/modules/delivery/domain/stacks';
import type { ProjectPage } from '@/modules/delivery/domain/delivery.types';
import type { Project } from '@/types';

export const runtime = 'nodejs';

/**
 * POST /api/portal/[token]/pages/approve — the client says "Looks good" to one
 * page we have built (Rehan, 2026-10-13: pages are reviewed one by one while
 * others are still being designed).
 *
 * As narrow as the stage approval beside it. The project comes from the token
 * and the page from the body, looked up under that project only; the page has
 * to be ready right now by the same rule the client's page shows
 * (`portalPageState`), and the only field written is `clientReview`. It ticks
 * nothing of ours, and the page's `updatedAt` is left alone so the team's grid
 * does not reorder.
 *
 * Idempotent: a second tap keeps the first time. The team reopening one of its
 * own columns (a rebuild for a new design revision) clears it, so the page
 * asks again.
 */
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

  let body: { pageId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const pageId = typeof body.pageId === 'string' ? body.pageId.trim() : '';
  // A Firestore id, never a path.
  if (!pageId || pageId.length > 200 || pageId.includes('/')) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    const projectRef = db.collection(COLLECTIONS.PROJECTS).doc(projectId);
    const pageRef = projectRef.collection(COLLECTIONS.PROJECT_PAGES).doc(pageId);

    const approvedAt = await db.runTransaction(async (tx) => {
      const [projectSnap, pageSnap] = await Promise.all([tx.get(projectRef), tx.get(pageRef)]);
      if (!projectSnap.exists || !pageSnap.exists) return null;
      const project = projectSnap.data() as Pick<Project, 'services' | 'delivery'>;
      const page = pageSnap.data() as Pick<ProjectPage, 'work' | 'clientReview'>;
      const stack = getStack(project.delivery?.stackId);
      const state = portalPageState(page, stack.disciplines, disciplineOwners(stack, project));
      if (state === 'approved') return page.clientReview!.approvedAt;
      if (state !== 'ready') return null;
      const at = new Date().toISOString();
      tx.update(pageRef, { clientReview: { approvedAt: at } });
      return at;
    });

    if (!approvedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true, approvedAt });
  } catch {
    // Reachable by anyone holding the link, so it says as little as possible.
    return NextResponse.json({ error: 'Could not record that' }, { status: 500 });
  }
}
