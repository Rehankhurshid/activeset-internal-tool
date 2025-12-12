'use client';

import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { accessControlService, RestrictedModule } from '@/services/AccessControlService';

export const useModuleAccess = (module: RestrictedModule) => {
    const { user, loading: authLoading } = useAuth();
    const [hasAccess, setHasAccess] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkAccess = async () => {
            if (authLoading) return;

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
