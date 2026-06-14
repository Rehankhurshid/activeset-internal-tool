import { NextRequest, NextResponse } from 'next/server';
import {
  ApiAuthError,
  apiAuthErrorResponse,
  requireProjectAccess,
} from '@/lib/api-auth';
import { syncCreatedTasksToClickUp } from '@/lib/clickup-sync-create';
import { hasFirebaseAdminCredentials } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface SyncCreateBody {
  projectId?: string;
  taskIds?: string[];
}

/**
 * Push freshly-created local tasks to ClickUp as new tasks in the project's
 * bound list. One-way (app -> ClickUp); inbound updates are handled by the
 * webhook. Per-task failures are stored on the task by the shared sync helper.
 */
export async function POST(request: NextRequest) {
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  let body: SyncCreateBody | null = null;
  try {
    body = (await request.json()) as SyncCreateBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const projectId = body?.projectId?.trim();
  const taskIds = (body?.taskIds ?? []).map((value) => value.trim()).filter(Boolean);
  if (!projectId || taskIds.length === 0) {
    return NextResponse.json(
      { error: 'projectId and taskIds[] are required' },
      { status: 400 },
    );
  }

  try {
    await requireProjectAccess(request, projectId);
    const result = await syncCreatedTasksToClickUp(projectId, taskIds);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[clickup-sync-create] failed:', message);
    return NextResponse.json({ error: 'Sync failed', details: message }, { status: 500 });
  }
}
