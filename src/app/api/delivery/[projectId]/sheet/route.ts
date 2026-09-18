import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse, requireProjectAccess } from '@/lib/api-auth';
import { GoogleApiError, parseSpreadsheetId } from '@/lib/google-api';
import {
  applySheetImport,
  previewSheetImport,
  shareTrackerSheet,
  syncTrackerSheet,
} from '@/lib/delivery-sheet-sync';

export const runtime = 'nodejs';
// Writing a few hundred rows to Sheets is comfortably slower than a normal
// request, and the default would cut a large site's first sync short.
export const maxDuration = 60;

/**
 * The tracker sheet: generate it, push the current pages to it, share it, or
 * read an existing one in.
 *
 * POST /api/delivery/[projectId]/sheet
 *   { action: 'sync' }                              → create on first call, then overwrite
 *   { action: 'share', email }                      → grant read access
 *   { action: 'preview-import', sheetUrl, tab? }    → read a sheet, change nothing
 *   { action: 'import', sheetUrl, tab? }            → read it and apply
 *
 * Team-only. The client reads the sheet through Google, never through this app.
 */

type Body = {
  action?: 'sync' | 'share' | 'preview-import' | 'import';
  email?: string;
  sheetUrl?: string;
  tab?: string;
};

function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
  if (err instanceof GoogleApiError) {
    // `configuration` marks the failures a person can fix without a deploy,
    // so the UI can show the instruction rather than a stack trace.
    return NextResponse.json({ error: err.message, configuration: err.configuration }, { status: err.status });
  }
  console.error('[delivery/sheet] failed:', err);
  return NextResponse.json({ error: 'The tracker sheet could not be updated' }, { status: 500 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  try {
    await requireProjectAccess(req, projectId);
    const body = (await req.json().catch(() => ({}))) as Body;

    switch (body.action) {
      case 'sync':
        return NextResponse.json(await syncTrackerSheet(projectId));

      case 'share': {
        const email = body.email?.trim();
        if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
        }
        await shareTrackerSheet(projectId, email);
        return NextResponse.json({ ok: true, email });
      }

      case 'preview-import':
      case 'import': {
        const spreadsheetId = parseSpreadsheetId(body.sheetUrl ?? '');
        if (!spreadsheetId) {
          return NextResponse.json({ error: 'That does not look like a Google Sheets link' }, { status: 400 });
        }
        const preview = await previewSheetImport(projectId, spreadsheetId, body.tab);
        if (body.action === 'preview-import') return NextResponse.json(preview);
        if (preview.rows.length === 0) {
          return NextResponse.json(
            { error: 'No page rows were found in that sheet. Check the tab has a "Page" or "Planned" column.' },
            { status: 400 },
          );
        }
        return NextResponse.json(await applySheetImport(projectId, preview.rows));
      }

      default:
        return NextResponse.json(
          { error: 'action must be sync, share, preview-import or import' },
          { status: 400 },
        );
    }
  } catch (err) {
    return errorResponse(err);
  }
}
