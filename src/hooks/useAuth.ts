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
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { accessControlService } from '@/services/AccessControlService';

// Check if we're in local development
const isLocalDevelopment = () => {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
};

// Create a mock user for local development
const createMockUser = (): User => {
  const mockUser = {
    uid: 'local-dev-user',
    email: 'local-dev@activeset.co',
    emailVerified: true,
    displayName: 'Local Dev User',
    photoURL: null,
    phoneNumber: null,
    isAnonymous: false,
    providerId: 'local-dev',
    metadata: {
      creationTime: new Date().toISOString(),
      lastSignInTime: new Date().toISOString(),
    },
    providerData: [],
    refreshToken: '',
    tenantId: null,
    delete: async () => {},
    getIdToken: async () => '',
    getIdTokenResult: async () => ({
      authTime: new Date().toISOString(),
      issuedAtTime: new Date().toISOString(),
      expirationTime: new Date(Date.now() + 3600000).toISOString(),
      signInProvider: 'local-dev',
      signInSecondFactor: null,
      claims: {},
    }),
    reload: async () => {},
    toJSON: () => ({}),
  } as unknown as User;
  return mockUser;
};

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
    // Skip auth for local development
    if (isLocalDevelopment()) {
      const mockUser = createMockUser();
      setUser(mockUser);
      setIsAdmin(true); // Make local dev user an admin
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser && firebaseUser.email) {
        // Allow any authenticated user - module access is checked separately
        setUser(firebaseUser);
        setIsAdmin(accessControlService.isAdmin(firebaseUser.email));
      } else {
        setUser(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    // Skip auth for local development
    if (isLocalDevelopment()) {
      const mockUser = createMockUser();
      setUser(mockUser);
      setIsAdmin(true);
      setLoading(false);
      return;
    }

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
    // Skip auth for local development
    if (isLocalDevelopment()) {
      setUser(null);
      setIsAdmin(false);
      return;
    }

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
