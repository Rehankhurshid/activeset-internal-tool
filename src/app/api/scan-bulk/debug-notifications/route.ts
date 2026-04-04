import { NextResponse } from 'next/server';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
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

    // Get recently completed scan jobs
    const completedSnapshot = await getDocs(
      query(collection(db, COLLECTIONS.SCAN_JOBS), where('status', '==', 'completed'), limit(10))
    );
    const recentCompleted = completedSnapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        scanId: doc.id,
        projectName: d.projectName,
        status: d.status,
        current: d.current,
        total: d.total,
        completedAt: d.completedAt,
        startedAt: d.startedAt,
      };
    });

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
      recentCompleted,
      env: {
        hasSlackWebhook: !!process.env.SLACK_WEBHOOK_URL,
        slackWebhookPreview: process.env.SLACK_WEBHOOK_URL ? process.env.SLACK_WEBHOOK_URL.substring(0, 30) + '...' : 'NOT SET',
        hasSlackBot: !!process.env.SLACK_BOT_TOKEN,
        hasSlackChannel: !!process.env.SLACK_CHANNEL_ID,
        hasGmail: !!process.env.GMAIL_USER,
        allSlackEnvKeys: Object.keys(process.env).filter(k => k.toLowerCase().includes('slack')),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
