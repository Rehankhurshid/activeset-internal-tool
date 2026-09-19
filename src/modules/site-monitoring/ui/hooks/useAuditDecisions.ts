'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { auditDecisionsRepository, type RecordDecisionInput } from '../../infrastructure/audit-decisions.repository';
import type { AuditDecision, FindingKind } from '../../domain/audit-findings';

/**
 * Live view of the decisions on a project's audit findings, plus the two
 * writes. Decisions are shared state: the person who marks a divider decorative
 * on their phone should not see it come back on their laptop.
 */
export function useAuditDecisions(projectId: string, enabled: boolean = true) {
  const [decisions, setDecisions] = useState<AuditDecision[]>([]);

  useEffect(() => {
    if (!enabled || !projectId) return;
    return auditDecisionsRepository.subscribe(projectId, setDecisions);
  }, [projectId, enabled]);

  const record = useCallback(
    async (input: Omit<RecordDecisionInput, 'by'> & { by?: string }) => {
      try {
        return await auditDecisionsRepository.record(projectId, { ...input, by: input.by ?? 'team' });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not save that decision');
        throw error;
      }
    },
    [projectId],
  );

  const clear = useCallback(
    async (kind: FindingKind, fingerprint: string) => {
      try {
        await auditDecisionsRepository.clear(projectId, kind, fingerprint);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not undo that decision');
        throw error;
      }
    },
    [projectId],
  );

  return { decisions, record, clear };
}
