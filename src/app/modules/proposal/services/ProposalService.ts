import { Proposal } from '../types/Proposal';
import { db } from '@/lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

class ProposalService {
    private readonly STORAGE_KEY = 'proposals';
    private readonly SHARE_KEY = 'shareLinks';

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

    private getShareLinksFromStorage(): Record<string, string> {
        if (typeof window === 'undefined') return {};
        try {
            const data = localStorage.getItem(this.SHARE_KEY);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('Error reading share links from localStorage:', error);
            return {};
        }
    }

    private saveShareLinksToStorage(shareLinks: Record<string, string>): void {
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(this.SHARE_KEY, JSON.stringify(shareLinks));
        } catch (error) {
            console.error('Error saving share links to localStorage:', error);
        }
    }

    async getProposals(): Promise<Proposal[]> {
        return this.getProposalsFromStorage();
    }

    async createProposal(proposal: Omit<Proposal, 'id' | 'createdAt' | 'updatedAt'>): Promise<Proposal> {
        const proposals = this.getProposalsFromStorage();

        const newProposal: Proposal = {
            ...proposal,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        proposals.push(newProposal);
        this.saveProposalsToStorage(proposals);

        return newProposal;
    }

    async updateProposal(id: string, proposalData: Partial<Proposal>): Promise<Proposal> {
        const proposals = this.getProposalsFromStorage();
        const index = proposals.findIndex(p => p.id === id);

        if (index === -1) {
            throw new Error('Proposal not found');
        }

        const updatedProposal: Proposal = {
            ...proposals[index],
            ...proposalData,
            id,
            updatedAt: new Date().toISOString(),
        };

        proposals[index] = updatedProposal;
        this.saveProposalsToStorage(proposals);

        return updatedProposal;
    }

    async deleteProposal(id: string): Promise<void> {
        const proposals = this.getProposalsFromStorage();
        const filtered = proposals.filter(p => p.id !== id);

        if (filtered.length === proposals.length) {
            throw new Error('Proposal not found');
        }

        this.saveProposalsToStorage(filtered);
    }

    async createShareLink(proposalId: string): Promise<string> {
        const proposals = this.getProposalsFromStorage();
        const proposal = proposals.find(p => p.id === proposalId);

        if (!proposal) {
            throw new Error('Proposal not found');
        }

        // Upload to Firestore for public access
        try {
            // Use the same ID for the public doc so updates overwrite it
            const docRef = doc(db, 'shared_proposals', proposalId);
            await setDoc(docRef, {
                ...proposal,
                sharedAt: new Date().toISOString()
            });

            // Return the public URL
            return `${window.location.origin}/view/${proposalId}`;
        } catch (error) {
            console.error('Error uploading proposal to Firestore:', error);
            throw new Error('Failed to create public share link');
        }
    }

    async getSharedProposal(token: string): Promise<Proposal> {
        // Legacy or internal share handling if needed
        return this.getPublicProposal(token);
    }

    async getPublicProposal(id: string): Promise<Proposal> {
        try {
            const docRef = doc(db, 'shared_proposals', id);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                return docSnap.data() as Proposal;
            } else {
                // Fallback to local storage if running locally and checking own shared link?
                // But for public users (incognito), local storage won't have it.
                // So strictly Firestore is safer for "Public" usage.
                // But let's fallback just in case the user IS the author testing it.
                const proposals = this.getProposalsFromStorage();
                const localProposal = proposals.find(p => p.id === id);
                if (localProposal) return localProposal;

                throw new Error('Proposal not found');
            }
        } catch (error) {
            console.error('Error fetching public proposal:', error);
            throw error;
        }
    }
}

export const proposalService = new ProposalService();
