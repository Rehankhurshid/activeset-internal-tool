import { NextRequest, NextResponse } from 'next/server';
import {
  ApiAuthError,
  apiAuthErrorResponse,
  requireProjectAccess,
} from '@/lib/api-auth';
import { ClickUpError } from '@/lib/clickup';
import { hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import {
  syncTaskUpdateToClickUp,
  type SyncUpdatePatch,
} from '@/lib/clickup-sync-update';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface SyncUpdateBody {
  projectId?: string;
  taskId?: string;
  patch?: SyncUpdatePatch;
  expectedRequestId?: string;
  forceFullState?: boolean;
}

/**
 * Push a partial update to a linked ClickUp task. Handles any subset of
 * `{ title, description, status, priority, dueDate, assignee }`. Failures
 * stamp `clickupSyncError` / `clickupSyncFailedAt` on the local task; the
 * local edit is preserved either way.
 */
export async function POST(request: NextRequest) {
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  let body: SyncUpdateBody | null = null;
  try {
    body = (await request.json()) as SyncUpdateBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const projectId = body?.projectId?.trim();
  const taskId = body?.taskId?.trim();
  const patch = body?.patch ?? {};
  const expectedRequestId = body?.expectedRequestId?.trim() || null;
  const forceFullState = Boolean(body?.forceFullState);
  if (!projectId || !taskId) {
    return NextResponse.json(
      { error: 'projectId and taskId are required' },
      { status: 400 },
    );
  }
  if (Object.keys(patch).length === 0 && !forceFullState) {
    return NextResponse.json({ ok: true, skipped: 'empty-patch' });
  }

  try {
    await requireProjectAccess(request, projectId);
    const result = await syncTaskUpdateToClickUp(projectId, taskId, {
      patch,
      expectedRequestId,
      forceFullState,
    });
    if (!result.ok && result.reason === 'Task not found') {
      return NextResponse.json({ error: result.reason }, { status: 404 });
    }
    if (!result.ok && result.reason === 'Task does not belong to this project') {
      return NextResponse.json({ error: result.reason }, { status: 403 });
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    if (err instanceof ClickUpError) {
      return NextResponse.json(
        { error: 'ClickUp request failed', details: err.message },
        { status: err.status ?? 502 },
      );
    }
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[clickup-sync-update] failed:', message);
    return NextResponse.json({ error: 'Sync failed', details: message }, { status: 500 });
  }
}
