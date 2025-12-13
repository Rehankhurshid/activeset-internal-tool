import { Proposal } from '../types/Proposal';
import { db } from '@/lib/firebase';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, query, orderBy } from 'firebase/firestore';
import { User } from 'firebase/auth';

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
            const signedAt = new Date().toISOString();

            // Update the proposal with signature data
            const updatedProposal: Proposal = {
                ...proposal,
                status: 'approved',
                updatedAt: signedAt,
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
