'use client';

import { ProposalTemplate, Proposal } from '../types/Proposal';
import { db } from '@/lib/firebase';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, query, orderBy } from 'firebase/firestore';

const COLLECTION_NAME = 'templates';

function generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

export const templateService = {
    async getTemplates(): Promise<ProposalTemplate[]> {
        try {
            const templatesRef = collection(db, COLLECTION_NAME);
            const q = query(templatesRef, orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);

            const templates: ProposalTemplate[] = [];
            querySnapshot.forEach((doc) => {
                templates.push(doc.data() as ProposalTemplate);
            });

            return templates;
        } catch (error) {
            console.error('Error fetching templates from Firestore:', error);
            return [];
        }
    },

    async saveTemplate(name: string, data: Proposal['data']): Promise<ProposalTemplate> {
        const newTemplate: ProposalTemplate = {
            id: generateId(),
            name,
            createdAt: new Date().toISOString(),
            data
        };

        try {
            const docRef = doc(db, COLLECTION_NAME, newTemplate.id);
            await setDoc(docRef, newTemplate);
        } catch (error) {
            console.error('Error saving template to Firestore:', error);
            throw new Error('Failed to save template');
        }

        return newTemplate;
    },

    async deleteTemplate(id: string): Promise<void> {
        try {
            const docRef = doc(db, COLLECTION_NAME, id);
            await deleteDoc(docRef);
        } catch (error) {
            console.error('Error deleting template from Firestore:', error);
            throw new Error('Failed to delete template');
        }
    },

    async updateTemplate(id: string, name: string, data: Proposal['data']): Promise<ProposalTemplate | null> {
        try {
            const docRef = doc(db, COLLECTION_NAME, id);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                return null;
            }

            const currentTemplate = docSnap.data() as ProposalTemplate;
            const updatedTemplate: ProposalTemplate = {
                ...currentTemplate,
                name,
                data
            };

            await setDoc(docRef, updatedTemplate);
            return updatedTemplate;
        } catch (error) {
            console.error('Error updating template in Firestore:', error);
            throw error;
        }
    },

    async getTemplateById(id: string): Promise<ProposalTemplate | undefined> {
        try {
            const docRef = doc(db, COLLECTION_NAME, id);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                return docSnap.data() as ProposalTemplate;
            }
            return undefined;
        } catch (error) {
            console.error('Error fetching template by ID:', error);
            return undefined;
        }
    }
};
