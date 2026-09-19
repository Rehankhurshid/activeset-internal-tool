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
import { toSafeDate } from '@/lib/firestore-dates';
import {
    ProjectChecklist,
    ChecklistSection,
    ChecklistItem,
    ChecklistItemStatus,
    SOPTemplate,
} from '@/types';
import { COLLECTIONS } from '@/lib/constants';
import { getTemplateById, getDefaultTemplate, SOP_TEMPLATES } from '@/lib/sop-templates';
import { DatabaseError, logError } from '@/lib/errors';
// The one place a service reaches into a module: the diff between a project's
// checklist and its template is delivery's own idea of what counts as process.
import { applyImprovements, type Improvement } from '@/modules/delivery/domain/delivery.feedback';

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
 *
 * Copying field by field is what makes a project's checklist its own — it can be
 * edited afterwards without touching the template. The cost is that a field
 * forgotten here is silently dropped on the way in, which is exactly what used
 * to happen to every note, assignee and reference link an author wrote: the
 * template carried them and the project never saw them. Spreading the item and
 * then replacing the id keeps new fields working by default, so the next one
 * added to `ChecklistItem` does not have to be remembered here.
 */
function instantiateTemplate(template: SOPTemplate): ChecklistSection[] {
    return template.sections.map((section) => stripUndefined({
        ...section,
        id: `sec_${generateId()}`,
        items: section.items.map((item) => stripUndefined({
            ...item,
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
        createdAt: toSafeDate(data.createdAt),
        updatedAt: toSafeDate(data.updatedAt),
    } as ProjectChecklist;
}

export const checklistService = {

    /**
     * Create a checklist for a project from one or more templates.
     * Merges sections from all provided templates.
     */
    async createChecklist(projectId: string, templateIds: string | string[]): Promise<string> {
        try {
            const tIds = Array.isArray(templateIds) ? templateIds : [templateIds];
            const templates: SOPTemplate[] = [];

            for (const tId of tIds) {
                let template: SOPTemplate | undefined;

                if (tId) {
                    // Try static templates first
                    template = getTemplateById(tId);

                    // If not found, try Firestore
                    if (!template) {
                        const docRef = doc(db, COLLECTIONS.SOP_TEMPLATES, tId);
                        const docSnap = await getDoc(docRef);
                        if (docSnap.exists()) {
                            template = { id: docSnap.id, ...docSnap.data() } as SOPTemplate;
                        }
                    }
                }

                if (template) {
                    templates.push(template);
                }
            }

            // Fallback to default if no templates found at all
            if (templates.length === 0) {
                const defaultTemplate = getDefaultTemplate();
                if (defaultTemplate) templates.push(defaultTemplate);
            }

            if (templates.length === 0) throw new DatabaseError(`No valid templates found for IDs: ${tIds.join(', ')}`);

            // Merge sections from all templates
            const mergedSections: ChecklistSection[] = [];
            templates.forEach(t => {
                const newSections = instantiateTemplate(t);
                // Adjust order to append sequentially
                newSections.forEach((s) => {
                    s.order = mergedSections.length;
                    mergedSections.push(s);
                });
            });

            // Use the name of the first template (or a combined name)
            const templateName = templates.map(t => t.name).join(' + ');
            const primaryTemplateId = templates[0]?.id || 'custom';

            const checklist: Omit<ProjectChecklist, 'id'> = {
                projectId,
                templateId: primaryTemplateId, // Use first ID as primary ref
                // All of them, so a merged checklist can offer improvements back
                // to every template it came from rather than only the first.
                templateIds: templates.map(t => t.id),
                templateName,
                createdAt: new Date(),
                updatedAt: new Date(),
                sections: mergedSections,
            };

            const docRef = await addDoc(collection(db, CHECKLISTS_COLLECTION), checklist);
            return docRef.id;
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

    /**
     * Save a custom SOP template to Firestore.
     */
    async saveSOPTemplate(template: SOPTemplate): Promise<string> {
        try {
            // Ensure no undefined values
            const cleanTemplate = stripUndefined(template);
            const ref = await addDoc(collection(db, COLLECTIONS.SOP_TEMPLATES), {
                ...cleanTemplate,
                createdAt: Timestamp.now(),
            });
            return ref.id;
        } catch (error) {
            logError(error, 'saveSOPTemplate');
            throw new DatabaseError('Failed to save SOP template');
        }
    },

    /**
     * Get all SOP templates — merges built-in static templates with Firestore ones.
     */
    async getSOPTemplates(): Promise<SOPTemplate[]> {
        try {
            // Built-in (static) templates
            const builtIn: SOPTemplate[] = SOP_TEMPLATES.map(t => ({
                ...t,
                isBuiltIn: true,
            }));

            // Firestore (user-created) templates
            const snap = await getDocs(collection(db, COLLECTIONS.SOP_TEMPLATES));
            const custom: SOPTemplate[] = snap.docs.map(d => ({
                id: d.id,
                ...d.data(),
                isBuiltIn: false,
            } as SOPTemplate));

            return [...builtIn, ...custom];
        } catch (error) {
            logError(error, 'getSOPTemplates');
            throw new DatabaseError('Failed to fetch SOP templates');
        }
    },

    /**
     * One SOP template by id, built-in or custom.
     *
     * Built-ins live in `src/lib/sop-templates.ts` and come back flagged
     * `isBuiltIn`, which callers have to honour: there is no document behind
     * them to write to.
     */
    async getSOPTemplate(templateId: string): Promise<SOPTemplate | null> {
        const builtIn = SOP_TEMPLATES.find((t) => t.id === templateId);
        if (builtIn) return { ...builtIn, isBuiltIn: true };
        try {
            const snap = await getDoc(doc(db, COLLECTIONS.SOP_TEMPLATES, templateId));
            if (!snap.exists()) return null;
            return { id: snap.id, ...snap.data(), isBuiltIn: false } as SOPTemplate;
        } catch (error) {
            logError(error, 'getSOPTemplate');
            throw new DatabaseError('Failed to fetch the SOP template');
        }
    },

    /**
     * Fold what a project learned back into the template it came from.
     *
     * This is the only write that travels from a project towards the process, so
     * it deliberately does the smallest thing: the caller has already chosen
     * which improvements to send, and the whole sections array is rewritten from
     * the result rather than patched field by field.
     *
     * A built-in template is code and cannot be written to. Saying so plainly
     * beats a write that appears to succeed and is gone on the next deploy.
     */
    async saveTemplateImprovements(
        templateId: string,
        improvements: Improvement[],
    ): Promise<void> {
        if (improvements.length === 0) return;

        const template = await this.getSOPTemplate(templateId);
        if (!template) throw new DatabaseError('That SOP template no longer exists');
        if (template.isBuiltIn) {
            throw new DatabaseError(
                'This project follows a built-in template, which ships with the app and cannot be edited. Duplicate it in the Checklist Creator first, and improvements will have somewhere to go.',
            );
        }

        const next = applyImprovements(template, improvements);
        await this.updateSOPTemplate(templateId, { sections: next.sections });
    },

    /**
     * Generic update for item details (notes, assignee, referenceLink, hoverImage, status).
     */
    async updateChecklistItemDetails(
        checklistId: string,
        sectionId: string,
        itemId: string,
        updates: Partial<ChecklistItem>
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

                        const updatedItem = { ...item, ...updates };
                        // Handle status change side-effects
                        if (updates.status && updates.status === 'completed' && item.status !== 'completed') {
                            updatedItem.completedAt = new Date().toISOString();
                        }

                        return updatedItem;
                    }),
                };
            });

            const ref = doc(db, CHECKLISTS_COLLECTION, checklistId);
            await updateDoc(ref, { sections: stripUndefined(sections), updatedAt: Timestamp.now() });
        } catch (error) {
            logError(error, 'updateChecklistItemDetails');
            throw new DatabaseError('Failed to update item details');
        }
    },

    // Structure Editing Methods

    /**
     * Update entire sections array (for reordering).
     */
    async updateSections(checklistId: string, sections: ChecklistSection[]): Promise<void> {
        try {
            const ref = doc(db, CHECKLISTS_COLLECTION, checklistId);
            await updateDoc(ref, {
                sections: stripUndefined(sections),
                updatedAt: Timestamp.now()
            });
        } catch (error) {
            logError(error, 'updateSections');
            throw new DatabaseError('Failed to update sections');
        }
    },

    /**
     * Add a new section to a checklist.
     */
    async addSection(checklistId: string, section: ChecklistSection): Promise<void> {
        try {
            const checklist = await this.getChecklist(checklistId);
            if (!checklist) throw new DatabaseError('Checklist not found');

            // Generate unique ID if not present
            const newSection = {
                ...section,
                id: section.id || `sec_${generateId()}`
            };

            const updatedSections = [...checklist.sections, newSection];

            await this.updateSections(checklistId, updatedSections);
        } catch (error) {
            logError(error, 'addSection');
            throw new DatabaseError('Failed to add section');
        }
    },

    /**
     * Delete a section.
     */
    async deleteSection(checklistId: string, sectionId: string): Promise<void> {
        try {
            const checklist = await this.getChecklist(checklistId);
            if (!checklist) throw new DatabaseError('Checklist not found');

            const updatedSections = checklist.sections.filter(s => s.id !== sectionId);
            await this.updateSections(checklistId, updatedSections);
        } catch (error) {
            logError(error, 'deleteSection');
            throw new DatabaseError('Failed to delete section');
        }
    },

    /**
     * Add an item to a section.
     */
    async addItem(checklistId: string, sectionId: string, item: ChecklistItem): Promise<void> {
        try {
            const checklist = await this.getChecklist(checklistId);
            if (!checklist) throw new DatabaseError('Checklist not found');

            // Generate unique ID if not present
            const newItem = {
                ...item,
                id: item.id || `item_${generateId()}`
            };

            const updatedSections = checklist.sections.map(section => {
                if (section.id !== sectionId) return section;
                return {
                    ...section,
                    items: [...section.items, newItem]
                };
            });

            await this.updateSections(checklistId, updatedSections);
        } catch (error) {
            logError(error, 'addItem');
            throw new DatabaseError('Failed to add item');
        }
    },

    /**
     * Delete an item from a section.
     */
    async deleteItem(checklistId: string, sectionId: string, itemId: string): Promise<void> {
        try {
            const checklist = await this.getChecklist(checklistId);
            if (!checklist) throw new DatabaseError('Checklist not found');

            const updatedSections = checklist.sections.map(section => {
                if (section.id !== sectionId) return section;
                return {
                    ...section,
                    items: section.items.filter(i => i.id !== itemId)
                };
            });

            await this.updateSections(checklistId, updatedSections);
        } catch (error) {
            logError(error, 'deleteItem');
            throw new DatabaseError('Failed to delete item');
        }
    },

    /**
     * Update a section's details (title, emoji).
     */
    async updateSectionDetails(checklistId: string, sectionId: string, updates: Partial<ChecklistSection>): Promise<void> {
        try {
            const checklist = await this.getChecklist(checklistId);
            if (!checklist) throw new DatabaseError('Checklist not found');

            const updatedSections = checklist.sections.map(section => {
                if (section.id !== sectionId) return section;
                return { ...section, ...updates };
            });

            await this.updateSections(checklistId, updatedSections);
        } catch (error) {
            logError(error, 'updateSectionDetails');
            throw new DatabaseError('Failed to update section details');
        }
    },

    // ── Template Management Methods ──────────────────────────────────

    /**
     * Update an existing SOP template in Firestore.
     */
    async updateSOPTemplate(templateId: string, updates: Partial<SOPTemplate>): Promise<void> {
        try {
            const ref = doc(db, COLLECTIONS.SOP_TEMPLATES, templateId);
            const clean = stripUndefined(updates) as Record<string, unknown>;
            // A template's identity and its built-in flag are not editable, so
            // they are dropped rather than written back.
            const payload = Object.fromEntries(
                Object.entries(clean).filter(([key]) => key !== 'id' && key !== 'isBuiltIn'),
            );
            await updateDoc(ref, {
                ...payload,
                updatedAt: Timestamp.now(),
            });
        } catch (error) {
            logError(error, 'updateSOPTemplate');
            throw new DatabaseError('Failed to update SOP template');
        }
    },

    /**
     * Delete a custom SOP template from Firestore.
     */
    async deleteSOPTemplate(templateId: string): Promise<void> {
        try {
            await deleteDoc(doc(db, COLLECTIONS.SOP_TEMPLATES, templateId));
        } catch (error) {
            logError(error, 'deleteSOPTemplate');
            throw new DatabaseError('Failed to delete SOP template');
        }
    },

    /**
     * Duplicate a template — works for both built-in and custom templates.
     * Returns the new template's Firestore ID.
     */
    async duplicateSOPTemplate(templateId: string): Promise<string> {
        try {
            // Try static first, then Firestore
            let source: SOPTemplate | undefined = getTemplateById(templateId);

            if (!source) {
                const docSnap = await getDoc(doc(db, COLLECTIONS.SOP_TEMPLATES, templateId));
                if (docSnap.exists()) {
                    source = { id: docSnap.id, ...docSnap.data() } as SOPTemplate;
                }
            }

            if (!source) throw new DatabaseError(`Template ${templateId} not found`);

            const copy: Omit<SOPTemplate, 'id'> = {
                name: `${source.name} (Copy)`,
                description: source.description,
                icon: source.icon,
                sections: source.sections,
            };

            const ref = await addDoc(collection(db, COLLECTIONS.SOP_TEMPLATES), {
                ...stripUndefined(copy),
                createdAt: Timestamp.now(),
            });
            return ref.id;
        } catch (error) {
            logError(error, 'duplicateSOPTemplate');
            if (error instanceof DatabaseError) throw error;
            throw new DatabaseError('Failed to duplicate SOP template');
        }
    },
};
