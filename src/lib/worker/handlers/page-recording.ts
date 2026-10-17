import { promises as fs } from 'node:fs';
import { FieldValue } from 'firebase-admin/firestore';
import os from 'node:os';
import path from 'node:path';
import { db as adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { NO_VIDEO_STORE, videoStore, videoStoreFor } from '@/lib/page-recording/video-store';
import { ffmpegVersion, NO_FFMPEG, recordPage } from '@/lib/page-recording/recorder';
import {
  recordableUrlProblem,
  type PageRecording,
  type RecordingSource,
} from '@/modules/delivery/domain/delivery.recording';

/**
 * `page_recording`: one page of the Pages table, as a 60 fps scroll-through video.
 *
 * The app writes `recording: { status: 'queued', … }` on the page and queues
 * this job in the same batch. From here on the worker owns the field: it says
 * `recording` with a progress figure while the frames are captured, then
 * `done` with a link (Bunny, or Firebase Storage on a machine without Bunny),
 * or `failed` with the reason. The Pages table reads
 * the page document it already subscribes to, so it needs no job listener.
 */

export interface PageRecordingPayload {
  pageId: string;
  source: RecordingSource;
  url: string;
  /** For the navigation bar: "Record Pricing". */
  pageTitle?: string;
}

export interface PageRecordingResult {
  pageId: string;
  videoUrl: string;
  durationSec: number;
  bytes: number;
}

type Progress = (message: string, fraction?: number) => Promise<void>;

function pageRef(projectId: string, pageId: string) {
  return adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId).collection(COLLECTIONS.PROJECT_PAGES).doc(pageId);
}

/** Dotted paths, so a field the app wrote (who asked, when) is not wiped. */
function recordingPatch(fields: Partial<PageRecording>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [`recording.${key}`, value]),
  );
}

function storagePath(projectId: string, pageId: string, source: RecordingSource, stamp: string, ext: string): string {
  const safe = (value: string) => value.replace(/[^A-Za-z0-9_-]+/g, '-');
  return `recordings/${safe(projectId)}/${safe(pageId)}-${source}-${stamp}.${ext}`;
}

export async function runPageRecording(
  jobId: string,
  projectId: string,
  payload: PageRecordingPayload,
  progress: Progress,
): Promise<PageRecordingResult> {
  const ref = pageRef(projectId, payload.pageId);
  const write = (fields: Partial<PageRecording>) => ref.update(recordingPatch(fields)).catch(() => undefined);

  try {
    // Checked again here: the app is not the only thing that can write a job.
    const problem = recordableUrlProblem(payload.url);
    if (problem) throw new Error(`${problem}: ${payload.url}`);
    const store = videoStore();
    if (!store) throw new Error(NO_VIDEO_STORE);
    if (!ffmpegVersion()) throw new Error(NO_FFMPEG);

    const snapshot = await ref.get();
    if (!snapshot.exists) throw new Error('That page is no longer on the tracker');
    const previous = (snapshot.data() as { recording?: PageRecording }).recording;

    await ref
      .update({ ...recordingPatch({ status: 'recording', progress: 0, jobId }), 'recording.error': FieldValue.delete() })
      .catch(() => undefined);
    let lastWrite = 0;

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'page-recording-'));
    try {
      const videoFile = path.join(dir, 'video.mp4');
      const posterFile = path.join(dir, 'poster.jpg');
      const result = await recordPage({
        url: payload.url,
        outputPath: videoFile,
        posterPath: posterFile,
        onProgress: async (fraction, message) => {
          await progress(message, fraction);
          // The page document is what the table watches; every few seconds is plenty.
          if (Date.now() - lastWrite > 3000) {
            lastWrite = Date.now();
            await write({ progress: Math.round(fraction * 100) / 100 });
          }
        },
      });

      await progress('Uploading the video', 0.99);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const videoPath = storagePath(projectId, payload.pageId, payload.source, stamp, 'mp4');
      const posterPath = storagePath(projectId, payload.pageId, payload.source, stamp, 'jpg');
      const videoUrl = await store.put(videoPath, await fs.readFile(videoFile), 'video/mp4');
      const posterUrl = await store.put(posterPath, await fs.readFile(posterFile), 'image/jpeg').catch(() => null);

      await ref.update({
        recording: {
          ...(previous?.requestedBy ? { requestedBy: previous.requestedBy } : {}),
          requestedAt: previous?.requestedAt ?? new Date().toISOString(),
          status: 'done',
          source: payload.source,
          sourceUrl: payload.url,
          jobId,
          videoUrl,
          videoPath,
          ...(posterUrl ? { posterUrl, posterPath } : {}),
          storage: store.kind,
          durationSec: result.durationSec,
          width: result.width,
          height: result.height,
          bytes: result.bytes,
          recordedAt: new Date().toISOString(),
        } satisfies PageRecording,
      });

      // The new one is safely in place; the one it replaces can go.
      // It may be in the other store, if a different machine made it.
      const oldStore = previous?.videoPath ? videoStoreFor(previous.storage) : null;
      for (const old of [previous?.videoPath, previous?.posterPath]) {
        if (oldStore && old && old !== videoPath && old !== posterPath) await oldStore.remove(old).catch(() => undefined);
      }

      return { pageId: payload.pageId, videoUrl, durationSec: result.durationSec, bytes: result.bytes };
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  } catch (error) {
    await write({ status: 'failed', error: (error instanceof Error ? error.message : String(error)).slice(0, 500) });
    throw error;
  }
}
