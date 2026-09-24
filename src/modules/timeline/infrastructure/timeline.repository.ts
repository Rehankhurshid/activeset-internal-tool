import { timelineService } from '@/services/TimelineService';
import type {
    ProjectTimeline,
    TimelinePhase,
    TimelineMilestone,
    TimelineTemplatePhase,
    TimelineTemplateMilestone,
} from '@/types';

export interface TimelineRepository {
    subscribeToProjectTimeline: (
        projectId: string,
        callback: (timeline: ProjectTimeline | null) => void
    ) => () => void;
    getOrCreateTimeline: (projectId: string) => Promise<ProjectTimeline>;
    addMilestone: (
        projectId: string,
        milestone: Omit<TimelineMilestone, 'id' | 'order' | 'createdAt' | 'updatedAt'>
    ) => Promise<string>;
    updateMilestone: (
        projectId: string,
        milestoneId: string,
        updates: Partial<TimelineMilestone>
    ) => Promise<void>;
    deleteMilestone: (projectId: string, milestoneId: string) => Promise<void>;
    addPhase: (
        projectId: string,
        phase: Omit<TimelinePhase, 'id' | 'order'>
    ) => Promise<string>;
    updatePhase: (
        projectId: string,
        phaseId: string,
        updates: Partial<TimelinePhase>
    ) => Promise<void>;
    deletePhase: (projectId: string, phaseId: string) => Promise<void>;
    applyTemplate: (
        projectId: string,
        templateId: string,
        startDate?: string
    ) => Promise<void>;
    importParsed: (
        projectId: string,
        parsed: {
            phases: TimelineTemplatePhase[];
            milestones: TimelineTemplateMilestone[];
        },
        startDate?: string
    ) => Promise<{ phaseCount: number; milestoneCount: number }>;
    clearTimeline: (projectId: string) => Promise<void>;
}

export const timelineRepository: TimelineRepository = {
    subscribeToProjectTimeline: (projectId, callback) =>
        timelineService.subscribeToProjectTimeline(projectId, callback),
    getOrCreateTimeline: (projectId) => timelineService.getOrCreateTimeline(projectId),
    addMilestone: (projectId, milestone) =>
        timelineService.addMilestone(projectId, milestone),
    updateMilestone: (projectId, milestoneId, updates) =>
        timelineService.updateMilestone(projectId, milestoneId, updates),
    deleteMilestone: (projectId, milestoneId) =>
        timelineService.deleteMilestone(projectId, milestoneId),
    addPhase: (projectId, phase) => timelineService.addPhase(projectId, phase),
    updatePhase: (projectId, phaseId, updates) =>
        timelineService.updatePhase(projectId, phaseId, updates),
    deletePhase: (projectId, phaseId) =>
        timelineService.deletePhase(projectId, phaseId),
    applyTemplate: (projectId, templateId, startDate) =>
        timelineService.applyTemplate(projectId, templateId, startDate),
    importParsed: (projectId, parsed, startDate) =>
        timelineService.importParsed(projectId, parsed, startDate),
    clearTimeline: (projectId) => timelineService.clearTimeline(projectId),
};
