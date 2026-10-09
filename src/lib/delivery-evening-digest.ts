import 'server-only';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { getBaseUrl } from '@/lib/base-url';

export interface PendingDeliveryUpdate {
  id: string;
  projectId: string;
  projectName: string;
  by: string;
  summary: string;
  kind: string;
  createdAt: Date;
}

function startOfLocalDayUtcForIst(now: Date): Date {
  // 7 PM IST digest includes everything since midnight IST (UTC+5:30).
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffsetMs);
  const istMidnight = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate());
  return new Date(istMidnight - istOffsetMs);
}

export async function gatherPendingDeliveryUpdates(now = new Date()): Promise<PendingDeliveryUpdate[] | null> {
  if (!hasFirebaseAdminCredentials) return null;

  const since = startOfLocalDayUtcForIst(now);
  const projectSnap = await adminDb.collection(COLLECTIONS.PROJECTS).select('name').limit(400).get();
  const names = new Map(projectSnap.docs.map((d) => [d.id, String(d.data().name ?? 'Untitled')]));

  const updatesSnap = await adminDb.collectionGroup('delivery_updates').limit(500).get();
  const pending: PendingDeliveryUpdate[] = [];

  for (const doc of updatesSnap.docs) {
    const data = doc.data() as {
      by?: string;
      summary?: string;
      kind?: string;
      createdAt?: { toDate?: () => Date };
      digestSentAt?: string | null;
    };
    if (data.digestSentAt) continue;

    const createdAt = data.createdAt?.toDate?.() ?? new Date(0);
    if (createdAt < since) continue;

    const projectId = doc.ref.parent.parent?.id;
    if (!projectId) continue;

    pending.push({
      id: doc.id,
      projectId,
      projectName: names.get(projectId) ?? 'Untitled project',
      by: data.by ?? 'unknown',
      summary: data.summary ?? 'Update',
      kind: data.kind ?? 'checklist',
      createdAt,
    });
  }

  pending.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return pending;
}

export async function markDeliveryUpdatesDigested(
  refs: { projectId: string; updateId: string }[],
  at = new Date(),
): Promise<void> {
  const iso = at.toISOString();
  const batch = adminDb.batch();
  for (const ref of refs) {
    const docRef = adminDb
      .collection(COLLECTIONS.PROJECTS)
      .doc(ref.projectId)
      .collection('delivery_updates')
      .doc(ref.updateId);
    batch.update(docRef, { digestSentAt: iso });
  }
  await batch.commit();
}

export function deliveryDigestBaseUrl(): string {
  return getBaseUrl();
}
