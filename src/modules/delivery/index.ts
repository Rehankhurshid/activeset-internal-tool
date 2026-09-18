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
} from './domain/delivery.types';
export {
  PAGE_WORK_STATUSES,
  PAGE_WORK_STATUS_LABELS,
  SETTLED_PAGE_STATUSES,
  normalizePageWorkStatus,
} from './domain/delivery.types';

export { AVAILABLE_STACKS, DEFAULT_STACK_ID, getStack, isStackSupported } from './domain/stacks';

export {
  buildLaunchReadiness,
  buildPageProgress,
  pageChecksFor,
  resolveAutoCheck,
  resolveCheck,
} from './domain/delivery.progress';

// The project's own checklist, read as a delivery stage. Kickoff and the
// site-wide launch list live there, not in this module, so they can differ per
// project and are edited in one place.
export { itemsForStage, sectionsForStage, stageProgress } from './domain/delivery.checklist';
export type { StageProgress, StageSection } from './domain/delivery.checklist';
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
export { KickoffScreen } from './ui/screens/KickoffScreen';
export { LaunchScreen } from './ui/screens/LaunchScreen';
export { TrackerSheetCard } from './ui/components/TrackerSheetCard';
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
