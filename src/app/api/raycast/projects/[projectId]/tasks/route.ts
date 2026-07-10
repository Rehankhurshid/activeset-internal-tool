import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse } from '@/lib/api-auth';
import { requireRaycastProjectAccess } from '@/lib/raycast-auth';
import {
  createRaycastTask,
  loadRaycastTasks,
  serializeRaycastTask,
} from '@/lib/raycast-projects';
import { syncCreatedTasksToClickUp } from '@/lib/clickup-sync-create';
import type { TaskCategory, TaskPriority, TaskSource, TaskStatus } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    await requireRaycastProjectAccess(request, projectId);
    const tasks = await loadRaycastTasks(projectId);
    return NextResponse.json({ ok: true, tasks: tasks.map(serializeRaycastTask) });
  } catch (error) {
    if (error instanceof ApiAuthError) return apiAuthErrorResponse(error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const caller = await requireRaycastProjectAccess(request, projectId);
    const body = (await request.json().catch(() => ({}))) as {
      title?: string;
      description?: string;
      category?: TaskCategory;
      status?: TaskStatus;
      priority?: TaskPriority;
      dueDate?: string;
      tags?: string[];
      source?: TaskSource;
      assignee?: string;
    };

    const task = await createRaycastTask({
      projectId,
      title: body.title ?? '',
      description: body.description,
      category: body.category,
      status: body.status,
      priority: body.priority,
      dueDate: body.dueDate,
      tags: body.tags,
      source: body.source,
      assignee: body.assignee,
      createdBy: caller.email,
    });

    const clickupSync = await syncCreatedTasksToClickUp(projectId, [task.id]);
    const refreshedTasks = await loadRaycastTasks(projectId);
    const refreshedTask = refreshedTasks.find((item) => item.id === task.id) ?? task;

    return NextResponse.json({
      ok: true,
      task: serializeRaycastTask(refreshedTask),
      clickupSync,
    });
  } catch (error) {
    if (error instanceof ApiAuthError) return apiAuthErrorResponse(error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
