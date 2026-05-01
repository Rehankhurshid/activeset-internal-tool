import * as admin from 'firebase-admin';
import { Firestore } from 'firebase-admin/firestore';
import { Auth } from 'firebase-admin/auth';

const getProjectId = (): string | undefined =>
    process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

const shouldUseApplicationDefaultCredentials = (): boolean => {
    if (process.env.FIREBASE_USE_APPLICATION_DEFAULT === 'true') return true;
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return true;

    // Common serverless/GCP runtime hints where ADC is usually available.
    return Boolean(
        process.env.K_SERVICE ||
        process.env.FUNCTION_TARGET ||
        process.env.GOOGLE_CLOUD_PROJECT
    );
};

const serviceAccountRawCandidates = (): string[] => {
    const candidates = [
        process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
        process.env.GOOGLE_CREDENTIALS,
        process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
        process.env.GCLOUD_SERVICE_ACCOUNT_KEY,
    ];

    return candidates.filter((value): value is string => Boolean(value && value.trim()));
};

const parseServiceAccount = (raw: string): admin.ServiceAccount | null => {
    const normalizeServiceAccount = (value: unknown): admin.ServiceAccount | null => {
        if (!value || typeof value !== 'object') return null;

        const record = value as Record<string, unknown>;
        const projectId = (record.projectId || record.project_id) as string | undefined;
        const clientEmail = (record.clientEmail || record.client_email) as string | undefined;
        const privateKey = (record.privateKey || record.private_key) as string | undefined;

        if (!projectId || !clientEmail || !privateKey) return null;

        return { projectId, clientEmail, privateKey };
    };

    try {
        const parsed = JSON.parse(raw) as unknown;
        const normalized = normalizeServiceAccount(parsed);
        if (normalized) return normalized;
    } catch {
        // Not plain JSON, continue.
    }

    // Pasted-from-file form: raw newlines inside the private_key string break
    // JSON.parse with "Bad control character in string literal". Strip CRs,
    // escape LFs, then retry.
    try {
        const escaped = raw.trim().replace(/\r/g, '').replace(/\n/g, '\\n');
        const parsed = JSON.parse(escaped) as unknown;
        const normalized = normalizeServiceAccount(parsed);
        if (normalized) return normalized;
    } catch {
        // Continue to base64 attempt.
    }

    try {
        const decoded = Buffer.from(raw, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded) as unknown;
        const normalized = normalizeServiceAccount(parsed);
        if (normalized) return normalized;
    } catch {
        // Ignore parsing error and fall through.
    }

    return null;
};

const parseServiceAccountFromEnv = (): admin.ServiceAccount | null => {
    for (const candidate of serviceAccountRawCandidates()) {
        const parsed = parseServiceAccount(candidate);
        if (parsed) return parsed;
    }

    return null;
};

const getExplicitClientEmail = (): string | undefined =>
    process.env.FIREBASE_CLIENT_EMAIL ||
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL ||
    process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL;

const getExplicitPrivateKey = (): string | undefined =>
    process.env.FIREBASE_PRIVATE_KEY ||
    process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
    process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY;

const getStorageBucket = (): string | undefined =>
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET;

if (!admin.apps.length) {
    try {
        const projectId = getProjectId();
        const storageBucket = getStorageBucket();
        const serviceAccountFromJson = parseServiceAccountFromEnv();

        if (serviceAccountFromJson) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    ...serviceAccountFromJson,
                    privateKey: serviceAccountFromJson.privateKey?.replace(/\\n/g, '\n'),
                }),
                projectId: projectId || serviceAccountFromJson.projectId,
                storageBucket,
            });
        } else if (getExplicitPrivateKey() && getExplicitClientEmail()) {
            const normalizedPrivateKey = getExplicitPrivateKey()!.replace(/\\n/g, '\n');
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId,
                    clientEmail: getExplicitClientEmail(),
                    privateKey: normalizedPrivateKey,
                }),
                projectId,
                storageBucket,
            });
        } else if (shouldUseApplicationDefaultCredentials()) {
            // Use ADC only when explicitly configured or when running in an environment that typically provides it.
            admin.initializeApp({
                credential: admin.credential.applicationDefault(),
                projectId,
                storageBucket,
            });
        }
    } catch (error) {
        console.error('Firebase admin initialization error', error);
    }
}

// Export db and auth, with fallback mocks for build time or missing credentials.
//
// ignoreUndefinedProperties: true so writes that include undefined fields silently
// drop them instead of throwing. Necessary for the ClickUp sync (third-party data
// often has missing optional fields) and matches the pattern most callers already
// use via stripUndefined() in services/database.ts.
function buildAdminDb(): Firestore {
    if (!admin.apps.length) {
        const mockQuery = {
            doc: () => ({
                get: async () => ({ exists: false, data: () => undefined }),
                set: async () => { },
                update: async () => { },
                delete: async () => { }
            }),
            where: () => mockQuery,
            orderBy: () => mockQuery,
            limit: () => mockQuery,
            add: async () => ({ id: 'mock-id' }),
            get: async () => ({ empty: true, docs: [] })
        };
        return { collection: () => mockQuery } as unknown as Firestore;
    }
    const fs = admin.firestore();
    try {
        fs.settings({ ignoreUndefinedProperties: true });
    } catch {
        // Settings can only be applied before the first read/write — in long-lived
        // processes this may already be set on a re-import. Safe to ignore.
    }
    return fs;
}

export const db = buildAdminDb();

if (!admin.apps.length) {
    console.warn('[firebase-admin] Running without admin credentials. Public share links cannot be resolved.');
}

export const auth = (admin.apps.length ? admin.auth() : {
    getUser: async () => ({}),
    verifyIdToken: async () => ({})
}) as unknown as Auth;

export const hasFirebaseAdminCredentials = admin.apps.length > 0;
