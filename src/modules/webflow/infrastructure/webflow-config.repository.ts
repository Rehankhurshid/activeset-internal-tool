import { projectsService } from '@/services/database';
import type { WebflowConfig } from '../domain/webflow.types';

export interface WebflowConfigRepository {
  updateWebflowConfig: (projectId: string, config: WebflowConfig) => Promise<void>;
  removeWebflowConfig: (projectId: string) => Promise<void>;
}

export const webflowConfigRepository: WebflowConfigRepository = {
  updateWebflowConfig: (projectId, config) => projectsService.updateWebflowConfig(projectId, config),
  removeWebflowConfig: (projectId) => projectsService.removeWebflowConfig(projectId),
};

