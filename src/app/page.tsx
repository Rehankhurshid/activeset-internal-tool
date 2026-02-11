'use client';

import { useAuth } from '@/hooks/useAuth';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { LoginForm } from '@/components/auth/LoginForm';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { FolderOpen, FileText, Sparkles, Lock, ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AppNavigation } from '@/components/navigation/AppNavigation';
import { cn } from '@/lib/utils';



export default function Home() {
  const { user, loading, isAdmin } = useAuth();
  const { hasAccess: hasProposalAccess, loading: proposalAccessLoading } = useModuleAccess('proposal');
  const { hasAccess: hasProjectLinksAccess, loading: projectLinksAccessLoading } = useModuleAccess('project-links');

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
            <Skeleton className="h-4 w-full mt-2" />
          </CardHeader>
        </Card>
      );
    }

    if (!hasAccess && !isAdmin) {
      return (
        <Card className="h-full opacity-50 cursor-not-allowed">
          <CardHeader>
            <div className="mb-4 w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle className="text-muted-foreground">{title}</CardTitle>
            <CardDescription>You don&apos;t have access to this module. Contact admin.</CardDescription>
          </CardHeader>
        </Card>
      );
    }

    return (
      <Link href={href} className="block group h-full">
        <Card className="h-full transition-all hover:border-primary hover:shadow-lg hover:shadow-primary/5 group-hover:scale-[1.02] duration-200">
          <CardHeader>
            <div className={cn(
              "mb-4 w-12 h-12 rounded-lg flex items-center justify-center transition-all group-hover:scale-110",
              iconBg
            )}>
              {icon}
            </div>
            <CardTitle className="text-xl sm:text-2xl">{title}</CardTitle>
            <CardDescription className="text-sm sm:text-base">{description}</CardDescription>
          </CardHeader>
          {extra && <CardContent>{extra}</CardContent>}
        </Card>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppNavigation title="Dashboard" />

      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
        <div className="mb-6 sm:mb-8 lg:mb-12">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mb-2">
            Welcome back
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Select a module to get started
          </p>
        </div>



        <div className="max-w-6xl mx-auto">
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            {/* Project Links Module */}
            {renderModuleCard(
              "/modules/project-links",
              <FolderOpen className="h-6 w-6 text-blue-500" />,
              "bg-blue-500/10 dark:bg-blue-500/20",
              "Project Links",
              "Manage and organize all your project links in one place.",
              hasProjectLinksAccess,
              projectLinksAccessLoading
            )}

            {/* Proposal Generator Module */}
            {renderModuleCard(
              "/modules/proposal",
              <FileText className="h-6 w-6 text-purple-500" />,
              "bg-purple-500/10 dark:bg-purple-500/20",
              "Proposal Generator",
              "Create professional website proposals using Gemini AI.",
              hasProposalAccess,
              proposalAccessLoading,
              <div className="flex items-center gap-1.5 text-xs text-purple-500 font-medium">
                <Sparkles className="h-3 w-3" />
                <span>AI Powered</span>
              </div>
            )}

            {/* Checklist Creator Module */}
            {renderModuleCard(
              "/modules/checklist-creator",
              <ListChecks className="h-6 w-6 text-emerald-500" />,
              "bg-emerald-500/10 dark:bg-emerald-500/20",
              "Checklist Creator",
              "Generate and manage SOP templates with AI.",
              true, // Open access for now
              false,
              <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
                <Sparkles className="h-3 w-3" />
                <span>New</span>
              </div>
            )}
          </div>


        </div>
      </main >
    </div >
  );
}
