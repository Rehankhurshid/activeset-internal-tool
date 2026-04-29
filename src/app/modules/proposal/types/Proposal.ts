import type { PaymentTemplate } from '@/lib/payment-templates';

// Section IDs for comments and history tracking
export type ProposalSectionId =
    | 'overview'
    | 'aboutUs'
    | 'pricing'
    | 'timeline'
    | 'terms'
    | 'signatures'
    | 'general';

// Comment types for Google Doc-style inline commenting
export interface ProposalComment {
    id: string;
    proposalId: string;
    sectionId: ProposalSectionId;
    authorName: string;
    authorEmail: string;
    authorType: 'agency' | 'client';
    content: string;
    createdAt: string;
    resolved?: boolean;
    resolvedAt?: string;
    resolvedBy?: string;
    parentId?: string;  // For threaded replies
}

// Version history types - stores detailed field-level changes
export interface FieldChange {
    field: string;           // e.g., "title", "data.pricing.total", "data.timeline.phases[0].title"
    oldValue?: string;       // Previous value (truncated if too long)
    newValue?: string;       // New value (truncated if too long)
}

export interface ProposalEdit {
    id: string;
    proposalId: string;
    timestamp: string;
    editorName: string;
    editorEmail: string;
    sectionChanged: ProposalSectionId;
    changeType: 'create' | 'update' | 'status_change' | 'signed';
    summary: string;         // Human-readable summary
    changes?: FieldChange[]; // Detailed list of what changed (optional for backwards compat)
}

export interface ProposalView {
    id: string;
    proposalId: string;
    viewedAt: string;
    ipHash?: string;
    userAgent?: string;
    referrer?: string;
    country?: string;
    city?: string;
}

export interface SignatureAudit {
    method: 'drawn' | 'typed';
    country?: string; // ISO-2
    city?: string;
    ipHash?: string;
    userAgent?: string;
    browser?: string;
    os?: string;
}

export interface Proposal {
    id: string;
    createdBy?: {
        uid: string;
        email: string;
        displayName?: string;
    };
    title: string;
    clientName: string;
    agencyName: string;
    heroImage?: string; // URL or data URL for hero banner
    status: 'draft' | 'sent' | 'approved' | 'rejected' | 'lost';
    createdAt: string;
    updatedAt: string;
    // Public-share analytics (written by /api/proposals/[id]/view)
    viewCount?: number;
    firstViewedAt?: string;
    lastViewedAt?: string;
    lastViewCountry?: string; // ISO-2 country code
    lastViewCity?: string;
    // Edit locking - prevents changes after signature
    isLocked?: boolean;
    lockedAt?: string;
    lockedReason?: 'signed' | 'archived';
    data: {
        overview: string;
        overviewDetails?: {
            clientDescription: string;
            services: string[];
            finalDeliverable: string;
        };
        aboutUs: string;
        pricing: PricingSection;
        // Structured payment terms — drives invoice slot generation when this
        // proposal is linked to a project. Independent of `terms` (which stays
        // as freeform legal copy).
        paymentTerms?: {
            template: PaymentTemplate;
            totalAmount: number;
            currency: string;
            startDate: string; // ISO YYYY-MM-DD
        };
        timeline: {
            phases: TimelinePhase[];
        };
        terms: string;
        signatures: {
            agency: { name: string; email: string; signatureData?: string };
            client: {
                name: string;
                email: string;
                signatureData?: string;  // Base64 data URL of signature image
                signedAt?: string;       // ISO timestamp when signed
                signedDocUrl?: string;   // URL to signed PDF (DocuSeal)
                signatureAudit?: SignatureAudit;
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
    currency?: string; // Currency code (e.g., 'USD', 'EUR', 'GBP')
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
