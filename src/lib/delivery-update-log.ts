import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/constants';

export type DeliveryUpdateKind = 'checklist' | 'page' | 'agent';

export interface DeliveryUpdatePayload {
  by: string;
  summary: string;
  kind: DeliveryUpdateKind;
}

/**
 * Append-only log for the 7 PM delivery digest. Written from the browser when
 * the team ticks checklist steps or moves page statuses.
 */
export async function logDeliveryUpdate(projectId: string, payload: DeliveryUpdatePayload): Promise<void> {
  const by = payload.by?.toLowerCase().trim();
  if (!projectId || !by || !payload.summary.trim()) return;

  await addDoc(collection(db, COLLECTIONS.PROJECTS, projectId, 'delivery_updates'), {
    by,
    summary: payload.summary.trim(),
    kind: payload.kind,
    createdAt: serverTimestamp(),
    digestSentAt: null,
  });

  const at = new Date().toISOString();
  updateDoc(doc(db, COLLECTIONS.PROJECTS, projectId), {
    'delivery.lastDevActivityAt': at,
    'clientFacing.lastUpdateAt': at,
    'clientFacing.lastUpdateBy': by,
  }).catch(() => {});
}
