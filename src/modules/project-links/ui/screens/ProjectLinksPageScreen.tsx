'use client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/modules/auth-access';
import { ProjectLinksDashboardScreen } from './ProjectLinksDashboardScreen';

export function ProjectLinksPageScreen() {
  const { user, loading: authLoading, signInWithGoogle } = useAuth();

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

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="text-center max-w-md p-8 bg-gray-800/50 rounded-2xl border border-gray-700">
          <h1 className="text-2xl font-bold text-white mb-4">Client Projects</h1>
          <p className="text-gray-400 mb-6">
            Sign in with your @activeset.co email to access client projects.
          </p>
          <Button onClick={signInWithGoogle} className="w-full">
            Sign in with Google
          </Button>
        </div>
      </div>
    );
  }

  return <ProjectLinksDashboardScreen />;
}

