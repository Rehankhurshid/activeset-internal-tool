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
    diffPatch?: string | null; // Unified diff against previous version
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
    async getLatestAuditLog(projectId: string, linkId: string): Promise<AuditLogEntry | null> {
        try {
            // Query without orderBy first to avoid index requirements
            const q = query(
                collection(db, AUDIT_LOGS_COLLECTION),
                where('projectId', '==', projectId),
                where('linkId', '==', linkId)
                // orderBy('timestamp', 'desc') // Requires index, doing in memory for now
            );

            const snapshot = await getDocs(q);
            if (snapshot.empty) return null;

            // Manual sort locally
            const docs = snapshot.docs.map(d => d.data() as AuditLogEntry);
            docs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            return docs[0];
        } catch (error) {
            logError(error, 'getLatestAuditLog');
            return null;
        }
    }
};

// Static class wrapper for use in API routes
export class AuditService {
    static async saveAuditLog(entry: AuditLogEntry): Promise<string> {
        return auditService.saveAuditLog(entry);
    }

    static async getLatestAuditLog(projectId: string, linkId: string): Promise<AuditLogEntry | null> {
        return auditService.getLatestAuditLog(projectId, linkId);
    }
}
