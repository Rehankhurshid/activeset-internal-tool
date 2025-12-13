import { Proposal } from '../types/Proposal';
import { db } from '@/lib/firebase';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, query, orderBy } from 'firebase/firestore';
import { User } from 'firebase/auth';

class ProposalService {
    private readonly STORAGE_KEY = 'proposals';
    private readonly SHARE_KEY = 'shareLinks';
    private readonly COLLECTION_NAME = 'proposals';
    private readonly SHARED_COLLECTION = 'shared_proposals';

    // localStorage methods - kept for migration purposes
    private getProposalsFromStorage(): Proposal[] {
        if (typeof window === 'undefined') return [];
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('Error reading from localStorage:', error);
            return [];
        }
    }

    private saveProposalsToStorage(proposals: Proposal[]): void {
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(proposals));
        } catch (error) {
            console.error('Error saving to localStorage:', error);
        }
    }

    private clearLocalStorage(): void {
        if (typeof window === 'undefined') return;
        try {
            localStorage.removeItem(this.STORAGE_KEY);
            localStorage.removeItem(this.SHARE_KEY);
        } catch (error) {
            console.error('Error clearing localStorage:', error);
        }
    }

    // Migrate localStorage proposals to Firestore
    async migrateLocalProposals(user: User): Promise<number> {
        const localProposals = this.getProposalsFromStorage();
        if (localProposals.length === 0) return 0;

        let migratedCount = 0;
        for (const proposal of localProposals) {
            try {
                // Check if this proposal already exists in Firestore
                const docRef = doc(db, this.COLLECTION_NAME, proposal.id);
                const docSnap = await getDoc(docRef);

                if (!docSnap.exists()) {
                    // Add createdBy info and save to Firestore
                    const migratedProposal: Proposal = {
                        ...proposal,
                        createdBy: {
                            uid: user.uid,
                            email: user.email || '',
                            displayName: user.displayName || undefined
                        }
                    };
                    await setDoc(docRef, migratedProposal);

                    // Also sync to shared_proposals for public access
                    const sharedDocRef = doc(db, this.SHARED_COLLECTION, proposal.id);
                    await setDoc(sharedDocRef, {
                        ...migratedProposal,
                        sharedAt: new Date().toISOString()
                    });

                    migratedCount++;
                }
            } catch (error) {
                console.error('Error migrating proposal:', proposal.id, error);
            }
        }

        // Clear localStorage after successful migration
        if (migratedCount > 0) {
            this.clearLocalStorage();
        }

        return migratedCount;
    }

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
            // Fallback to localStorage if Firestore fails
            return this.getProposalsFromStorage();
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

            return updatedProposal;
        } catch (error) {
            console.error('Error updating proposal in Firestore:', error);
            throw error;
        }
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

            // Update the proposal with signature data
            const updatedProposal: Proposal = {
                ...proposal,
                status: 'approved',
                updatedAt: new Date().toISOString(),
                data: {
                    ...proposal.data,
                    signatures: {
                        ...proposal.data.signatures,
                        client: {
                            ...proposal.data.signatures.client,
                            signatureData: signatureData,
                            signedAt: new Date().toISOString()
                        }
                    }
                }
            };

            // Save to shared_proposals
            await setDoc(sharedDocRef, updatedProposal);

            // Also update the main proposals collection
            const mainDocRef = doc(db, this.COLLECTION_NAME, id);
            await setDoc(mainDocRef, updatedProposal);

            return updatedProposal;
        } catch (error) {
            console.error('Error signing proposal:', error);
            throw error;
        }
    }
}

export const proposalService = new ProposalService();
