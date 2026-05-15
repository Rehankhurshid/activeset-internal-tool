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

// Whether a record is a sales proposal or a legal contract. Missing/undefined
// is treated as 'proposal' so every pre-existing record keeps working.
export type DocumentType = 'proposal' | 'contract';

// A party to the contract (the agreement is between the client and the agency).
export interface ContractParty {
    legalName: string;       // Registered company name
    address: string;         // Full address block (newlines preserved)
    signatoryName: string;   // Person who signs on behalf of the party
    signatoryTitle: string;  // Their title, e.g. "Partner"
    email: string;
}

// One numbered legal section of the contract. `body` is rich-text HTML and is
// editable per contract so wording can be negotiated.
export interface ContractClause {
    id: string;       // stable slug, e.g. 'scope', 'confidentiality'
    heading: string;
    body: string;     // HTML
    /**
     * When true the body is regenerated from structured fields (currently only
     * the Term & lock-in clause) whenever those fields change, unless the user
     * has manually edited it.
     */
    generated?: boolean;
}

export type BillingCycle = 'monthly' | 'quarterly' | 'annually';

export interface ContractData {
    client: ContractParty;
    agency: ContractParty;
    effectiveDate: string;   // ISO YYYY-MM-DD — contract commencement date
    retainer: {
        amount: number;
        currency: string;    // e.g. 'SGD', 'USD'
        billingCycle: BillingCycle;
    };
    /**
     * Minimum committed term in months. 0 means no lock-in. Stored structured
     * so the dashboard can surface lock-in expiry, and used to (re)generate the
     * Term clause text.
     */
    lockInMonths: number;
    governingLawCountry: string;
    jurisdictionCity: string;
    /** Ordered legal sections rendered as the body of the agreement. */
    clauses: ContractClause[];
}

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
    // Missing/undefined => 'proposal'. Drives which editor/viewer is used and
    // whether `data.contract` is present.
    documentType?: DocumentType;
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
            agency: {
                name: string;
                email: string;
                signatureData?: string;
                // Set when the agency counter-signs. A contract is only
                // "fully executed" once both agency.signedAt and
                // client.signedAt are present.
                signedAt?: string;
                signatureAudit?: SignatureAudit;
            };
            client: {
                name: string;
                email: string;
                signatureData?: string;  // Base64 data URL of signature image
                signedAt?: string;       // ISO timestamp when signed
                signedDocUrl?: string;   // URL to signed PDF (DocuSeal)
                signatureAudit?: SignatureAudit;
            };
        };
        // Present only when documentType === 'contract'.
        contract?: ContractData;
    };
}

export interface PricingItem {
    name: string;
    price: string;
    description?: string; // Rich text/markdown support
    /**
     * When set, this line item is billed hourly. `price` is computed as
     * `hours * rate` and kept in sync so totals/exports still work; the UI
     * shows hours + rate fields instead of a flat price input.
     */
    hourly?: {
        hours: number;
        rate: number;
    };
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
