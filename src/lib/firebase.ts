import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
// Check if running on server and missing keys to avoid build crashes with clearer error
if (!firebaseConfig.apiKey) {
  console.warn('Firebase API keys missing. This may cause build failures if pages attempt to access Firebase.');
  if (typeof window === 'undefined') {
    console.log('Build Environment Variables:', JSON.stringify(Object.keys(process.env).filter(k => k.startsWith('NEXT_PUBLIC_'))));
  }
}

// Prevent multiple initializations (essential for Next.js hot reload servers)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase Authentication only on the client.
// Next.js may import modules during build/server evaluation; initializing auth there can crash builds
// when public Firebase env vars are not present (or intentionally omitted in certain build steps).
export const auth =
  typeof window !== 'undefined'
    ? getAuth(app)
    : (null as unknown as ReturnType<typeof getAuth>);

export const googleProvider =
  typeof window !== 'undefined'
    ? new GoogleAuthProvider()
    : (null as unknown as GoogleAuthProvider);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

export default app;