import {
    collection,
    doc,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    where,
    Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
    ProjectChecklist,
    ChecklistSection,
    ChecklistItem,
    ChecklistItemStatus,
    SOPTemplate,
} from '@/types';
import { COLLECTIONS } from '@/lib/constants';
import { getTemplateById, getDefaultTemplate } from '@/lib/sop-templates';
import { DatabaseError, logError } from '@/lib/errors';

const CHECKLISTS_COLLECTION = COLLECTIONS.PROJECT_CHECKLISTS;

const generateId = (): string =>
    `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Firestore rejects `undefined` values. Strip them from objects recursively.
 */
function stripUndefined<T>(obj: T): T {
    if (Array.isArray(obj)) {
        return obj.map(stripUndefined) as T;
    }
    if (obj !== null && typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj as Record<string, unknown>)
                .filter(([, v]) => v !== undefined)
                .map(([k, v]) => [k, stripUndefined(v)])
        ) as T;
    }
    return obj;
}

/**
 * Instantiate a template into concrete ChecklistSections with unique IDs.
 */
function instantiateTemplate(template: SOPTemplate): ChecklistSection[] {
    return template.sections.map((section) => stripUndefined({
        title: section.title,
        emoji: section.emoji,
        order: section.order,
        id: `sec_${generateId()}`,
        items: section.items.map((item) => stripUndefined({
            title: item.title,
            emoji: item.emoji,
            status: item.status,
            order: item.order,
            id: `item_${generateId()}`,
        })),
    }));
}

/**
 * Parse a Firestore doc into a ProjectChecklist.
 */
function parseChecklistDoc(docSnap: { id: string; data: () => Record<string, unknown> }): ProjectChecklist {
    const data = docSnap.data() as Record<string, unknown>;
    return {
        id: docSnap.id,
        ...data,
        createdAt: (data.createdAt as { toDate: () => Date }).toDate(),
        updatedAt: (data.updatedAt as { toDate: () => Date }).toDate(),
    } as ProjectChecklist;
}

export const checklistService = {

    /**
     * Create a checklist for a project from a template.
     */
    async createChecklist(projectId: string, templateId?: string): Promise<string> {
        try {
            const template = templateId ? getTemplateById(templateId) : getDefaultTemplate();
            if (!template) throw new DatabaseError(`Template "${templateId}" not found`);

            const sections = instantiateTemplate(template);

            const ref = await addDoc(collection(db, CHECKLISTS_COLLECTION), {
                projectId,
                templateId: template.id,
                templateName: template.name,
                sections,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            });
            return ref.id;
        } catch (error) {
            logError(error, 'createChecklist');
            if (error instanceof DatabaseError) throw error;
            throw new DatabaseError('Failed to create checklist');
        }
    },

    /**
     * Get all checklists for a project.
     */
    async getChecklistsForProject(projectId: string): Promise<ProjectChecklist[]> {
        try {
            const q = query(
                collection(db, CHECKLISTS_COLLECTION),
                where('projectId', '==', projectId)
            );
            const snap = await getDocs(q);
            return snap.docs.map(parseChecklistDoc);
        } catch (error) {
            logError(error, 'getChecklistsForProject');
            throw new DatabaseError('Failed to fetch checklists');
        }
    },

    /**
     * Get a single checklist by ID.
     */
    async getChecklist(checklistId: string): Promise<ProjectChecklist | null> {
        const ref = doc(db, CHECKLISTS_COLLECTION, checklistId);
        const snap = await getDoc(ref);
        return snap.exists() ? parseChecklistDoc(snap) : null;
    },

    /**
     * Real-time subscription to all checklists for a project.
     */
    subscribeToProjectChecklists(
        projectId: string,
        callback: (checklists: ProjectChecklist[]) => void
    ): () => void {
        const q = query(
            collection(db, CHECKLISTS_COLLECTION),
            where('projectId', '==', projectId)
        );

        return onSnapshot(q, (snap) => {
            const checklists = snap.docs.map(parseChecklistDoc);
            callback(checklists);
        });
    },

    /**
     * Update the status of a single checklist item.
     */
    async updateItemStatus(
        checklistId: string,
        sectionId: string,
        itemId: string,
        status: ChecklistItemStatus,
        userEmail?: string
    ): Promise<void> {
        try {
            const checklist = await this.getChecklist(checklistId);
            if (!checklist) throw new DatabaseError('Checklist not found');

            const sections = checklist.sections.map((section) => {
                if (section.id !== sectionId) return section;
                return {
                    ...section,
                    items: section.items.map((item) => {
                        if (item.id !== itemId) return item;
                        return {
                            ...item,
                            status,
                            completedAt: status === 'completed' ? new Date().toISOString() : item.completedAt,
                            completedBy: status === 'completed' ? (userEmail ?? item.completedBy) : item.completedBy,
                        };
                    }),
                };
            });

            const ref = doc(db, CHECKLISTS_COLLECTION, checklistId);
            await updateDoc(ref, { sections: stripUndefined(sections), updatedAt: Timestamp.now() });
        } catch (error) {
            logError(error, 'updateItemStatus');
            if (error instanceof DatabaseError) throw error;
            throw new DatabaseError('Failed to update item status');
        }
    },

    /**
     * Update notes for a checklist item.
     */
    async updateItemNotes(
        checklistId: string,
        sectionId: string,
        itemId: string,
        notes: string
    ): Promise<void> {
        try {
            const checklist = await this.getChecklist(checklistId);
            if (!checklist) throw new DatabaseError('Checklist not found');

            const sections = checklist.sections.map((section) => {
                if (section.id !== sectionId) return section;
                return {
                    ...section,
                    items: section.items.map((item) =>
                        item.id === itemId ? { ...item, notes } : item
                    ),
                };
            });

            const ref = doc(db, CHECKLISTS_COLLECTION, checklistId);
            await updateDoc(ref, { sections: stripUndefined(sections), updatedAt: Timestamp.now() });
        } catch (error) {
            logError(error, 'updateItemNotes');
            if (error instanceof DatabaseError) throw error;
            throw new DatabaseError('Failed to update item notes');
        }
    },

    /**
     * Update the assignee for a checklist item.
     */
    async updateItemAssignee(
        checklistId: string,
        sectionId: string,
        itemId: string,
        assignee: string
    ): Promise<void> {
        try {
            const checklist = await this.getChecklist(checklistId);
            if (!checklist) throw new DatabaseError('Checklist not found');

            const sections = checklist.sections.map((section) => {
                if (section.id !== sectionId) return section;
                return {
                    ...section,
                    items: section.items.map((item) =>
                        item.id === itemId ? { ...item, assignee } : item
                    ),
                };
            });

            const ref = doc(db, CHECKLISTS_COLLECTION, checklistId);
            await updateDoc(ref, { sections: stripUndefined(sections), updatedAt: Timestamp.now() });
        } catch (error) {
            logError(error, 'updateItemAssignee');
            if (error instanceof DatabaseError) throw error;
            throw new DatabaseError('Failed to update item assignee');
        }
    },

    /**
     * Delete a checklist.
     */
    async deleteChecklist(checklistId: string): Promise<void> {
        try {
            const ref = doc(db, CHECKLISTS_COLLECTION, checklistId);
            await deleteDoc(ref);
        } catch (error) {
            logError(error, 'deleteChecklist');
            throw new DatabaseError('Failed to delete checklist');
        }
    },

    /**
     * Delete all checklists for a project (used when deleting a project).
     */
    async deleteProjectChecklists(projectId: string): Promise<void> {
        try {
            const checklists = await this.getChecklistsForProject(projectId);
            await Promise.all(checklists.map((cl) => this.deleteChecklist(cl.id)));
        } catch (error) {
            logError(error, 'deleteProjectChecklists');
            throw new DatabaseError('Failed to delete project checklists');
        }
    },
};
