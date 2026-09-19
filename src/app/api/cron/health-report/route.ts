import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { getRequestBaseUrl } from '@/lib/scan-job-dispatch';
import { loadAllProjectsAdmin } from '@/services/ScanJobService';
import { generateHealthReport } from '@/services/HealthReportGenerator';
import { healthReportService } from '@/services/HealthReportService';
import { sendHealthReportNotifications } from '@/services/NotificationService';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Daily, a few hours after the scans start: the health report across every
 * active project, from whatever the scans have written by now. Separated from
 * the scan cron so it never depends on the scans having finished inside one
 * function's lifetime.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured (firebase-admin)' }, { status: 503 });
  }

  try {
    const projects = (await loadAllProjectsAdmin()).filter(
      (p) => (p.status || 'current') === 'current' && (p.links ?? []).some((l) => l.source === 'auto'),
    );
    const report = generateHealthReport(projects);
    const reportId = await healthReportService.createReport(report);
    console.log(
      `[health-report] ${reportId}: ${report.totalIssues} issues across ${report.projectCount} projects`,
    );

    const baseUrl = getRequestBaseUrl(request.headers.get('host'));
    await sendHealthReportNotifications({ ...report, id: reportId }, baseUrl);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      reportId,
      projectCount: report.projectCount,
      totalIssues: report.totalIssues,
    });
  } catch (error) {
    console.error('[health-report] Failed:', error);
    return NextResponse.json(
      { error: 'Health report failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
