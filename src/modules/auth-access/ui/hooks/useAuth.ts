'use client';

import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithCustomToken,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { auth, googleProvider } from '@/platform/firebase/client';
import { accessControlService } from '@/platform/auth/access-control';

// Check if we're in local development
const isLocalDevelopment = () => {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
};

/**
 * Sign in to a real Firebase Auth session via the dev-only `/api/auth/dev-token`
 * endpoint. The token is for the `local-dev@activeset.co` user with an
 * `admin: true` custom claim — so Firestore rules and server APIs see a valid
 * auth context, unlike the previous in-memory mock which bypassed Firebase
 * entirely and made every Firestore call fail with "Missing or insufficient
 * permissions".
 */
async function signInForLocalDev(): Promise<void> {
  const res = await fetch('/api/auth/dev-token', { method: 'POST' });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Dev token request failed (${res.status})`);
  }
  const { token } = (await res.json()) as { token?: string };
  if (!token) throw new Error('Dev token missing from response');
  await signInWithCustomToken(auth, token);
}

/**
 * Localhost-only fallback: when Firebase Admin credentials aren't configured,
 * mint an in-memory mock User so UI development isn't blocked. Firestore writes
 * will still fail (no real auth context), but every screen renders so the
 * frontend can be exercised end-to-end. Never returns a mock outside localhost.
 */
function buildLocalDevMockUser(): User {
  const fakeUid = 'local-dev-mock';
  const fakeEmail = 'local-dev@activeset.co';
  const idTokenResult = {
    token: 'mock',
    expirationTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    authTime: new Date().toISOString(),
    issuedAtTime: new Date().toISOString(),
    signInProvider: 'password',
    signInSecondFactor: null,
    claims: { admin: true },
  } as unknown as Awaited<ReturnType<User['getIdTokenResult']>>;

  return {
    uid: fakeUid,
    email: fakeEmail,
    displayName: 'Local Dev (mock)',
    emailVerified: true,
    isAnonymous: false,
    photoURL: null,
    phoneNumber: null,
    providerId: 'firebase',
    metadata: {} as User['metadata'],
    providerData: [],
    refreshToken: '',
    tenantId: null,
    delete: async () => {},
    getIdToken: async () => 'mock',
    getIdTokenResult: async () => idTokenResult,
    reload: async () => {},
    toJSON: () => ({ uid: fakeUid, email: fakeEmail }),
  } as unknown as User;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // On localhost, kick off a real Firebase Auth sign-in via the dev-only
    // custom-token endpoint. If that fails (e.g. Firebase Admin creds aren't
    // configured locally) fall back to an in-memory mock User so the UI is
    // still navigable for frontend development.
    if (isLocalDevelopment()) {
      signInForLocalDev().catch((err) => {
        console.warn('[useAuth] dev-token sign-in failed, falling back to mock user', err);
        const mockUser = buildLocalDevMockUser();
        setUser(mockUser);
        setIsAdmin(true);
        setLoading(false);
      });
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && firebaseUser.email) {
        // Allow any authenticated user - module access is checked separately
        setUser(firebaseUser);
        // Admin status is derived from either the hardcoded admin email
        // (rehan@activeset.co) or the `admin` custom claim that the dev-token
        // endpoint stamps onto the local-dev user. Reading the claim requires
        // decoding the ID token result.
        try {
          const tokenResult = await firebaseUser.getIdTokenResult();
          const adminClaim = (tokenResult.claims as { admin?: unknown }).admin === true;
          setIsAdmin(accessControlService.isAdmin(firebaseUser.email) || adminClaim);
        } catch {
          setIsAdmin(accessControlService.isAdmin(firebaseUser.email));
        }
      } else {
        setUser(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const result = await signInWithPopup(auth, googleProvider);

      if (!result.user.email) {
        await signOut(auth);
        setError('Could not get email from Google account.');
        setLoading(false);
        return;
      }

      // Check if email domain is @activeset.co (basic domain restriction)
      if (!result.user.email.endsWith('@activeset.co')) {
        await signOut(auth);
        setError('Only @activeset.co email addresses are allowed.');
        setLoading(false);
        return;
      }

      setUser(result.user);
      setIsAdmin(accessControlService.isAdmin(result.user.email));
      setLoading(false);
    } catch (error: unknown) {
      console.error('Sign in error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to sign in';
      setError(errorMessage);
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
      setUser(null);
      setIsAdmin(false);
    } catch (error: unknown) {
      console.error('Sign out error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to sign out';
      setError(errorMessage);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      error,
      isAdmin,
      signInWithGoogle,
      logout,
      clearError,
      isAuthenticated: !!user,
    }),
    [clearError, error, isAdmin, loading, logout, signInWithGoogle, user]
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};
