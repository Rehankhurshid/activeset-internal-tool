import {
    collection,
    addDoc,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    doc,
    getDoc,
    deleteDoc
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
    },

    /**
     * Delete all change log entries for a given link (used during sitemap sync cleanup)
     */
    async deleteEntriesForLink(linkId: string): Promise<number> {
        try {
            const q = query(
                collection(db, CHANGE_LOG_COLLECTION),
                where('linkId', '==', linkId)
            );

            const snapshot = await getDocs(q);
            if (snapshot.empty) return 0;

            // Delete all matching docs
            const deletePromises = snapshot.docs.map(docSnapshot =>
                deleteDoc(doc(db, CHANGE_LOG_COLLECTION, docSnapshot.id))
            );
            await Promise.all(deletePromises);

            return snapshot.size;
        } catch (error) {
            logError(error, 'changeLogService.deleteEntriesForLink');
            console.error('Failed to delete change log entries:', error);
            return 0;
        }
    },

    /**
     * Delete content change entries older than specified days
     * Keeps the most recent N entries per link to preserve history
     * @param maxAgeDays - Delete entries older than this many days
     * @param keepPerLink - Keep at least this many entries per link (default: 2)
     * @returns Number of deleted and kept documents
     */
    async cleanupOldEntries(maxAgeDays: number = 30, keepPerLink: number = 2): Promise<{ deleted: number; kept: number }> {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
            const cutoffTimestamp = cutoffDate.toISOString();

            console.log(`[ChangeLogService] Cleaning up entries older than ${cutoffTimestamp}`);

            // Get all entries
            const q = query(collection(db, CHANGE_LOG_COLLECTION));
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                return { deleted: 0, kept: 0 };
            }

            // Group entries by linkId
            const entriesByLink = new Map<string, { id: string; timestamp: string }[]>();
            
            snapshot.docs.forEach(docSnapshot => {
                const data = docSnapshot.data();
                const linkId = data.linkId as string;
                const timestamp = data.timestamp as string;
                
                if (!entriesByLink.has(linkId)) {
                    entriesByLink.set(linkId, []);
                }
                entriesByLink.get(linkId)!.push({ id: docSnapshot.id, timestamp });
            });

            const toDelete: string[] = [];
            let kept = 0;

            // For each link, keep the most recent N entries, delete old ones
            for (const [linkId, entries] of entriesByLink) {
                // Sort by timestamp descending (newest first)
                entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

                // Keep the first N entries
                const entriesToKeep = entries.slice(0, keepPerLink);
                const entriesToCheck = entries.slice(keepPerLink);

                kept += entriesToKeep.length;

                // From remaining entries, delete those older than cutoff
                for (const entry of entriesToCheck) {
                    if (entry.timestamp < cutoffTimestamp) {
                        toDelete.push(entry.id);
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
                    deleteDoc(doc(db, CHANGE_LOG_COLLECTION, docId))
                );
                await Promise.all(deletePromises);
                console.log(`[ChangeLogService] Deleted batch ${Math.floor(i / batchSize) + 1}: ${batch.length} entries`);
            }

            console.log(`[ChangeLogService] Cleanup complete: deleted ${toDelete.length}, kept ${kept}`);
            return { deleted: toDelete.length, kept };

        } catch (error) {
            logError(error, 'changeLogService.cleanupOldEntries');
            console.error('Failed to cleanup old change log entries:', error);
            return { deleted: 0, kept: 0 };
        }
    }
};
