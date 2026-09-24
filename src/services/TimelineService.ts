import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
    ProjectTimeline,
    TimelinePhase,
    TimelineMilestone,
    TimelineTemplate,
    TimelineTemplatePhase,
    TimelineTemplateMilestone,
} from '@/types';
import { COLLECTIONS } from '@/lib/constants';
import { DatabaseError, logError } from '@/lib/errors';
import { getTimelineTemplate } from '@/lib/timeline-templates';

const TIMELINES_COLLECTION = COLLECTIONS.PROJECT_TIMELINES;

const generateId = (): string =>
    `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/** Firestore rejects undefined — strip recursively. */
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

function parseTimelineDoc(snap: {
    id: string;
    data: () => Record<string, unknown>;
}): ProjectTimeline {
    const data = snap.data();
    return {
        id: snap.id,
        projectId: (data.projectId as string) ?? snap.id,
        phases: (data.phases as TimelinePhase[]) ?? [],
        milestones: (data.milestones as TimelineMilestone[]) ?? [],
        createdAt:
            data.createdAt && typeof (data.createdAt as { toDate?: () => Date }).toDate === 'function'
                ? (data.createdAt as { toDate: () => Date }).toDate()
                : new Date(),
        updatedAt:
            data.updatedAt && typeof (data.updatedAt as { toDate?: () => Date }).toDate === 'function'
                ? (data.updatedAt as { toDate: () => Date }).toDate()
                : new Date(),
    };
}

function addDaysISO(dateISO: string, days: number): string {
    const d = new Date(`${dateISO}T00:00:00`);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

function todayISO(): string {
    return new Date().toISOString().slice(0, 10);
}

export const timelineService = {
    /**
     * Real-time subscription to a single project's timeline.
     * The doc ID equals the projectId.
     */
    subscribeToProjectTimeline(
        projectId: string,
        callback: (timeline: ProjectTimeline | null) => void
    ): () => void {
        const ref = doc(db, TIMELINES_COLLECTION, projectId);
        return onSnapshot(
            ref,
            (snap) => {
                if (!snap.exists()) {
                    callback(null);
                    return;
                }
                callback(parseTimelineDoc(snap));
            },
            (error) => {
                console.error('[timelineService] subscription error', error);
                callback(null);
            }
        );
    },

    /** Lazy-create an empty timeline on first access. */
    async getOrCreateTimeline(projectId: string): Promise<ProjectTimeline> {
        try {
            const ref = doc(db, TIMELINES_COLLECTION, projectId);
            const snap = await getDoc(ref);
            if (snap.exists()) {
                return parseTimelineDoc(snap);
            }

            const now = Timestamp.now();
            const initial = {
                projectId,
                phases: [],
                milestones: [],
                createdAt: now,
                updatedAt: now,
            };
            await setDoc(ref, initial);
            return {
                id: projectId,
                projectId,
                phases: [],
                milestones: [],
                createdAt: now.toDate(),
                updatedAt: now.toDate(),
            };
        } catch (error) {
            logError(error, 'getOrCreateTimeline');
            throw new DatabaseError('Failed to load timeline');
        }
    },

    async _writeTimeline(
        projectId: string,
        updates: {
            phases?: TimelinePhase[];
            milestones?: TimelineMilestone[];
        }
    ): Promise<void> {
        const ref = doc(db, TIMELINES_COLLECTION, projectId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
            // Create with the update applied
            const now = Timestamp.now();
            await setDoc(
                ref,
                stripUndefined({
                    projectId,
                    phases: updates.phases ?? [],
                    milestones: updates.milestones ?? [],
                    createdAt: now,
                    updatedAt: now,
                })
            );
            return;
        }
        await updateDoc(
            ref,
            stripUndefined({
                ...updates,
                updatedAt: Timestamp.now(),
            })
        );
    },

    // --- Milestone CRUD ---

    async addMilestone(
        projectId: string,
        milestone: Omit<TimelineMilestone, 'id' | 'order' | 'createdAt' | 'updatedAt'>
    ): Promise<string> {
        try {
            const timeline = await this.getOrCreateTimeline(projectId);
            const nowISO = new Date().toISOString();
            const newMilestone: TimelineMilestone = {
                ...milestone,
                id: `ms_${generateId()}`,
                order: timeline.milestones.length,
                createdAt: nowISO,
                updatedAt: nowISO,
            };
            const milestones = [...timeline.milestones, newMilestone];
            await this._writeTimeline(projectId, { milestones });
            return newMilestone.id;
        } catch (error) {
            logError(error, 'addMilestone');
            if (error instanceof DatabaseError) throw error;
            throw new DatabaseError('Failed to add milestone');
        }
    },

    async updateMilestone(
        projectId: string,
        milestoneId: string,
        updates: Partial<TimelineMilestone>
    ): Promise<void> {
        try {
            const timeline = await this.getOrCreateTimeline(projectId);
            const nowISO = new Date().toISOString();
            const milestones = timeline.milestones.map((m) =>
                m.id === milestoneId ? { ...m, ...updates, updatedAt: nowISO } : m
            );
            await this._writeTimeline(projectId, { milestones });
        } catch (error) {
            logError(error, 'updateMilestone');
            if (error instanceof DatabaseError) throw error;
            throw new DatabaseError('Failed to update milestone');
        }
    },

    async deleteMilestone(projectId: string, milestoneId: string): Promise<void> {
        try {
            const timeline = await this.getOrCreateTimeline(projectId);
            const milestones = timeline.milestones
                .filter((m) => m.id !== milestoneId)
                .map((m, i) => ({ ...m, order: i }));
            await this._writeTimeline(projectId, { milestones });
        } catch (error) {
            logError(error, 'deleteMilestone');
            if (error instanceof DatabaseError) throw error;
            throw new DatabaseError('Failed to delete milestone');
        }
    },

    // --- Phase CRUD ---

    async addPhase(
        projectId: string,
        phase: Omit<TimelinePhase, 'id' | 'order'>
    ): Promise<string> {
        try {
            const timeline = await this.getOrCreateTimeline(projectId);
            const newPhase: TimelinePhase = {
                ...phase,
                id: `ph_${generateId()}`,
                order: timeline.phases.length,
            };
            const phases = [...timeline.phases, newPhase];
            await this._writeTimeline(projectId, { phases });
            return newPhase.id;
        } catch (error) {
            logError(error, 'addPhase');
            if (error instanceof DatabaseError) throw error;
            throw new DatabaseError('Failed to add phase');
        }
    },

    async updatePhase(
        projectId: string,
        phaseId: string,
        updates: Partial<TimelinePhase>
    ): Promise<void> {
        try {
            const timeline = await this.getOrCreateTimeline(projectId);
            const phases = timeline.phases.map((p) =>
                p.id === phaseId ? { ...p, ...updates } : p
            );
            await this._writeTimeline(projectId, { phases });
        } catch (error) {
            logError(error, 'updatePhase');
            if (error instanceof DatabaseError) throw error;
            throw new DatabaseError('Failed to update phase');
        }
    },

    async deletePhase(projectId: string, phaseId: string): Promise<void> {
        try {
            const timeline = await this.getOrCreateTimeline(projectId);
            const phases = timeline.phases
                .filter((p) => p.id !== phaseId)
                .map((p, i) => ({ ...p, order: i }));
            // Unassign milestones that referenced this phase
            const milestones = timeline.milestones.map((m) =>
                m.phaseId === phaseId ? { ...m, phaseId: undefined } : m
            );
            await this._writeTimeline(projectId, { phases, milestones });
        } catch (error) {
            logError(error, 'deletePhase');
            if (error instanceof DatabaseError) throw error;
            throw new DatabaseError('Failed to delete phase');
        }
    },

    // --- Templates ---

    async applyTemplate(
        projectId: string,
        templateId: string,
        startDate?: string
    ): Promise<void> {
        try {
            // Try built-ins first, then fall through to Firestore custom templates.
            let template: TimelineTemplate | undefined = getTimelineTemplate(templateId);
            if (!template) {
                const docRef = doc(db, COLLECTIONS.TIMELINE_TEMPLATES, templateId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    template = {
                        id: docSnap.id,
                        name: (data.name as string) ?? 'Untitled template',
                        description: (data.description as string) ?? '',
                        icon: (data.icon as string) ?? '📌',
                        phases: (data.phases as TimelineTemplatePhase[]) ?? [],
                        milestones: (data.milestones as TimelineTemplateMilestone[]) ?? [],
                    };
                }
            }
            if (!template) throw new DatabaseError(`Unknown template: ${templateId}`);

            const start = startDate ?? todayISO();
            const timeline = await this.getOrCreateTimeline(projectId);

            // Create phases with fresh IDs; remember index → id mapping
            const newPhases: TimelinePhase[] = template.phases.map((p, i) => ({
                id: `ph_${generateId()}`,
                title: p.title,
                color: p.color,
                order: timeline.phases.length + i,
                collapsed: false,
            }));
            const phaseIds = newPhases.map((p) => p.id);

            const nowISO = new Date().toISOString();
            const newMilestones: TimelineMilestone[] = template.milestones.map(
                (m, i) => ({
                    id: `ms_${generateId()}`,
                    title: m.title,
                    status: m.status,
                    phaseId:
                        m.phaseIndex !== undefined ? phaseIds[m.phaseIndex] : undefined,
                    startDate: addDaysISO(start, m.startOffsetDays),
                    endDate: addDaysISO(start, m.startOffsetDays + m.durationDays - 1),
                    color: m.color,
                    assignee: m.assignee,
                    notes: m.notes,
                    order: timeline.milestones.length + i,
                    createdAt: nowISO,
                    updatedAt: nowISO,
                })
            );

            await this._writeTimeline(projectId, {
                phases: [...timeline.phases, ...newPhases],
                milestones: [...timeline.milestones, ...newMilestones],
            });
        } catch (error) {
            logError(error, 'applyTemplate');
            if (error instanceof DatabaseError) throw error;
            throw new DatabaseError('Failed to apply template');
        }
    },

    /**
     * Import a parsed set of phases + milestones (as produced by the
     * markdown parser or any future importer) onto a project's timeline.
     *
     * Dates are resolved by anchoring day offsets to `startDate`, matching
     * the applyTemplate contract.
     */
    async importParsed(
        projectId: string,
        parsed: {
            phases: TimelineTemplatePhase[];
            milestones: TimelineTemplateMilestone[];
        },
        startDate?: string
    ): Promise<{ phaseCount: number; milestoneCount: number }> {
        try {
            const start = startDate ?? todayISO();
            const timeline = await this.getOrCreateTimeline(projectId);

            const newPhases: TimelinePhase[] = parsed.phases.map((p, i) => ({
                id: `ph_${generateId()}`,
                title: p.title,
                color: p.color,
                order: timeline.phases.length + i,
                collapsed: false,
            }));
            const phaseIds = newPhases.map((p) => p.id);

            const nowISO = new Date().toISOString();
            const newMilestones: TimelineMilestone[] = parsed.milestones.map(
                (m, i) => ({
                    id: `ms_${generateId()}`,
                    title: m.title,
                    status: m.status,
                    phaseId:
                        m.phaseIndex !== undefined ? phaseIds[m.phaseIndex] : undefined,
                    startDate: addDaysISO(start, m.startOffsetDays),
                    endDate: addDaysISO(start, m.startOffsetDays + m.durationDays - 1),
                    color: m.color,
                    assignee: m.assignee,
                    notes: m.notes,
                    order: timeline.milestones.length + i,
                    createdAt: nowISO,
                    updatedAt: nowISO,
                })
            );

            await this._writeTimeline(projectId, {
                phases: [...timeline.phases, ...newPhases],
                milestones: [...timeline.milestones, ...newMilestones],
            });

            return {
                phaseCount: newPhases.length,
                milestoneCount: newMilestones.length,
            };
        } catch (error) {
            logError(error, 'importParsed');
            if (error instanceof DatabaseError) throw error;
            throw new DatabaseError('Failed to import timeline');
        }
    },

    async clearTimeline(projectId: string): Promise<void> {
        try {
            const ref = doc(db, TIMELINES_COLLECTION, projectId);
            await deleteDoc(ref);
        } catch (error) {
            logError(error, 'clearTimeline');
            throw new DatabaseError('Failed to clear timeline');
        }
    },
};
