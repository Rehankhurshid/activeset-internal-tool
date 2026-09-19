import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/constants';
import {
  decisionId,
  type AuditDecision,
  type DecisionKind,
  type FindingKind,
} from '../domain/audit-findings';

/**
 * `projects/{id}/audit_decisions/{decisionId}` — one document per decision a
 * person has made about a finding. Written from the browser with the signed-in
 * user's identity; the rules allow the team and nobody else.
 */

const AUDIT_DECISIONS = 'audit_decisions';

function decisionsCollection(projectId: string) {
  return collection(db, COLLECTIONS.PROJECTS, projectId, AUDIT_DECISIONS);
}

export interface RecordDecisionInput {
  kind: FindingKind;
  fingerprint: string;
  decision: DecisionKind;
  reason?: string;
  altText?: string;
  by: string;
}

export interface AuditDecisionsRepository {
  subscribe: (projectId: string, onChange: (decisions: AuditDecision[]) => void) => () => void;
  record: (projectId: string, input: RecordDecisionInput) => Promise<AuditDecision>;
  clear: (projectId: string, kind: FindingKind, fingerprint: string) => Promise<void>;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

export const auditDecisionsRepository: AuditDecisionsRepository = {
  subscribe(projectId, onChange) {
    return onSnapshot(
      decisionsCollection(projectId),
      (snap) => {
        onChange(snap.docs.map((d) => ({ ...(d.data() as Omit<AuditDecision, 'id'>), id: d.id })));
      },
      (error) => {
        console.error('[auditDecisions] subscription failed:', error);
        onChange([]);
      },
    );
  },

  async record(projectId, input) {
    const id = decisionId(input.kind, input.fingerprint);
    const decision: AuditDecision = stripUndefined({
      id,
      kind: input.kind,
      fingerprint: input.fingerprint,
      decision: input.decision,
      reason: input.reason,
      altText: input.altText,
      by: input.by,
      at: new Date().toISOString(),
    });
    const { id: _id, ...data } = decision;
    void _id;
    await setDoc(doc(decisionsCollection(projectId), id), data);
    return decision;
  },

  async clear(projectId, kind, fingerprint) {
    await deleteDoc(doc(decisionsCollection(projectId), decisionId(kind, fingerprint)));
  },
};
