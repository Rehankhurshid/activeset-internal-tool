'use client';

import { useState, useEffect } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { accessControlService } from '@/services/AccessControlService';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
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

  const signInWithGoogle = async () => {
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
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setIsAdmin(false);
    } catch (error: unknown) {
      console.error('Sign out error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to sign out';
      setError(errorMessage);
    }
  };

  const clearError = () => {
    setError(null);
  };

  return {
    user,
    loading,
    error,
    isAdmin,
    signInWithGoogle,
    logout,
    clearError,
    isAuthenticated: !!user,
  };
};