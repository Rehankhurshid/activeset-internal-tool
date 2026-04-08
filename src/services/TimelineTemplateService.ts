import {
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    onSnapshot,
    Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
    ProjectTimeline,
    TimelineTemplate,
    TimelineTemplatePhase,
    TimelineTemplateMilestone,
} from '@/types';
import { COLLECTIONS } from '@/lib/constants';
import { DatabaseError, logError } from '@/lib/errors';
import { TIMELINE_TEMPLATES, getTimelineTemplate } from '@/lib/timeline-templates';

const TEMPLATES_COLLECTION = COLLECTIONS.TIMELINE_TEMPLATES;

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

function daysBetweenISO(startISO: string, endISO: string): number {
    const s = new Date(`${startISO}T00:00:00`);
    const e = new Date(`${endISO}T00:00:00`);
    return Math.round((e.getTime() - s.getTime()) / 86400000);
}

function parseTemplateDoc(snap: {
    id: string;
    data: () => Record<string, unknown>;
}): TimelineTemplate {
    const data = snap.data();
    return {
        id: snap.id,
        name: (data.name as string) ?? 'Untitled template',
        description: (data.description as string) ?? '',
        icon: (data.icon as string) ?? '📌',
        phases: (data.phases as TimelineTemplatePhase[]) ?? [],
        milestones: (data.milestones as TimelineTemplateMilestone[]) ?? [],
        isBuiltIn: false,
        createdAt:
            data.createdAt && typeof (data.createdAt as { toDate?: () => Date }).toDate === 'function'
                ? (data.createdAt as { toDate: () => Date }).toDate()
                : undefined,
        updatedAt:
            data.updatedAt && typeof (data.updatedAt as { toDate?: () => Date }).toDate === 'function'
                ? (data.updatedAt as { toDate: () => Date }).toDate()
                : undefined,
    };
}

/**
 * Convert a live ProjectTimeline into a template by capturing its phases
 * + milestones and anchoring dates as day offsets from the earliest start.
 */
export function timelineToTemplateShape(
    timeline: ProjectTimeline
): Pick<TimelineTemplate, 'phases' | 'milestones'> {
    const phases: TimelineTemplatePhase[] = [...timeline.phases]
        .sort((a, b) => a.order - b.order)
        .map((p, i) => ({
            title: p.title,
            color: p.color,
            order: i,
        }));

    // Map original phase id → new phaseIndex
    const phaseIdToIndex = new Map<string, number>();
    [...timeline.phases]
        .sort((a, b) => a.order - b.order)
        .forEach((p, i) => phaseIdToIndex.set(p.id, i));

    const sortedMilestones = [...timeline.milestones].sort(
        (a, b) => a.order - b.order
    );

    if (sortedMilestones.length === 0) {
        return { phases, milestones: [] };
    }

    // Anchor = earliest start date across all milestones
    const anchor = sortedMilestones
        .map((m) => m.startDate)
        .filter(Boolean)
        .sort()[0];

    const milestones: TimelineTemplateMilestone[] = sortedMilestones.map(
        (m, i) => {
            const startOffsetDays = anchor
                ? daysBetweenISO(anchor, m.startDate)
                : 0;
            const durationDays = Math.max(
                daysBetweenISO(m.startDate, m.endDate) + 1,
                1
            );
            return {
                title: m.title,
                status: 'not_started',
                phaseIndex:
                    m.phaseId !== undefined
                        ? phaseIdToIndex.get(m.phaseId)
                        : undefined,
                startDate: '',
                endDate: '',
                color: m.color,
                assignee: undefined,
                notes: m.notes,
                order: i,
                startOffsetDays,
                durationDays,
            };
        }
    );

    return { phases, milestones };
}

