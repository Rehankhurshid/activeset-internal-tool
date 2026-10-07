// Public surface of the payments module: credits on the business account,
// read from Fold (fold.money) and tied to client projects. Admin-only.
//
// Server-only pieces (the Fold OAuth/MCP client, the repository and the sync)
// live in ./infrastructure and are imported directly by route handlers, never
// through this index.

export { PaymentsScreen } from './ui/screens/PaymentsScreen';
export { ProjectPaymentsCard } from './ui/components/ProjectPaymentsCard';
export { matchPayment, parsePayer, namesMatch, VIA_LABELS } from './domain/payments.matching';
export type {
  FoldAccountSummary,
  FoldConnectionStatus,
  FoldSyncSummary,
  IncomingPayment,
  PayerRule,
  PaymentStatus,
  PaymentSuggestion,
  PaymentVia,
} from './domain/payments.types';
