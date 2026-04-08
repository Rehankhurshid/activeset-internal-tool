import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

function normalizeProjectKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function GET(request: NextRequest) {
  const projectName = request.nextUrl.searchParams.get('projectName')?.trim();

  if (!projectName) {
    return NextResponse.json({ error: 'projectName is required' }, { status: 400 });
  }

  const queryLower = projectName.toLowerCase();
  const queryKey = normalizeProjectKey(projectName);

  try {
    // Query all runs, then match by flexible name normalization.
    // This allows "DDE UHP" to match CLI runs named "dde-uhp" (and vice versa).
    const snapshot = await db
      .collection('capture_runs')
      .get();

    const runs = snapshot.docs
      .filter((doc) => {
        const data = doc.data();
        const name = (data.projectName || '').toLowerCase();
        const nameKey = normalizeProjectKey(name);
        const statusOk = !data.status || data.status === 'complete';
        const matchesText = name.includes(queryLower) || queryLower.includes(name);
        const matchesKey = Boolean(queryKey) && (nameKey.includes(queryKey) || queryKey.includes(nameKey));
        return statusOk && (matchesText || matchesKey);
      })
      .sort((a, b) => {
        const aTime = a.data().createdAt || '';
        const bTime = b.data().createdAt || '';
        return bTime > aTime ? 1 : bTime < aTime ? -1 : 0;
      })
      .slice(0, 50)
      .map((doc) => {
        const data = doc.data();
        return {
          runId: data.runId || doc.id,
          projectName: data.projectName,
          createdAt: data.createdAt,
          screenshotCount: data.screenshotCount || 0,
          screenshots: data.screenshots || [],
          settings: data.settings || {},
        };
      });

    return NextResponse.json({ runs });
  } catch (error) {
    console.error('[capture-runs] Failed to fetch:', error);
    return NextResponse.json({ error: 'Failed to fetch capture runs' }, { status: 500 });
  }
}
