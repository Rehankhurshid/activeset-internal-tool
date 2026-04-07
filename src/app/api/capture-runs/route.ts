import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  const projectName = request.nextUrl.searchParams.get('projectName');

  if (!projectName) {
    return NextResponse.json({ error: 'projectName is required' }, { status: 400 });
  }

  try {
    // Query capture_runs where projectName contains the search term (case-sensitive)
    // The CLI stores names like "muffins-website" while projects store "Muffins"
    // So we query all and filter client-side for flexibility
    const snapshot = await db
      .collection('capture_runs')
      .where('status', '==', 'complete')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const runs = snapshot.docs
      .filter((doc) => {
        const name = (doc.data().projectName || '').toLowerCase();
        return name.includes(projectName.toLowerCase());
      })
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
