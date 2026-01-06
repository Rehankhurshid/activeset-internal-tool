import { ProposalEdit, ProposalSectionId, FieldChange } from '../types/Proposal';
import { db } from '@/lib/firebase';
import {
    doc,
    setDoc,
    getDocs,
    collection,
    query,
    where,
    orderBy,
    limit as firestoreLimit
} from 'firebase/firestore';

// Human-readable section names
const SECTION_LABELS: Record<ProposalSectionId, string> = {
    overview: 'Overview',
    aboutUs: 'About Us',
    pricing: 'Pricing',
    timeline: 'Timeline',
    terms: 'Terms & Conditions',
    signatures: 'Signatures',
    general: 'General',
};

class HistoryService {
    private readonly COLLECTION_NAME = 'proposal_history';

    /**
     * Get edit history for a proposal
     */
    async getHistory(proposalId: string, limit?: number): Promise<ProposalEdit[]> {
        try {
            const historyRef = collection(db, this.COLLECTION_NAME);
            let q = query(
                historyRef,
                where('proposalId', '==', proposalId),
                orderBy('timestamp', 'desc')
            );

            if (limit) {
                q = query(q, firestoreLimit(limit));
            }

            const querySnapshot = await getDocs(q);

            const history: ProposalEdit[] = [];
            querySnapshot.forEach((doc) => {
                history.push(doc.data() as ProposalEdit);
            });

            return history;
        } catch (error) {
            console.error('Error fetching history:', error);
            throw new Error('Failed to load history');
        }
    }

    /**
     * Record a new edit
     */
    async recordEdit(edit: Omit<ProposalEdit, 'id'>): Promise<ProposalEdit> {
        const newEdit: ProposalEdit = {
            ...edit,
            id: crypto.randomUUID(),
        };

        try {
            const docRef = doc(db, this.COLLECTION_NAME, newEdit.id);
            await setDoc(docRef, newEdit);
            return newEdit;
        } catch (error) {
            console.error('Error recording edit:', error);
            throw new Error('Failed to record edit');
        }
    }

    /**
     * Record proposal creation
     */
    async recordCreation(
        proposalId: string,
        proposalTitle: string,
        editorName: string,
        editorEmail: string
    ): Promise<ProposalEdit> {
        return this.recordEdit({
            proposalId,
            timestamp: new Date().toISOString(),
            editorName,
            editorEmail,
            sectionChanged: 'general',
            changeType: 'create',
            summary: `Created proposal: "${proposalTitle}"`,
        });
    }

    /**
     * Record a section update with detailed field changes
     */
    async recordDetailedUpdate(
        proposalId: string,
        sectionId: ProposalSectionId,
        editorName: string,
        editorEmail: string,
        changes: FieldChange[],
        customSummary?: string
    ): Promise<ProposalEdit> {
        const sectionLabel = SECTION_LABELS[sectionId];

        // Generate summary from changes if not provided
        let summary = customSummary;
        if (!summary && changes.length > 0) {
            if (changes.length === 1) {
                const change = changes[0];
                summary = `Updated ${change.field}: "${this.truncate(change.oldValue || '(empty)')}" → "${this.truncate(change.newValue || '(empty)')}"`;
            } else {
                summary = `Updated ${changes.length} fields in ${sectionLabel}`;
            }
        } else if (!summary) {
            summary = `Updated ${sectionLabel} section`;
        }

        return this.recordEdit({
            proposalId,
            timestamp: new Date().toISOString(),
            editorName,
            editorEmail,
            sectionChanged: sectionId,
            changeType: 'update',
            summary,
            changes,
        });
    }

    /**
     * Record a section update with auto-generated summary (legacy, for backwards compat)
     */
    async recordSectionUpdate(
        proposalId: string,
        sectionId: ProposalSectionId,
        editorName: string,
        editorEmail: string,
        customSummary?: string
    ): Promise<ProposalEdit> {
        const sectionLabel = SECTION_LABELS[sectionId];
        const summary = customSummary || `Updated ${sectionLabel} section`;

        return this.recordEdit({
            proposalId,
            timestamp: new Date().toISOString(),
            editorName,
            editorEmail,
            sectionChanged: sectionId,
            changeType: 'update',
            summary,
        });
    }

    /**
     * Truncate long strings for display
     */
    private truncate(str: string, maxLen: number = 50): string {
        if (!str) return '';
        const cleaned = str.replace(/<[^>]*>/g, '').trim(); // Strip HTML tags
        if (cleaned.length <= maxLen) return cleaned;
        return cleaned.substring(0, maxLen) + '...';
    }

    /**
     * Record pricing change with before/after values
     */
    async recordPricingChange(
        proposalId: string,
        editorName: string,
        editorEmail: string,
        oldTotal: string,
        newTotal: string
    ): Promise<ProposalEdit> {
        let summary: string;
        if (oldTotal !== newTotal) {
            summary = `Updated pricing total: ${oldTotal} → ${newTotal}`;
        } else {
            summary = 'Updated pricing items';
        }

        return this.recordEdit({
            proposalId,
            timestamp: new Date().toISOString(),
            editorName,
            editorEmail,
            sectionChanged: 'pricing',
            changeType: 'update',
            summary,
        });
    }

    /**
     * Record status change
     */
    async recordStatusChange(
        proposalId: string,
        editorName: string,
        editorEmail: string,
        oldStatus: string,
        newStatus: string
    ): Promise<ProposalEdit> {
        return this.recordEdit({
            proposalId,
            timestamp: new Date().toISOString(),
            editorName,
            editorEmail,
            sectionChanged: 'general',
            changeType: 'status_change',
            summary: `Changed status: ${oldStatus} → ${newStatus}`,
        });
    }

    /**
     * Record proposal signed
     */
    async recordSigned(
        proposalId: string,
        clientName: string,
        clientEmail: string
    ): Promise<ProposalEdit> {
        return this.recordEdit({
            proposalId,
            timestamp: new Date().toISOString(),
            editorName: clientName,
            editorEmail: clientEmail,
            sectionChanged: 'signatures',
            changeType: 'signed',
            summary: `Proposal signed by ${clientName}`,
        });
    }

    /**
     * Format relative time for display
     */
    formatRelativeTime(timestamp: string): string {
        const now = new Date();
        const then = new Date(timestamp);
        const diffMs = now.getTime() - then.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;

        return then.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: then.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        });
    }

    /**
     * Get section label for display
     */
    getSectionLabel(sectionId: ProposalSectionId): string {
        return SECTION_LABELS[sectionId];
    }
}

export const historyService = new HistoryService();
