import { NextResponse } from 'next/server';
import { getAllRunningScans } from '@/lib/scan-progress-store';
import { projectsService } from '@/services/database';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/scan-bulk/running-all
 * Returns all currently running scans across projects with lightweight project info.
 */
export async function GET() {
  const scans = getAllRunningScans();

  const scansWithProject = await Promise.all(
    scans.map(async (scan) => {
      let projectName = 'Project';

      try {
        const project = await projectsService.getProject(scan.projectId);
        if (project?.name) {
          projectName = project.name;
        }
      } catch {
        // Keep fallback project name if lookup fails.
      }

      return {
        scanId: scan.scanId,
        projectId: scan.projectId,
        projectName,
        status: scan.status,
        current: scan.current,
        total: scan.total,
        percentage: scan.total > 0 ? Math.round((scan.current / scan.total) * 100) : 0,
        currentUrl: scan.currentUrl,
        startedAt: scan.startedAt,
        scanCollections: scan.scanCollections,
      };
    })
  );

  scansWithProject.sort((a, b) => {
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });

  return NextResponse.json(
    {
      scans: scansWithProject,
      hasRunningScans: scansWithProject.length > 0,
    },
    { headers: corsHeaders }
  );
}
