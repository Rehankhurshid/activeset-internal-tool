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

const parseServiceAccountFromEnv = (): admin.ServiceAccount | null => {
    const rawJson =
        process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (!rawJson) return null;

    try {
        const parsed = JSON.parse(rawJson) as admin.ServiceAccount;
        if (parsed.privateKey && parsed.clientEmail && parsed.projectId) return parsed;
    } catch {
        // Not plain JSON, continue to base64 attempt.
    }

    try {
        const decoded = Buffer.from(rawJson, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded) as admin.ServiceAccount;
        if (parsed.privateKey && parsed.clientEmail && parsed.projectId) return parsed;
    } catch {
        // Ignore parsing error and fall through.
    }

    return null;
};

if (!admin.apps.length) {
    try {
        const projectId = getProjectId();
        const serviceAccountFromJson = parseServiceAccountFromEnv();

        if (serviceAccountFromJson) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    ...serviceAccountFromJson,
                    privateKey: serviceAccountFromJson.privateKey?.replace(/\\n/g, '\n'),
                }),
                projectId: projectId || serviceAccountFromJson.projectId,
            });
        } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
            const normalizedPrivateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: normalizedPrivateKey,
                }),
                projectId,
            });
        } else if (shouldUseApplicationDefaultCredentials()) {
            // Use ADC only when explicitly configured or when running in an environment that typically provides it.
            admin.initializeApp({
                credential: admin.credential.applicationDefault(),
                projectId,
            });
        }
    } catch (error) {
        console.error('Firebase admin initialization error', error);
    }
}

// Export db and auth, with fallback mocks for build time or missing credentials
export const db = (admin.apps.length ? admin.firestore() : {
    collection: () => ({
        doc: () => ({
            get: async () => ({ exists: false, data: () => undefined }),
            set: async () => { },
            update: async () => { },
            delete: async () => { }
        }),
        where: () => ({ get: async () => ({ empty: true, docs: [] }) }),
        orderBy: () => ({
            limit: () => ({ get: async () => ({ empty: true, docs: [] }) })
        }),
        add: async () => ({ id: 'mock-id' }),
        get: async () => ({ empty: true, docs: [] })
    })
}) as unknown as Firestore;

if (!admin.apps.length) {
    console.warn('[firebase-admin] Running without admin credentials. Public share links will not resolve.');
}

export const auth = (admin.apps.length ? admin.auth() : {
    getUser: async () => ({}),
    verifyIdToken: async () => ({})
}) as unknown as Auth;
