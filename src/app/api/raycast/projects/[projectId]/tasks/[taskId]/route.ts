import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse } from '@/lib/api-auth';
import { requireRaycastProjectAccess } from '@/lib/raycast-auth';
import {
  deleteRaycastTask,
  serializeRaycastTask,
  updateRaycastTask,
} from '@/lib/raycast-projects';
import type { Task } from '@/types';

export const runtime = 'nodejs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; taskId: string }> },
) {
  try {
    const { projectId, taskId } = await params;
    await requireRaycastProjectAccess(request, projectId);
    const body = (await request.json().catch(() => ({}))) as Partial<
      Pick<Task, 'title' | 'description' | 'category' | 'status' | 'priority' | 'dueDate' | 'assignee' | 'tags'>
    >;
    const task = await updateRaycastTask(projectId, taskId, body);
    return NextResponse.json({ ok: true, task: serializeRaycastTask(task) });
  } catch (error) {
    if (error instanceof ApiAuthError) return apiAuthErrorResponse(error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; taskId: string }> },
) {
  try {
    const { projectId, taskId } = await params;
    await requireRaycastProjectAccess(request, projectId);
    await deleteRaycastTask(projectId, taskId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ApiAuthError) return apiAuthErrorResponse(error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
