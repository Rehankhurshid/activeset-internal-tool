'use client';

import { ProposalTemplate, Proposal } from '../types/Proposal';

const STORAGE_KEY = 'proposal_templates';

function generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

export const templateService = {
    getTemplates(): ProposalTemplate[] {
        if (typeof window === 'undefined') return [];
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Error loading templates:', error);
            return [];
        }
    },

    saveTemplate(name: string, data: Proposal['data']): ProposalTemplate {
        const templates = this.getTemplates();
        const newTemplate: ProposalTemplate = {
            id: generateId(),
            name,
            createdAt: new Date().toISOString(),
            data
        };

        templates.push(newTemplate);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
        return newTemplate;
    },

    deleteTemplate(id: string): void {
        const templates = this.getTemplates();
        const filtered = templates.filter(t => t.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    },

    updateTemplate(id: string, name: string, data: Proposal['data']): ProposalTemplate | null {
        const templates = this.getTemplates();
        const index = templates.findIndex(t => t.id === id);
        if (index === -1) return null;

        templates[index] = {
            ...templates[index],
            name,
            data
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
        return templates[index];
    },

    getTemplateById(id: string): ProposalTemplate | undefined {
        return this.getTemplates().find(t => t.id === id);
    }
};
