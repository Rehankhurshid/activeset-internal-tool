import {
  collection,
  doc,
  getDocs,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/constants';
import { DailyHealthReport, CreateDailyHealthReportInput } from '@/types/health-report';

const REPORTS_COLLECTION = COLLECTIONS.HEALTH_REPORTS;

function docToReport(docSnap: { id: string; data: () => Record<string, unknown> }): DailyHealthReport {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
  } as DailyHealthReport;
}

export const healthReportService = {
  async createReport(report: CreateDailyHealthReportInput): Promise<string> {
    const colRef = collection(db, REPORTS_COLLECTION);
    const docRef = await addDoc(colRef, report);
    return docRef.id;
  },

  async getLatestReports(limitCount = 7): Promise<DailyHealthReport[]> {
    const q = query(
      collection(db, REPORTS_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docToReport);
  },

  subscribeToLatestReport(callback: (report: DailyHealthReport | null) => void): () => void {
    const q = query(
      collection(db, REPORTS_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    return onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        callback(null);
        return;
      }
      callback(docToReport(snapshot.docs[0]));
    });
  },
};
