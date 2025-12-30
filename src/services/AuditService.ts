import {
    collection,
    addDoc,
    query,
    where,
    orderBy,
    limit,
    getDocs
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DatabaseError, logError } from '@/lib/errors';
import { COLLECTIONS } from '@/lib/constants';

// We'll use a new collection for audit logs
const AUDIT_LOGS_COLLECTION = 'audit_logs';

export interface AuditLogEntry {
    projectId: string;
    linkId: string;
    url: string;
    timestamp: string; // ISO string
    fullHash: string;
    contentHash: string;
    htmlSource: string; // The full page source
    diffPatch?: string; // Unified diff against previous version
}

export const auditService = {
    // Save a new audit log with source
    async saveAuditLog(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<string> {
        try {
            const docRef = await addDoc(collection(db, AUDIT_LOGS_COLLECTION), {
                ...entry,
                timestamp: new Date().toISOString()
            });
            return docRef.id;
        } catch (error) {
            logError(error, 'saveAuditLog');
            // Non-blocking error? If we fail to save log, we should probably warn but not fail the whole audit API
            console.error('Failed to save audit log:', error);
            return '';
        }
    },

    // Get the most recent previous audit log for a link
    async getLatestAuditLog(linkId: string): Promise<AuditLogEntry | null> {
        try {
            const q = query(
                collection(db, AUDIT_LOGS_COLLECTION),
                where('linkId', '==', linkId),
                orderBy('timestamp', 'desc'),
                limit(1)
            );

            const snapshot = await getDocs(q);
            if (snapshot.empty) return null;

            return snapshot.docs[0].data() as AuditLogEntry;
        } catch (error) {
            logError(error, 'getLatestAuditLog');
            return null;
        }
    }
};
