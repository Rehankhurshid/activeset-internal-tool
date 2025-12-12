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
  const [accessChecked, setAccessChecked] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && firebaseUser.email) {
        // Check if email is allowed
        const allowed = await accessControlService.isEmailAllowed(firebaseUser.email);

        if (allowed) {
          setUser(firebaseUser);
          setIsAdmin(accessControlService.isAdmin(firebaseUser.email));
        } else {
          // Not allowed - sign out
          await signOut(auth);
          setUser(null);
          setIsAdmin(false);
          setError('Your email is not authorized. Contact admin for access.');
        }
      } else {
        setUser(null);
        setIsAdmin(false);
      }
      setAccessChecked(true);
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

      // Check if email is allowed
      const allowed = await accessControlService.isEmailAllowed(result.user.email);

      if (!allowed) {
        await signOut(auth);
        setError('Your email is not authorized to access this application. Please contact the admin.');
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
    accessChecked,
    signInWithGoogle,
    logout,
    clearError,
    isAuthenticated: !!user,
  };
};