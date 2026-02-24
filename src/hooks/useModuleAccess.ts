'use client';

import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { accessControlService, RestrictedModule } from '@/services/AccessControlService';

// Check if we're in local development
const isLocalDevelopment = () => {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
};

const ACCESS_CACHE_TTL = 5 * 60 * 1000;
const moduleAccessCache = new Map<string, { value: boolean; timestamp: number }>();
const inFlightChecks = new Map<string, Promise<boolean>>();

const getCacheKey = (email: string, module: RestrictedModule) =>
  `${email.toLowerCase()}:${module}`;

async function getAccessWithCache(email: string, module: RestrictedModule): Promise<boolean> {
  const key = getCacheKey(email, module);
  const now = Date.now();
  const cached = moduleAccessCache.get(key);
  if (cached && now - cached.timestamp < ACCESS_CACHE_TTL) {
    return cached.value;
  }

  const pending = inFlightChecks.get(key);
  if (pending) {
    return pending;
  }

  const request = accessControlService
    .hasModuleAccess(email, module)
    .then((value) => {
      moduleAccessCache.set(key, { value, timestamp: Date.now() });
      return value;
    })
    .finally(() => {
      inFlightChecks.delete(key);
    });

  inFlightChecks.set(key, request);
  return request;
}

interface UseModuleAccessOptions {
  enabled?: boolean;
}

export const useModuleAccess = (
  module: RestrictedModule,
  options: UseModuleAccessOptions = {}
) => {
    const { enabled = true } = options;
    const { user, loading: authLoading } = useAuth();
    const [hasAccess, setHasAccess] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const checkAccess = async () => {
            if (!enabled) {
                setLoading(false);
                return;
            }

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
                const access = await getAccessWithCache(user.email, module);
                if (!cancelled) {
                    setHasAccess(access);
                }
            } catch (error) {
                console.error('Error checking module access:', error);
                if (!cancelled) {
                    setHasAccess(false);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        setLoading(true);
        checkAccess();
        return () => {
            cancelled = true;
        };
    }, [authLoading, enabled, module, user]);

    return { hasAccess, loading: enabled ? loading || authLoading : false };
};
