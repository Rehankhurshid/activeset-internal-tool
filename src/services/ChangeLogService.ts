import {
    collection,
    addDoc,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    doc,
    getDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logError } from '@/lib/errors';
import type { ChangeLogEntry, ExtendedContentSnapshot } from '@/types';

const CHANGE_LOG_COLLECTION = 'content_changes';

export const changeLogService = {
    /**
     * Save a new change log entry
     */
    async saveEntry(entry: Omit<ChangeLogEntry, 'id'>): Promise<string> {
        try {
            const docRef = await addDoc(collection(db, CHANGE_LOG_COLLECTION), {
                ...entry,
                timestamp: entry.timestamp || new Date().toISOString()
            });
            return docRef.id;
        } catch (error) {
            logError(error, 'changeLogService.saveEntry');
            console.error('Failed to save change log entry:', error);
            return '';
        }
    },

    /**
     * Get the most recent entry for a link (for comparison with new scan)
     */
    async getLatestEntry(linkId: string): Promise<ChangeLogEntry | null> {
        try {
            // Query without orderBy to avoid index requirement, sort in memory
            const q = query(
                collection(db, CHANGE_LOG_COLLECTION),
                where('linkId', '==', linkId)
            );

            const snapshot = await getDocs(q);
            if (snapshot.empty) return null;

            // Sort locally by timestamp descending
            const docs = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            } as ChangeLogEntry));

            docs.sort((a, b) =>
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );

            return docs[0];
        } catch (error) {
            logError(error, 'changeLogService.getLatestEntry');
            console.error('Failed to get latest change log entry:', error);
            return null;
        }
    },

    /**
     * Get full history for a link (for timeline display)
     */
    async getHistory(
        linkId: string,
        options: { limit?: number } = {}
    ): Promise<ChangeLogEntry[]> {
        try {
            const q = query(
                collection(db, CHANGE_LOG_COLLECTION),
                where('linkId', '==', linkId)
            );

            const snapshot = await getDocs(q);
            if (snapshot.empty) return [];

            // Sort locally and limit
            let docs = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            } as ChangeLogEntry));

            docs.sort((a, b) =>
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );

            if (options.limit) {
                docs = docs.slice(0, options.limit);
            }

            return docs;
        } catch (error) {
            logError(error, 'changeLogService.getHistory');
            console.error('Failed to get change log history:', error);
            return [];
        }
    },

    /**
     * Get changes across all pages in a project
     */
    async getProjectHistory(
        projectId: string,
        options: { limit?: number; changeType?: string } = {}
    ): Promise<ChangeLogEntry[]> {
        try {
            const q = query(
                collection(db, CHANGE_LOG_COLLECTION),
                where('projectId', '==', projectId)
            );

            const snapshot = await getDocs(q);
            if (snapshot.empty) return [];

            // Sort locally
            let docs = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            } as ChangeLogEntry));

            docs.sort((a, b) =>
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );

            // Filter by changeType if specified
            if (options.changeType) {
                docs = docs.filter(d => d.changeType === options.changeType);
            }

            if (options.limit) {
                docs = docs.slice(0, options.limit);
            }

            return docs;
        } catch (error) {
            logError(error, 'changeLogService.getProjectHistory');
            console.error('Failed to get project change history:', error);
            return [];
        }
    },

    /**
     * Get a specific entry by ID
     */
    async getEntry(entryId: string): Promise<ChangeLogEntry | null> {
        try {
            const docRef = doc(db, CHANGE_LOG_COLLECTION, entryId);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) return null;

            return { id: docSnap.id, ...docSnap.data() } as ChangeLogEntry;
        } catch (error) {
            logError(error, 'changeLogService.getEntry');
            console.error('Failed to get change log entry:', error);
            return null;
        }
    },

    /**
     * Get entries count for a link (useful for UI)
     */
    async getEntryCount(linkId: string): Promise<number> {
        try {
            const q = query(
                collection(db, CHANGE_LOG_COLLECTION),
                where('linkId', '==', linkId)
            );

            const snapshot = await getDocs(q);
            return snapshot.size;
        } catch (error) {
            logError(error, 'changeLogService.getEntryCount');
            return 0;
        }
    }
};
