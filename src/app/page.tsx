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
  const { hasAccess: hasProjectLinksAccess, loading: projectLinksAccessLoading } = useModuleAccess('project-links');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Skeleton className="h-12 w-48" />
      </div>
    );
  }

  if (!user) return <LoginForm />;

  const renderModuleCard = (
    href: string,
    icon: React.ReactNode,
    iconBg: string,
    title: string,
    description: string,
    hasAccess: boolean,
    accessLoading: boolean,
    extra?: React.ReactNode
  ) => {
    if (accessLoading) {
      return (
        <Card className="h-full">
          <CardHeader>
            <Skeleton className="mb-4 w-12 h-12 rounded-lg" />
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48 mt-2" />
          </CardHeader>
        </Card>
      );
    }

    if (!hasAccess && !isAdmin) {
      return (
        <Card className="h-full opacity-50 cursor-not-allowed">
          <CardHeader>
            <div className="mb-4 w-12 h-12 rounded-lg bg-gray-500/10 flex items-center justify-center">
              <Lock className="h-6 w-6 text-gray-500" />
            </div>
            <CardTitle className="text-muted-foreground">{title}</CardTitle>
            <CardDescription>You don&apos;t have access to this module. Contact admin.</CardDescription>
          </CardHeader>
        </Card>
      );
    }

    return (
      <Link href={href} className="block group">
        <Card className="h-full transition-all hover:border-primary hover:shadow-lg">
          <CardHeader>
            <div className={`mb-4 w-12 h-12 rounded-lg ${iconBg} flex items-center justify-center group-hover:opacity-80 transition-colors`}>
              {icon}
            </div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          {extra && <CardContent>{extra}</CardContent>}
        </Card>
      </Link>
    );
  };

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
        {/* Project Links Module */}
        {renderModuleCard(
          "/modules/project-links",
          <FolderOpen className="h-6 w-6 text-blue-500" />,
          "bg-blue-500/10",
          "Project Links",
          "Manage and organize all your project links in one place.",
          hasProjectLinksAccess,
          projectLinksAccessLoading
        )}

        {/* Proposal Generator Module */}
        {renderModuleCard(
          "/modules/proposal",
          <FileText className="h-6 w-6 text-purple-500" />,
          "bg-purple-500/10",
          "Proposal Generator",
          "Create professional website proposals using Gemini AI.",
          hasProposalAccess,
          proposalAccessLoading,
          <div className="flex items-center text-xs text-purple-500 font-medium">
            <Sparkles className="mr-1 h-3 w-3" /> AI Powered
          </div>
        )}
      </div>
    </div>
  );
}
