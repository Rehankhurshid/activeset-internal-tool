'use client';

import { useAuth } from '@/hooks/useAuth';
import { LoginForm } from '@/components/auth/LoginForm';
import { Skeleton } from '@/components/ui/skeleton';
import { AppNavigation } from '@/components/navigation/AppNavigation';
import { SEODashboard } from './components/SEODashboard';

export default function SEOEnginePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!user) return <LoginForm />;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppNavigation
        title="SEO Engine"
        showBackButton
        backHref="/"
      />
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <SEODashboard />
      </main>
    </div>
  );
}
