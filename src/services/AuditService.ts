import {
    collection,
    addDoc,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    deleteDoc,
    doc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DatabaseError, logError } from '@/lib/errors';
import { COLLECTIONS } from '@/lib/constants';

// We'll use a new collection for audit logs
const AUDIT_LOGS_COLLECTION = 'audit_logs';

/**
 * Recursively remove undefined values from an object.
 * Firestore doesn't accept undefined values - only null or omission is allowed.
 */
function removeUndefined<T>(obj: T): T {
    if (obj === null || obj === undefined) {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => removeUndefined(item)) as unknown as T;
    }
    if (typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            if (value !== undefined) {
                result[key] = removeUndefined(value);
            }
        }
        return result as T;
    }
    return obj;
}

export interface AuditLogEntry {
    projectId: string;
    linkId: string;
    url: string;
    timestamp: string; // ISO string
    fullHash: string;
    contentHash: string;
    htmlSource: string; // The full page source
    diffPatch?: string | null; // Unified diff against previous version
    screenshot?: string; // DEPRECATED: Base64 PNG (for backward compatibility with old logs)
    screenshotUrl?: string; // URL to screenshot in Firebase Storage
    fieldChanges?: Array<{
        field: string;
        oldValue: unknown;
        newValue: unknown;
        changeType: 'added' | 'removed' | 'modified';
    }>; // Detailed field-level changes
    blocks?: Array<{
        id: string;
        heading: string;
        tag?: string;
        html: string;
        selector: string;
        index: number;
    }>; // Content blocks for smart diff
    textElements?: Array<{
        selector: string;
        text: string;
        html: string;
    }>; // Text elements for granular DOM diff
}

export const auditService = {
    // Save a new audit log with source
    async saveAuditLog(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<string> {
        try {
            // Truncate htmlSource if it exceeds ~900KB to leave room for other fields
            // Firestore limit is 1MB (1,048,576 bytes)
            let safeEntry = { ...entry };
            if (entry.htmlSource && entry.htmlSource.length > 900000) {
                console.warn(`[AuditService] Truncating large htmlSource (${entry.htmlSource.length} bytes) for link ${entry.linkId}`);
                safeEntry.htmlSource = entry.htmlSource.substring(0, 900000) + '... (truncated)';
            }

            // Remove undefined values - Firestore doesn't accept undefined
            const cleanedEntry = removeUndefined({
                ...safeEntry,
                timestamp: new Date().toISOString()
            });

            const docRef = await addDoc(collection(db, AUDIT_LOGS_COLLECTION), cleanedEntry);
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
    },

    // Get the N most recent audit logs for a link (for current/previous comparison)
    async getRecentAuditLogs(projectId: string, linkId: string, count: number = 2): Promise<AuditLogEntry[]> {
        try {
            const q = query(
                collection(db, AUDIT_LOGS_COLLECTION),
                where('projectId', '==', projectId),
                where('linkId', '==', linkId)
            );

            const snapshot = await getDocs(q);
            if (snapshot.empty) return [];

            // Manual sort locally and take the first N
            const docs = snapshot.docs.map(d => d.data() as AuditLogEntry);
            docs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            return docs.slice(0, count);
        } catch (error) {
            logError(error, 'getRecentAuditLogs');
            return [];
        }
    },

    // Delete all audit logs for a given link (used during sitemap sync cleanup)
    async deleteAuditLogsForLink(linkId: string): Promise<number> {
        try {
            const q = query(
                collection(db, AUDIT_LOGS_COLLECTION),
                where('linkId', '==', linkId)
            );

            const snapshot = await getDocs(q);
            if (snapshot.empty) return 0;

            // Delete all matching docs
            const deletePromises = snapshot.docs.map(docSnapshot =>
                deleteDoc(doc(db, AUDIT_LOGS_COLLECTION, docSnapshot.id))
            );
            await Promise.all(deletePromises);

            return snapshot.size;
        } catch (error) {
            logError(error, 'deleteAuditLogsForLink');
            console.error('Failed to delete audit logs:', error);
            return 0;
        }
    },

    /**
     * Delete audit logs older than specified days
     * Keeps the most recent N logs per link to preserve history
     * @param maxAgeDays - Delete logs older than this many days
     * @param keepPerLink - Keep at least this many logs per link (default: 2)
     * @returns Number of deleted documents
     */
    async cleanupOldAuditLogs(maxAgeDays: number = 30, keepPerLink: number = 2): Promise<{ deleted: number; kept: number }> {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
            const cutoffTimestamp = cutoffDate.toISOString();

            console.log(`[AuditService] Cleaning up audit logs older than ${cutoffTimestamp}`);

            // Get all audit logs (we need to group by linkId)
            const q = query(collection(db, AUDIT_LOGS_COLLECTION));
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                return { deleted: 0, kept: 0 };
            }

            // Group logs by linkId
            const logsByLink = new Map<string, { id: string; timestamp: string }[]>();

            snapshot.docs.forEach(docSnapshot => {
                const data = docSnapshot.data();
                const linkId = data.linkId as string;
                const timestamp = data.timestamp as string;

                if (!logsByLink.has(linkId)) {
                    logsByLink.set(linkId, []);
                }
                logsByLink.get(linkId)!.push({ id: docSnapshot.id, timestamp });
            });

            const toDelete: string[] = [];
            let kept = 0;

            // For each link, keep the most recent N logs, delete old ones
            for (const [linkId, logs] of logsByLink) {
                // Sort by timestamp descending (newest first)
                logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

                // Keep the first N logs
                const logsToKeep = logs.slice(0, keepPerLink);
                const logsToCheck = logs.slice(keepPerLink);

                kept += logsToKeep.length;

                // From remaining logs, delete those older than cutoff
                for (const log of logsToCheck) {
                    if (log.timestamp < cutoffTimestamp) {
                        toDelete.push(log.id);
                    } else {
                        kept++;
                    }
                }
            }

            // Delete in batches of 500 (Firestore limit)
            const batchSize = 500;
            for (let i = 0; i < toDelete.length; i += batchSize) {
                const batch = toDelete.slice(i, i + batchSize);
                const deletePromises = batch.map(docId =>
                    deleteDoc(doc(db, AUDIT_LOGS_COLLECTION, docId))
                );
                await Promise.all(deletePromises);
                console.log(`[AuditService] Deleted batch ${Math.floor(i / batchSize) + 1}: ${batch.length} logs`);
            }

            console.log(`[AuditService] Cleanup complete: deleted ${toDelete.length}, kept ${kept}`);
            return { deleted: toDelete.length, kept };

        } catch (error) {
            logError(error, 'cleanupOldAuditLogs');
            console.error('Failed to cleanup old audit logs:', error);
            return { deleted: 0, kept: 0 };
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

    static async getRecentAuditLogs(projectId: string, linkId: string, count: number = 2): Promise<AuditLogEntry[]> {
        return auditService.getRecentAuditLogs(projectId, linkId, count);
    }

    static async deleteAuditLogsForLink(linkId: string): Promise<number> {
        return auditService.deleteAuditLogsForLink(linkId);
    }

    static async cleanupOldAuditLogs(maxAgeDays: number = 30, keepPerLink: number = 2): Promise<{ deleted: number; kept: number }> {
        return auditService.cleanupOldAuditLogs(maxAgeDays, keepPerLink);
    }
}
