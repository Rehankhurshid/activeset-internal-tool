import { Proposal, ProposalSectionId, FieldChange } from '../types/Proposal';
import { db } from '@/lib/firebase';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, query, orderBy } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { historyService } from './HistoryService';

class ProposalService {
    private readonly COLLECTION_NAME = 'proposals';
    private readonly SHARED_COLLECTION = 'shared_proposals';

    // Fetch all proposals from Firestore (team-wide access)
    async getProposals(): Promise<Proposal[]> {
        try {
            const proposalsRef = collection(db, this.COLLECTION_NAME);
            const q = query(proposalsRef, orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);

            const proposals: Proposal[] = [];
            querySnapshot.forEach((doc) => {
                proposals.push(doc.data() as Proposal);
            });

            return proposals;
        } catch (error) {
            console.error('Error fetching proposals from Firestore:', error);
            throw new Error('Failed to load proposals');
        }
    }

    // Helper to get a single proposal by ID
    async getProposalById(id: string): Promise<Proposal | null> {
        try {
            const docRef = doc(db, this.COLLECTION_NAME, id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                return docSnap.data() as Proposal;
            }
            return null;
        } catch (error) {
            console.error('Error fetching proposal:', error);
            return null;
        }
    }

    async createProposal(proposal: Omit<Proposal, 'id' | 'createdAt' | 'updatedAt'>, user: User): Promise<Proposal> {
        const newProposal: Proposal = {
            ...proposal,
            id: crypto.randomUUID(),
            createdBy: {
                uid: user.uid,
                email: user.email || '',
                displayName: user.displayName || undefined
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        try {
            // Save to Firestore as primary storage
            const docRef = doc(db, this.COLLECTION_NAME, newProposal.id);
            await setDoc(docRef, newProposal);

            // Also sync to shared_proposals for public access
            const sharedDocRef = doc(db, this.SHARED_COLLECTION, newProposal.id);
            await setDoc(sharedDocRef, {
                ...newProposal,
                sharedAt: new Date().toISOString()
            });

            // Record creation in history
            historyService.recordCreation(
                newProposal.id,
                newProposal.title,
                user.displayName || user.email || 'Unknown',
                user.email || ''
            ).catch(err => console.error('Failed to record history:', err));
        } catch (error) {
            console.error('Error saving proposal to Firestore:', error);
            throw new Error('Failed to save proposal');
        }

        return newProposal;
    }

    async updateProposal(id: string, proposalData: Partial<Proposal>): Promise<Proposal> {
        try {
            // Get current proposal from Firestore
            const docRef = doc(db, this.COLLECTION_NAME, id);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                throw new Error('Proposal not found');
            }

            const currentProposal = docSnap.data() as Proposal;

            // Check if proposal is locked (signed or archived)
            if (currentProposal.isLocked) {
                throw new Error(`Proposal is locked (${currentProposal.lockedReason || 'signed'}). Edits are not allowed.`);
            }

            const updatedProposal: Proposal = {
                ...currentProposal,
                ...proposalData,
                id, // Ensure ID is not overwritten
                updatedAt: new Date().toISOString(),
            };

            // Save to Firestore
            await setDoc(docRef, updatedProposal);

            // Also sync to shared_proposals for public access
            const sharedDocRef = doc(db, this.SHARED_COLLECTION, id);
            await setDoc(sharedDocRef, {
                ...updatedProposal,
                sharedAt: new Date().toISOString()
            });

            // Record update in history (fire and forget)
            // Detect detailed field-level changes
            const detailedChanges = this.detectDetailedChanges(currentProposal, updatedProposal);
            const editorName = currentProposal.data.signatures.agency.name || 'Agency';
            const editorEmail = currentProposal.data.signatures.agency.email || '';

            // Combine all changes into a single history entry
            if (detailedChanges.size > 0) {
                const allChanges: FieldChange[] = [];
                const sectionsChanged: string[] = [];

                for (const [section, changes] of detailedChanges.entries()) {
                    // Add section label to each change's field name for clarity
                    const sectionLabel = {
                        overview: 'Overview',
                        aboutUs: 'About Us',
                        pricing: 'Pricing',
                        timeline: 'Timeline',
                        terms: 'Terms',
                        signatures: 'Signatures',
                        general: 'General'
                    }[section] || section;

                    sectionsChanged.push(sectionLabel);

                    for (const change of changes) {
                        allChanges.push({
                            field: `${sectionLabel} → ${change.field}`,
                            oldValue: change.oldValue,
                            newValue: change.newValue,
                        });
                    }
                }

                // Determine the primary section changed (use first one, or 'general' for multiple)
                const primarySection = detailedChanges.size === 1
                    ? Array.from(detailedChanges.keys())[0]
                    : 'general';

                // Generate summary
                const summary = allChanges.length === 1
                    ? `Updated ${allChanges[0].field}`
                    : `Updated ${allChanges.length} fields (${sectionsChanged.join(', ')})`;

                historyService.recordDetailedUpdate(
                    id,
                    primarySection,
                    editorName,
                    editorEmail,
                    allChanges,
                    summary
                ).catch(err => console.error('Failed to record history:', err));
            }

            return updatedProposal;
        } catch (error) {
            console.error('Error updating proposal in Firestore:', error);
            throw error;
        }
    }

    /**
     * Helper to detect detailed field-level changes between two proposal versions
     * Returns a map of section -> array of field changes
     */
    private detectDetailedChanges(oldProposal: Proposal, newProposal: Proposal): Map<ProposalSectionId, FieldChange[]> {
        const changesBySection = new Map<ProposalSectionId, FieldChange[]>();

        const addChange = (section: ProposalSectionId, field: string, oldVal: string | undefined, newVal: string | undefined) => {
            if (!changesBySection.has(section)) {
                changesBySection.set(section, []);
            }
            changesBySection.get(section)!.push({
                field,
                oldValue: this.truncateValue(oldVal),
                newValue: this.truncateValue(newVal),
            });
        };

        // General fields
        if (oldProposal.title !== newProposal.title) {
            addChange('general', 'Title', oldProposal.title, newProposal.title);
        }
        if (oldProposal.clientName !== newProposal.clientName) {
            addChange('general', 'Client Name', oldProposal.clientName, newProposal.clientName);
        }
        if (oldProposal.agencyName !== newProposal.agencyName) {
            addChange('general', 'Agency Name', oldProposal.agencyName, newProposal.agencyName);
        }
        if (oldProposal.status !== newProposal.status) {
            addChange('general', 'Status', oldProposal.status, newProposal.status);
        }

        // Overview
        if (oldProposal.data.overview !== newProposal.data.overview) {
            addChange('overview', 'Overview', oldProposal.data.overview, newProposal.data.overview);
        }

        // About Us
        if (oldProposal.data.aboutUs !== newProposal.data.aboutUs) {
            addChange('aboutUs', 'About Us', oldProposal.data.aboutUs, newProposal.data.aboutUs);
        }

        // Terms
        if (oldProposal.data.terms !== newProposal.data.terms) {
            addChange('terms', 'Terms', oldProposal.data.terms, newProposal.data.terms);
        }

        // Pricing - detailed item-level tracking
        if (JSON.stringify(oldProposal.data.pricing) !== JSON.stringify(newProposal.data.pricing)) {
            const oldPricing = oldProposal.data.pricing;
            const newPricing = newProposal.data.pricing;

            // Track total change
            if (oldPricing.total !== newPricing.total) {
                addChange('pricing', 'Total', oldPricing.total, newPricing.total);
            }

            // Track item changes
            const maxItems = Math.max(oldPricing.items.length, newPricing.items.length);
            for (let i = 0; i < maxItems; i++) {
                const oldItem = oldPricing.items[i];
                const newItem = newPricing.items[i];

                if (!oldItem && newItem) {
                    addChange('pricing', `Item ${i + 1}`, undefined, `${newItem.name}: ${newItem.price}`);
                } else if (oldItem && !newItem) {
                    addChange('pricing', `Item ${i + 1}`, `${oldItem.name}: ${oldItem.price}`, undefined);
                } else if (oldItem && newItem) {
                    if (oldItem.name !== newItem.name) {
                        addChange('pricing', `Item ${i + 1} Name`, oldItem.name, newItem.name);
                    }
                    if (oldItem.price !== newItem.price) {
                        addChange('pricing', `Item ${i + 1} Price`, oldItem.price, newItem.price);
                    }
                    if (oldItem.description !== newItem.description) {
                        addChange('pricing', `Item ${i + 1} Description`, oldItem.description, newItem.description);
                    }
                }
            }
        }

        // Timeline - detailed phase tracking
        if (JSON.stringify(oldProposal.data.timeline) !== JSON.stringify(newProposal.data.timeline)) {
            const oldPhases = oldProposal.data.timeline.phases;
            const newPhases = newProposal.data.timeline.phases;
            const maxPhases = Math.max(oldPhases.length, newPhases.length);

            for (let i = 0; i < maxPhases; i++) {
                const oldPhase = oldPhases[i];
                const newPhase = newPhases[i];

                if (!oldPhase && newPhase) {
                    addChange('timeline', `Phase ${i + 1}`, undefined, newPhase.title);
                } else if (oldPhase && !newPhase) {
                    addChange('timeline', `Phase ${i + 1}`, oldPhase.title, undefined);
                } else if (oldPhase && newPhase) {
                    if (oldPhase.title !== newPhase.title) {
                        addChange('timeline', `Phase ${i + 1} Title`, oldPhase.title, newPhase.title);
                    }
                    if (oldPhase.description !== newPhase.description) {
                        addChange('timeline', `Phase ${i + 1} Description`, oldPhase.description, newPhase.description);
                    }
                    if (oldPhase.duration !== newPhase.duration) {
                        addChange('timeline', `Phase ${i + 1} Duration`, oldPhase.duration, newPhase.duration);
                    }
                    if (oldPhase.startDate !== newPhase.startDate) {
                        addChange('timeline', `Phase ${i + 1} Start Date`, oldPhase.startDate, newPhase.startDate);
                    }
                    if (oldPhase.endDate !== newPhase.endDate) {
                        addChange('timeline', `Phase ${i + 1} End Date`, oldPhase.endDate, newPhase.endDate);
                    }
                }
            }
        }

        // Signatures
        if (JSON.stringify(oldProposal.data.signatures) !== JSON.stringify(newProposal.data.signatures)) {
            const oldSigs = oldProposal.data.signatures;
            const newSigs = newProposal.data.signatures;

            if (oldSigs.agency.name !== newSigs.agency.name) {
                addChange('signatures', 'Agency Name', oldSigs.agency.name, newSigs.agency.name);
            }
            if (oldSigs.client.name !== newSigs.client.name) {
                addChange('signatures', 'Client Name', oldSigs.client.name, newSigs.client.name);
            }
            if (oldSigs.client.signedAt !== newSigs.client.signedAt) {
                addChange('signatures', 'Signed At', oldSigs.client.signedAt, newSigs.client.signedAt);
            }
        }

        return changesBySection;
    }

    /**
     * Truncate values for storage efficiency
     */
    private truncateValue(val: string | undefined, maxLen: number = 100): string | undefined {
        if (!val) return val;
        const cleaned = val.replace(/<[^>]*>/g, '').trim();
        if (cleaned.length <= maxLen) return cleaned;
        return cleaned.substring(0, maxLen) + '...';
    }

    /**
     * Legacy helper for backwards compat
     */
    private detectChangedSections(oldProposal: Proposal, newProposal: Proposal): ProposalSectionId[] {
        const changes = this.detectDetailedChanges(oldProposal, newProposal);
        return Array.from(changes.keys());
    }

    async deleteProposal(id: string): Promise<void> {
        try {
            // Delete from main proposals collection
            const docRef = doc(db, this.COLLECTION_NAME, id);
            await deleteDoc(docRef);

            // Also delete from shared_proposals
            const sharedDocRef = doc(db, this.SHARED_COLLECTION, id);
            await deleteDoc(sharedDocRef);
        } catch (error) {
            console.error('Error deleting proposal from Firestore:', error);
            throw new Error('Failed to delete proposal');
        }
    }

    async createShareLink(proposalId: string): Promise<string> {
        try {
            // Get proposal from Firestore
            const docRef = doc(db, this.COLLECTION_NAME, proposalId);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                throw new Error('Proposal not found');
            }

            const proposal = docSnap.data() as Proposal;

            // Sync to shared_proposals collection for public access
            const sharedDocRef = doc(db, this.SHARED_COLLECTION, proposalId);
            await setDoc(sharedDocRef, {
                ...proposal,
                sharedAt: new Date().toISOString()
            });

            // Return the public URL
            return `${window.location.origin}/view/${proposalId}`;
        } catch (error) {
            console.error('Error creating share link:', error);
            throw new Error('Failed to create public share link');
        }
    }

