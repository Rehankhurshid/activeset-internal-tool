// Public surface of the delivery module.
//
// The page is the unit of work; everything technology-specific lives in a stack
// definition under domain/stacks. Nothing outside that folder should name a
// specific stack.

export type {
  AutoCheckId,
  AutoCheckVerdict,
  CheckStatus,
  CreateProjectPageInput,
  PageWorkStatus,
  ProjectDeliveryState,
  ProjectPage,
  StackCheck,
  StackDefinition,
  StackDiscipline,
  StackId,
  StackKickoffInput,
} from './domain/delivery.types';
export {
  PAGE_WORK_STATUSES,
  PAGE_WORK_STATUS_LABELS,
  SETTLED_PAGE_STATUSES,
  normalizePageWorkStatus,
} from './domain/delivery.types';

export { AVAILABLE_STACKS, DEFAULT_STACK_ID, getStack, isStackSupported } from './domain/stacks';

export {
  buildKickoffProgress,
  buildLaunchReadiness,
  buildPageProgress,
  resolveAutoCheck,
  resolveCheck,
} from './domain/delivery.progress';
export type {
  BuildLaunchReadinessInput,
  CheckProgress,
  DisciplineProgress,
  LaunchReadiness,
  PageProgress,
} from './domain/delivery.progress';

export { deliveryRepository, normalizePagePath, titleFromPath } from './infrastructure/delivery.repository';
