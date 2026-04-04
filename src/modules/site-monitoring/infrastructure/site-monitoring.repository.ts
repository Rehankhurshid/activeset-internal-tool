import { projectsService } from '@/services/database';
import type { Project } from '@/modules/project-links';

export interface SiteMonitoringRepository {
  subscribeToProject: (projectId: string, callback: (project: Project | null) => void) => () => void;
  saveBrokenLinkResults: typeof projectsService.saveBrokenLinkResults;
}

export const siteMonitoringRepository: SiteMonitoringRepository = {
  subscribeToProject: (projectId, callback) => projectsService.subscribeToProject(projectId, callback),
  saveBrokenLinkResults: (...args) => projectsService.saveBrokenLinkResults(...args),
};
