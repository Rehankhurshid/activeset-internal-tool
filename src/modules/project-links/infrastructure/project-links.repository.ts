import { projectsService, type NewProjectSetup } from '@/services/database';
import type { CreateProjectLinkInput } from '@/types';
import type { Project } from '../domain/project-links.types';

export interface ProjectLinksRepository {
  subscribeToAllProjects: (callback: (projects: Project[]) => void) => () => void;
  subscribeToProject: (projectId: string, callback: (project: Project | null) => void) => () => void;
  /** The name is all a project needs; the New project dialog also sets its client, type, people and plan. */
  createProject: (userId: string, name: string, setup?: NewProjectSetup) => Promise<string>;
  addLinkToProject: (projectId: string, link: CreateProjectLinkInput) => Promise<void>;
  updateProjectName: (projectId: string, name: string) => Promise<void>;
  updateProjectClient: (projectId: string, client: string) => Promise<void>;
  updateProjectProposalId: (projectId: string, proposalId: string | null) => Promise<void>;
  updateProjectAssignees: (projectId: string, assigneeEmails: string[]) => Promise<void>;
  createAuditShareLink: (projectId: string) => Promise<string>;
  /** Issues a fresh audit share token; the previous public link stops working. */
  regenerateAuditShareLink: (projectId: string) => Promise<string>;
  disableAuditShareLink: (projectId: string) => Promise<void>;
}

export const projectLinksRepository: ProjectLinksRepository = {
  subscribeToAllProjects: (callback) => projectsService.subscribeToAllProjects(callback),
  subscribeToProject: (projectId, callback) => projectsService.subscribeToProject(projectId, callback),
  createProject: (userId, name, setup) => projectsService.createProject(userId, name, setup),
  addLinkToProject: (projectId, link) => projectsService.addLinkToProject(projectId, link),
  updateProjectName: (projectId, name) => projectsService.updateProjectName(projectId, name),
  updateProjectClient: (projectId, client) => projectsService.updateProjectClient(projectId, client),
  updateProjectProposalId: (projectId, proposalId) => projectsService.updateProjectProposalId(projectId, proposalId),
  updateProjectAssignees: (projectId, assigneeEmails) =>
    projectsService.updateProjectAssignees(projectId, assigneeEmails),
  createAuditShareLink: (projectId) => projectsService.createAuditShareLink(projectId),
  regenerateAuditShareLink: (projectId) => projectsService.createAuditShareLink(projectId, { regenerate: true }),
  disableAuditShareLink: (projectId) => projectsService.disableAuditShareLink(projectId),
};
