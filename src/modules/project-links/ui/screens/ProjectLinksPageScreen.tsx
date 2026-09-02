'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { LoginForm, useAuth } from '@/modules/auth-access';
import { ProjectLinksDashboardScreen } from './ProjectLinksDashboardScreen';

export function ProjectLinksPageScreen() {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="w-full max-w-6xl space-y-8">
          <div className="space-y-3">
            <Skeleton className="h-12 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!user) return <LoginForm />;

  return <ProjectLinksDashboardScreen />;
}

