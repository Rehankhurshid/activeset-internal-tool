export interface Proposal {
    id: string;
    title: string;
    clientName: string;
    agencyName: string;
    heroImage?: string; // URL or data URL for hero banner
    status: 'draft' | 'sent' | 'approved' | 'rejected';
    createdAt: string;
    updatedAt: string;
    data: {
        overview: string;
        overviewDetails?: {
            clientDescription: string;
            services: string[];
            finalDeliverable: string;
        };
        aboutUs: string;
        pricing: PricingSection;
        timeline: {
            phases: TimelinePhase[];
        };
        terms: string;
        signatures: {
            agency: { name: string; email: string };
            client: {
                name: string;
                email: string;
                signatureData?: string;  // Base64 data URL of signature image
                signedAt?: string;       // ISO timestamp when signed
            };
        };
    };
}

export interface PricingItem {
    name: string;
    price: string;
    description?: string; // Rich text/markdown support
}

export interface PricingSection {
    items: PricingItem[];
    total: string;
}

export interface TimelinePhase {
    title: string;
    description: string;
    duration: string;
    startDate?: string; // ISO date string
    endDate?: string;   // ISO date string
    dependsOn?: number; // Index of the phase this depends on (0-based)
}

export type ViewType = 'dashboard' | 'editor' | 'viewer';

export interface ProposalTemplate {
    id: string;
    name: string;
    createdAt: string;
    data: Proposal['data'];
}
