import { projectsService } from '@/services/database';
import type { Project } from '../domain/project-links.types';

export interface ProjectLinksRepository {
  subscribeToAllProjects: (callback: (projects: Project[]) => void) => () => void;
  subscribeToProject: (projectId: string, callback: (project: Project | null) => void) => () => void;
  createProject: (userId: string, name: string) => Promise<string>;
  updateProjectName: (projectId: string, name: string) => Promise<void>;
  updateProjectClient: (projectId: string, client: string) => Promise<void>;
  updateProjectProposalId: (projectId: string, proposalId: string | null) => Promise<void>;
  createAuditShareLink: (projectId: string) => Promise<string>;
}

export const projectLinksRepository: ProjectLinksRepository = {
  subscribeToAllProjects: (callback) => projectsService.subscribeToAllProjects(callback),
  subscribeToProject: (projectId, callback) => projectsService.subscribeToProject(projectId, callback),
  createProject: (userId, name) => projectsService.createProject(userId, name),
  updateProjectName: (projectId, name) => projectsService.updateProjectName(projectId, name),
  updateProjectClient: (projectId, client) => projectsService.updateProjectClient(projectId, client),
  updateProjectProposalId: (projectId, proposalId) => projectsService.updateProjectProposalId(projectId, proposalId),
  createAuditShareLink: (projectId) => projectsService.createAuditShareLink(projectId),
};
