import { NextRequest, NextResponse } from 'next/server';
import { cancelScanJob, getScanJob } from '@/services/ScanJobService';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const { scanId } = await request.json();

    if (!scanId) {
      return NextResponse.json(
        { error: 'Missing scanId' },
        { status: 400, headers: corsHeaders }
      );
    }

    const job = await getScanJob(scanId);
    if (!job) {
      return NextResponse.json(
        { error: 'Scan not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    if (job.status !== 'queued' && job.status !== 'running') {
      return NextResponse.json(
        { error: 'Scan is not running', status: job.status },
        { status: 400, headers: corsHeaders }
      );
    }

    const cancelledJob = await cancelScanJob(scanId);
    if (!cancelledJob) {
      return NextResponse.json(
        { error: 'Failed to cancel scan' },
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Scan cancelled.',
        scanId,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('[scan-bulk/cancel] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
