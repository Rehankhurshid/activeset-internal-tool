import { NextResponse } from 'next/server';
import { collection, getDocs, limit, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/constants';
import { getAllActiveScanJobs } from '@/services/ScanJobService';

/**
 * Debug endpoint to check notification state. Remove after debugging.
 */
export async function GET() {
  try {
    // Get recent scan notifications
    const notificationsSnapshot = await getDocs(
      query(collection(db, COLLECTIONS.SCAN_NOTIFICATIONS), limit(20))
    );
    const notifications = notificationsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Get active scan jobs
    const activeJobs = await getAllActiveScanJobs();

    return NextResponse.json({
      notifications,
      activeJobs: activeJobs.map((j) => ({
        scanId: j.scanId,
        projectName: j.projectName,
        status: j.status,
        current: j.current,
        total: j.total,
        completedAt: j.completedAt,
      })),
      env: {
        hasSlackWebhook: !!process.env.SLACK_WEBHOOK_URL,
        hasSlackBot: !!process.env.SLACK_BOT_TOKEN,
        hasSlackChannel: !!process.env.SLACK_CHANNEL_ID,
        hasGmail: !!process.env.GMAIL_USER,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
