import * as admin from 'firebase-admin';
import { Firestore } from 'firebase-admin/firestore';
import { Auth } from 'firebase-admin/auth';

if (!admin.apps.length) {
    try {
        if (process.env.FIREBASE_PRIVATE_KEY) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                }),
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

export const auth = (admin.apps.length ? admin.auth() : {
    getUser: async () => ({}),
    verifyIdToken: async () => ({})
}) as unknown as Auth;
