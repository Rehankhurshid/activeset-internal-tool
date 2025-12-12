'use client';

import { useAuth } from '@/hooks/useAuth';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ShieldX } from 'lucide-react';
import Link from 'next/link';

export default function ProjectLinksPage() {
    const { user, loading: authLoading, signInWithGoogle } = useAuth();
    const { hasAccess, loading: accessLoading } = useModuleAccess('project-links');

    if (authLoading || accessLoading) {
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
                    <h1 className="text-2xl font-bold text-white mb-4">Project Links</h1>
                    <p className="text-gray-400 mb-6">Sign in with your @activeset.co email to access project links.</p>
                    <Button onClick={signInWithGoogle} className="w-full">
                        Sign in with Google
                    </Button>
                </div>
            </div>
        );
    }

    if (!hasAccess) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
                <div className="text-center max-w-md p-8 bg-gray-800/50 rounded-2xl border border-gray-700">
                    <ShieldX className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
                    <p className="text-gray-400 mb-4">
                        You don&apos;t have permission to access the Project Links module.
                    </p>
                    <p className="text-sm text-gray-500 mb-6">
                        Signed in as: {user?.email}
                    </p>
                    <Link href="/">
                        <Button variant="outline">Back to Home</Button>
                    </Link>
                </div>
            </div>
        );
    }

    return <Dashboard />;
}
