'use client';

import { useAuth } from '@/hooks/useAuth';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { LoginForm } from '@/components/auth/LoginForm';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { FolderOpen, FileText, Sparkles, LogOut, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModeToggle } from '@/components/mode-toggle';

export default function Home() {
  const { user, loading, logout, isAdmin } = useAuth();
  const { hasAccess: hasProposalAccess, loading: proposalAccessLoading } = useModuleAccess('proposal');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Skeleton className="h-12 w-48" />
      </div>
    );
  }

  if (!user) return <LoginForm />;

  return (
    <div className="min-h-screen bg-background p-8">
      <header className="flex justify-between items-center mb-12">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Main Dashboard</h1>
          <p className="text-muted-foreground mt-2">Select a module to get started</p>
        </div>
        <div className="flex gap-4 items-center">
          <span>{user.email}</span>
          <ModeToggle />
          <Button variant="outline" size="icon" onClick={logout}>
            <LogOut className="h-[1.2rem] w-[1.2rem]" />
          </Button>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
        {/* Project Links Module - Always visible */}
        <Link href="/modules/project-links" className="block group">
          <Card className="h-full transition-all hover:border-primary hover:shadow-lg">
            <CardHeader>
              <div className="mb-4 w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                <FolderOpen className="h-6 w-6 text-blue-500" />
              </div>
              <CardTitle>Project Links</CardTitle>
              <CardDescription>Manage and organize all your project links in one place.</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {/* Proposal Generator Module - Only visible if user has access */}
        {(proposalAccessLoading || hasProposalAccess || isAdmin) && (
          proposalAccessLoading ? (
            <Card className="h-full">
              <CardHeader>
                <Skeleton className="mb-4 w-12 h-12 rounded-lg" />
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48 mt-2" />
              </CardHeader>
            </Card>
          ) : (
            <Link href="/modules/proposal" className="block group">
              <Card className="h-full transition-all hover:border-primary hover:shadow-lg">
                <CardHeader>
                  <div className="mb-4 w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                    <FileText className="h-6 w-6 text-purple-500" />
                  </div>
                  <CardTitle>Proposal Generator</CardTitle>
                  <CardDescription>Create professional website proposals using Gemini AI.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center text-xs text-purple-500 font-medium">
                    <Sparkles className="mr-1 h-3 w-3" /> AI Powered
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        )}

        {/* Placeholder for when user has no access - shows locked state */}
        {!proposalAccessLoading && !hasProposalAccess && !isAdmin && (
          <Card className="h-full opacity-50 cursor-not-allowed">
            <CardHeader>
              <div className="mb-4 w-12 h-12 rounded-lg bg-gray-500/10 flex items-center justify-center">
                <Lock className="h-6 w-6 text-gray-500" />
              </div>
              <CardTitle className="text-muted-foreground">Proposal Generator</CardTitle>
              <CardDescription>You don&apos;t have access to this module. Contact admin.</CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}