export const timelineTemplateService = {
    /** List built-in + custom templates in one call. */
    async listAll(): Promise<TimelineTemplate[]> {
        try {
            const builtIn = TIMELINE_TEMPLATES.map((t) => ({
                ...t,
                isBuiltIn: true,
            }));
            const snap = await getDocs(collection(db, TEMPLATES_COLLECTION));
            const custom = snap.docs.map((d) =>
                parseTemplateDoc({ id: d.id, data: () => d.data() })
            );
            return [...builtIn, ...custom];
        } catch (error) {
            logError(error, 'listAll timeline templates');
            return TIMELINE_TEMPLATES.map((t) => ({ ...t, isBuiltIn: true }));
        }
    },

    /** Real-time subscription to just the custom templates collection. */
    subscribeToCustomTemplates(
        callback: (templates: TimelineTemplate[]) => void
    ): () => void {
        const col = collection(db, TEMPLATES_COLLECTION);
        return onSnapshot(
            col,
            (snap) => {
                const custom = snap.docs.map((d) =>
                    parseTemplateDoc({ id: d.id, data: () => d.data() })
                );
                callback(custom);
            },
            (error) => {
                console.error('[timelineTemplateService] subscription error', error);
                callback([]);
            }
        );
    },

    /**
     * Look up a custom template by id. Falls back to the built-ins if the id
     * matches a static template. Returns undefined when missing.
     */
    async get(templateId: string): Promise<TimelineTemplate | undefined> {
        // Built-in check first (cheap, no network)
        const builtIn = getTimelineTemplate(templateId);
        if (builtIn) return { ...builtIn, isBuiltIn: true };

        try {
            const snap = await getDoc(doc(db, TEMPLATES_COLLECTION, templateId));
            if (!snap.exists()) return undefined;
            return parseTemplateDoc({ id: snap.id, data: () => snap.data() });
        } catch (error) {
            logError(error, 'get timeline template');
            return undefined;
        }
    },

    /**
     * Create a custom template. The id is generated by Firestore.
     * Returns the new template id.
     */
    async create(
        template: Omit<TimelineTemplate, 'id' | 'isBuiltIn' | 'createdAt' | 'updatedAt'>
    ): Promise<string> {
        try {
            const payload = stripUndefined({
                ...template,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            });
            const ref = await addDoc(collection(db, TEMPLATES_COLLECTION), payload);
            return ref.id;
        } catch (error) {
            logError(error, 'create timeline template');
            throw new DatabaseError('Failed to save template');
        }
    },

    /**
     * Replace an existing custom template's full contents. Refuses to
     * overwrite built-in templates.
     */
    async replace(
        templateId: string,
        template: Omit<TimelineTemplate, 'id' | 'isBuiltIn' | 'createdAt' | 'updatedAt'>
    ): Promise<void> {
        if (getTimelineTemplate(templateId)) {
            throw new DatabaseError('Built-in templates cannot be edited');
        }
        try {
            const ref = doc(db, TEMPLATES_COLLECTION, templateId);
            const existing = await getDoc(ref);
            const createdAt = existing.exists()
                ? (existing.data().createdAt ?? Timestamp.now())
                : Timestamp.now();
            await setDoc(
                ref,
                stripUndefined({
                    ...template,
                    createdAt,
                    updatedAt: Timestamp.now(),
                })
            );
        } catch (error) {
            logError(error, 'replace timeline template');
            if (error instanceof DatabaseError) throw error;
            throw new DatabaseError('Failed to update template');
        }
    },

    /** Delete a custom template. Refuses to delete built-ins. */
    async delete(templateId: string): Promise<void> {
        if (getTimelineTemplate(templateId)) {
            throw new DatabaseError('Built-in templates cannot be deleted');
        }
        try {
            await deleteDoc(doc(db, TEMPLATES_COLLECTION, templateId));
        } catch (error) {
            logError(error, 'delete timeline template');
            if (error instanceof DatabaseError) throw error;
            throw new DatabaseError('Failed to delete template');
        }
    },

    /** Convenience: save a live timeline as a new custom template. */
    async saveFromTimeline(
        timeline: ProjectTimeline,
        meta: { name: string; description: string; icon: string }
    ): Promise<string> {
        const shape = timelineToTemplateShape(timeline);
        return this.create({ ...meta, ...shape });
    },

    /** Convenience: overwrite an existing custom template with a live timeline. */
    async replaceFromTimeline(
        templateId: string,
        timeline: ProjectTimeline,
        meta: { name: string; description: string; icon: string }
    ): Promise<void> {
        const shape = timelineToTemplateShape(timeline);
        return this.replace(templateId, { ...meta, ...shape });
    },
};
