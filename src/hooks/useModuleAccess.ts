'use client';

import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { accessControlService, RestrictedModule } from '@/services/AccessControlService';

// Check if we're in local development
const isLocalDevelopment = () => {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
};

export const useModuleAccess = (module: RestrictedModule) => {
    const { user, loading: authLoading } = useAuth();
    const [hasAccess, setHasAccess] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkAccess = async () => {
            if (authLoading) return;

            // Project Links is accessible to everyone (if authenticated)
            if (module === 'project-links') {
                setHasAccess(!!user);
                setLoading(false);
                return;
            }

            // Always grant access in local development
            if (isLocalDevelopment()) {
                setHasAccess(true);
                setLoading(false);
                return;
            }

            if (!user || !user.email) {
                setHasAccess(false);
                setLoading(false);
                return;
            }

            try {
                const access = await accessControlService.hasModuleAccess(user.email, module);
                setHasAccess(access);
            } catch (error) {
                console.error('Error checking module access:', error);
                setHasAccess(false);
            } finally {
                setLoading(false);
            }
        };

        checkAccess();
    }, [user, authLoading, module]);

    return { hasAccess, loading: loading || authLoading };
};
