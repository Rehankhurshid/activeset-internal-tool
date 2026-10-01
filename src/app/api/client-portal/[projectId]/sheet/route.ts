import { NextRequest, NextResponse } from 'next/server';
import { hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { ApiAuthError, apiAuthErrorResponse, requireProjectAccess } from '@/lib/api-auth';
import {
  ProjectSheetError,
  bindProjectSheet,
  getProjectSheetRecord,
  serviceAccountEmail,
  syncProjectSheet,
  unbindProjectSheet,
  updateProjectSheetSettings,
  type ProjectSheetSettingsPatch,
} from '@/lib/project-sheet';
import type { ProjectSheetRecord } from '@/modules/client-portal/domain/project-sheet.types';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Caller = { email: string };

async function authorise(req: NextRequest, projectId: string): Promise<Caller | NextResponse> {
  let caller: Caller;
  try {
    caller = await requireProjectAccess(req, projectId);
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    throw err;
  }
  if (!hasFirebaseAdminCredentials) return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  return caller;
}

/** The record for the Client tab. The snapshot is already client-safe; the report is for the team. */
function stateOf(record: ProjectSheetRecord | null) {
  return { sheet: record, serviceAccountEmail: serviceAccountEmail() };
}

function failure(error: unknown) {
  if (error instanceof ProjectSheetError) {
    return NextResponse.json({ error: error.message, configuration: error.configuration }, { status: error.status });
  }
  console.error('[client-portal/sheet] failed:', error);
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Something went wrong' }, { status: 500 });
}

/**
 * GET /api/client-portal/[projectId]/sheet — the bound sheet, its last
 * snapshot and the reader's report. `project_sheets` is deny-by-default for
 * browsers, so this route is the team's only way in.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const caller = await authorise(req, projectId);
  if (caller instanceof NextResponse) return caller;
  try {
    return NextResponse.json(stateOf(await getProjectSheetRecord(projectId)));
  } catch (error) {
    return failure(error);
  }
}

/**
 * POST /api/client-portal/[projectId]/sheet
 *  - `{ action: 'bind', url }`   point the project at a sheet and read it
 *  - `{ action: 'sync' }`        read it again now
 *  - `{ action: 'settings', tab?, stagesFrom?, showSheetLink? }`
 *  - `{ action: 'unbind' }`      forget the sheet and its snapshot
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const caller = await authorise(req, projectId);
  if (caller instanceof NextResponse) return caller;

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    url?: unknown;
  } & ProjectSheetSettingsPatch;

  try {
    switch (body.action) {
      case 'bind':
        return NextResponse.json(stateOf(await bindProjectSheet(projectId, body.url, caller.email)));
      case 'sync':
        return NextResponse.json(stateOf(await syncProjectSheet(projectId)));
      case 'settings':
        return NextResponse.json(
          stateOf(
            await updateProjectSheetSettings(projectId, {
              tab: body.tab,
              stagesFrom: body.stagesFrom,
              showSheetLink: body.showSheetLink,
            }),
          ),
        );
      case 'unbind':
        await unbindProjectSheet(projectId);
        return NextResponse.json(stateOf(null));
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    return failure(error);
  }
}
