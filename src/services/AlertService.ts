import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/constants';
import { SiteAlert, CreateSiteAlertInput } from '@/types/alerts';

const ALERTS_COLLECTION = COLLECTIONS.SITE_ALERTS;

function docToAlert(docSnap: { id: string; data: () => Record<string, unknown> }): SiteAlert {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    projectId: data.projectId as string,
    projectName: data.projectName as string,
    type: data.type as SiteAlert['type'],
    severity: data.severity as SiteAlert['severity'],
    title: data.title as string,
    message: data.message as string,
    affectedPages: (data.affectedPages as SiteAlert['affectedPages']) || [],
    read: (data.read as boolean) ?? false,
    dismissed: (data.dismissed as boolean) ?? false,
    createdAt: data.createdAt as string,
    scanId: data.scanId as string | undefined,
  };
}

export const alertService = {
  async createAlerts(alerts: CreateSiteAlertInput[]): Promise<string[]> {
    const ids: string[] = [];
    const colRef = collection(db, ALERTS_COLLECTION);
    for (const alert of alerts) {
      const docRef = await addDoc(colRef, alert);
      ids.push(docRef.id);
    }
    return ids;
  },

  async getUnreadAlerts(limitCount = 50): Promise<SiteAlert[]> {
    const q = query(
      collection(db, ALERTS_COLLECTION),
      where('dismissed', '==', false),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docToAlert);
  },

  async getAllAlerts(limitCount = 50): Promise<SiteAlert[]> {
    const q = query(
      collection(db, ALERTS_COLLECTION),
      where('dismissed', '==', false),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docToAlert);
  },

  async markAsRead(alertId: string): Promise<void> {
    const docRef = doc(db, ALERTS_COLLECTION, alertId);
    await updateDoc(docRef, { read: true });
  },

  async markAllRead(): Promise<void> {
    const q = query(
      collection(db, ALERTS_COLLECTION),
      where('read', '==', false),
      where('dismissed', '==', false)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;

    const batch = writeBatch(db);
    snapshot.docs.forEach((d) => {
      batch.update(d.ref, { read: true });
    });
    await batch.commit();
  },

  async dismissAlert(alertId: string): Promise<void> {
    const docRef = doc(db, ALERTS_COLLECTION, alertId);
    await updateDoc(docRef, { dismissed: true });
  },

  subscribeToAlerts(
    callback: (alerts: SiteAlert[]) => void,
    options: { unreadOnly?: boolean; limitCount?: number } = {}
  ): () => void {
    const { unreadOnly = false, limitCount = 30 } = options;

    const constraints = [
      where('dismissed', '==', false),
      orderBy('createdAt', 'desc'),
      limit(limitCount),
    ];

    if (unreadOnly) {
      constraints.unshift(where('read', '==', false));
    }

    const q = query(collection(db, ALERTS_COLLECTION), ...constraints);

    return onSnapshot(q, (snapshot) => {
      const alerts = snapshot.docs.map(docToAlert);
      callback(alerts);
    });
  },
};
