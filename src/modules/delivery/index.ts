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
  PageWorkOwner,
} from './domain/delivery.types';
export {
  CLIENT_PAGE_WORK_STATUS_LABELS,
  PAGE_WORK_STATUSES,
  PAGE_WORK_STATUS_LABELS,
  pageWorkStatusLabel,
  SETTLED_PAGE_STATUSES,
  normalizePageWorkStatus,
} from './domain/delivery.types';

export { AVAILABLE_STACKS, DEFAULT_STACK_ID, getStack, isStackSupported } from './domain/stacks';

export {
  buildLaunchReadiness,
  buildPageProgress,
  disciplineOwners,
  pageChecksFor,
  resolveAutoCheck,
  resolveCheck,
} from './domain/delivery.progress';

// The project's whole delivery arc, read off its own SOP checklist. Every
// section is a stage, in the SOP's order, so what a project does can differ from
// the next one without touching this module.
export {
  arcProgress,
  currentStageKey,
  deliveryArc,
  gateFor,
  itemsWithRole,
  roleOf,
  roleProgress,
  sectionStagesOf,
  stageWithRole,
} from './domain/delivery.arc';
export type {
  ArcEntry,
  ArcOptions,
  PagesStage,
  RoleProgress,
  SectionStage,
  StageBase,
  StageProgress,
} from './domain/delivery.arc';
export type {
  BuildLaunchReadinessInput,
  CheckProgress,
  DisciplineProgress,
  LaunchReadiness,
  PageProgress,
} from './domain/delivery.progress';

export { deliveryRepository, normalizePagePath, titleFromPath } from './infrastructure/delivery.repository';

export { DeliveryTab } from './ui/screens/DeliveryTab';
export { DeliveryScreen } from './ui/screens/DeliveryScreen';
export { StageScreen } from './ui/screens/StageScreen';
export { ImportPagesFromSheet } from './ui/components/ImportPagesFromSheet';
export { buildKickoffEmail } from './domain/kickoff.email';
export {
  TRACKER_TAB_TITLE,
  buildTrackerHeader,
  buildTrackerRows,
  parseTrackerRows,
  statusFromSheet,
  statusToSheet,
} from './domain/delivery.sheet';
export type { ImportedPageRow } from './domain/delivery.sheet';
