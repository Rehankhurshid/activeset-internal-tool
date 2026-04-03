import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { getRequestBaseUrl, triggerScanJobProcessing } from '@/lib/scan-job-dispatch';
import { processScanJobBatch } from '@/services/ScanJobService';

export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) return true;
  return request.headers.get('x-cron-secret') === expectedSecret;
}

/**
 * Process one durable scan batch. Each invocation handles a small number of pages
 * then re-queues itself if more work remains.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { scanId } = await request.json();

    if (!scanId) {
      return NextResponse.json({ error: 'Missing scanId' }, { status: 400 });
    }

    const baseUrl = getRequestBaseUrl(request.headers.get('host'));
    waitUntil((async () => {
      const result = await processScanJobBatch(scanId);

      if (result.status === 'running') {
        await triggerScanJobProcessing(baseUrl, scanId);
      }
    })().catch((error) => {
      console.error(`[scan-bulk/process] Background batch failed for ${scanId}:`, error);
    }));

    return NextResponse.json({ accepted: true, scanId });
  } catch (error) {
    console.error('[scan-bulk/process] Failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to process scan batch',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
