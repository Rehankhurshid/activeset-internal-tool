export type QAStatus = 'pending' | 'passed' | 'failed' | 'manual-verified' | 'loading';
export type VerificationType = 'manual' | 'automated';

export interface QAChecklistItem {
    id: string;
    label: string;
    category: string; // e.g., "Fonts", "Styleguide", "Color Variables"
    status: QAStatus;
    verificationType: VerificationType;
    verificationEndpoint?: string; // API endpoint for automated checks
    subItems?: QAChecklistItem[]; // For nested checks (e.g., H1-H6 tags)
    description?: string; // Helper text for user
    error?: string; // Error message if check failed
    issues?: string[]; // List of specific issues found
    data?: any; // Store arbitrary result data (e.g. list of fonts)
}

export interface QAScanResult {
    success: boolean;
    type: string; // e.g. "fonts"
    passed: boolean;
    details?: string;
    issues?: string[];
    data?: any; // Additional data from scan
}

export interface FontScanResult extends QAScanResult {
    type: 'fonts';
    fontsFound: {
        family: string;
        source: string;
        format?: string;
        isWoff2: boolean;
    }[];
}
