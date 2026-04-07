import { db } from '@/lib/firebase-admin';
import { notFound } from 'next/navigation';
import CaptureViewer from './CaptureViewer';

interface CaptureRun {
  runId: string;
  projectName: string;
  createdAt: string;
  screenshotCount: number;
  screenshots: Array<{
    device: string;
    fileName: string;
    url: string;
    originalUrl: string;
  }>;
  summary: {
    totalUrls?: number;
    successfulUrls?: number;
    failedUrls?: number;
    totalDurationMs?: number;
  };
  settings: {
    devices?: string[];
    format?: string;
  };
}

export default async function CaptureRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;

  const doc = await db.collection('capture_runs').doc(runId).get();

  if (!doc.exists) {
    notFound();
  }

  const data = doc.data() as CaptureRun;

  return <CaptureViewer data={data} />;
}