    async getSharedProposal(token: string): Promise<Proposal> {
        return this.getPublicProposal(token);
    }

    async getPublicProposal(id: string): Promise<Proposal> {
        try {
            const docRef = doc(db, this.SHARED_COLLECTION, id);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                return docSnap.data() as Proposal;
            } else {
                throw new Error('Proposal not found');
            }
        } catch (error) {
            console.error('Error fetching public proposal:', error);
            throw error;
        }
    }

    async signProposal(id: string, signatureData: string): Promise<Proposal> {
        try {
            // Get the proposal from shared_proposals (public access)
            const sharedDocRef = doc(db, this.SHARED_COLLECTION, id);
            const docSnap = await getDoc(sharedDocRef);

            if (!docSnap.exists()) {
                throw new Error('Proposal not found');
            }

            const proposal = docSnap.data() as Proposal;
            const signedAt = new Date().toISOString();

            // Update the proposal with signature data and lock it
            const updatedProposal: Proposal = {
                ...proposal,
                status: 'approved',
                updatedAt: signedAt,
                // Lock the proposal after signing
                isLocked: true,
                lockedAt: signedAt,
                lockedReason: 'signed',
                data: {
                    ...proposal.data,
                    signatures: {
                        ...proposal.data.signatures,
                        client: {
                            ...proposal.data.signatures.client,
                            signatureData: signatureData,
                            signedAt: signedAt
                        }
                    }
                }
            };

            // Save to shared_proposals
            await setDoc(sharedDocRef, updatedProposal);

            // Also update the main proposals collection
            const mainDocRef = doc(db, this.COLLECTION_NAME, id);
            await setDoc(mainDocRef, updatedProposal);

            // Record signature in history
            historyService.recordSigned(
                id,
                proposal.data.signatures.client.name,
                proposal.data.signatures.client.email
            ).catch(err => console.error('Failed to record signature history:', err));

            // Send email notification to agency (fire and forget)
            this.sendSignatureNotification(updatedProposal, signedAt).catch(err => {
                console.error('Failed to send signature notification:', err);
            });

            return updatedProposal;
        } catch (error) {
            console.error('Error signing proposal:', error);
            throw error;
        }
    }



    private async sendSignatureNotification(proposal: Proposal, signedAt: string): Promise<void> {
        try {
            const baseUrl = typeof window !== 'undefined'
                ? window.location.origin
                : process.env.NEXT_PUBLIC_BASE_URL || '';

            await fetch(`${baseUrl}/api/send-notification`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'proposal-signed',
                    proposalId: proposal.id,
                    proposalTitle: proposal.title,
                    clientName: proposal.clientName,
                    agencyEmail: proposal.data.signatures.agency.email,
                    signedAt: signedAt
                })
            });
        } catch (error) {
            console.error('Error calling notification API:', error);
        }
    }
}

export const proposalService = new ProposalService();
