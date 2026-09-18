// Public surface of the client-portal module.
//
// Domain: the allow-listed projection and status helpers (safe on the server).
// UI: the client-facing portal screen and the internal Client tab panel.
// Server-only loaders and token helpers live in src/lib/client-portal*.ts and
// are imported directly by route handlers, never through this index.

export { buildClientPortalView } from './domain/client-portal.projection';
export type { BuildClientPortalViewInput } from './domain/client-portal.projection';
export {
  CLIENT_PORTAL_VIEW_KEYS,
  PORTAL_MILESTONE_LABELS,
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
  CLIENT_STATUS_PORTAL_LABELS,
  normalizeClientStatus,
} from './domain/client-portal.types';
export type {
  ClientFacingState,
  ClientPortalSettings,
  ClientPortalView,
  ClientStatus,
  PortalAskView,
  PortalDeliverableView,
  PortalMilestoneStatus,
  PortalMilestoneView,
  PortalPhaseView,
  PortalUpdateView,
} from './domain/client-portal.types';
export {
  CLIENT_STATUS_ORDER,
  PORTAL_STALE_AFTER_DAYS,
  ageLabel,
  daysSinceClientUpdate,
  isPortalStale,
} from './domain/client-status';

export { clientPortalRepository } from './infrastructure/client-portal.repository';
export type { PortalLinkAction, PortalLinkState, PortalViewRow } from './infrastructure/client-portal.repository';

export { ClientPortalScreen } from './ui/screens/ClientPortalScreen';
export { ClientPanel } from './ui/screens/ClientPanel';
export { ClientStatusChip } from './ui/components/ClientStatusChip';
