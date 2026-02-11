'use client';

import { useState, useEffect, use } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Project } from '@/types';
import { projectsService } from '@/services/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Link as LinkIcon, Plus, Code, ShieldX, LayoutDashboard, List, Globe, ListChecks } from 'lucide-react';
import Link from 'next/link';
import { LinkList } from '@/components/projects/LinkList';
import { AddLinkDialog } from '@/components/projects/AddLinkDialog';
import { EmbedDialog } from '@/components/projects/EmbedDialog';
import { WebsiteAuditDashboard } from '@/components/website-audit-dashboard';
import { ScanSitemapDialog } from '@/components/scan-sitemap-dialog';
import { InlineEdit } from '@/components/ui/inline-edit';
import { useAsyncOperation } from '@/hooks/useAsyncOperation';
import { AppNavigation } from '@/components/navigation/AppNavigation';
import { WebflowPagesDashboard } from '@/components/webflow/WebflowPagesDashboard';
import { WebflowConfig } from '@/types/webflow';
import { toast } from 'sonner';
import { ChecklistOverview } from '@/components/checklist/ChecklistOverview';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function ProjectDetailPage({ params }: PageProps) {
    const { id } = use(params);
    const { user, loading: authLoading, signInWithGoogle } = useAuth();
    const [project, setProject] = useState<Project | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEmbedDialogOpen, setIsEmbedDialogOpen] = useState(false);
    const { execute: executeAddLink } = useAsyncOperation();

    // Default to 'audit' tab
    const [activeTab, setActiveTab] = useState('audit');

    useEffect(() => {
        if (!user || !id) return;

        const unsubscribe = projectsService.subscribeToProject(id, (updatedProject) => {
            setProject(updatedProject);
            setIsLoading(false);

            // Auto-switch to audit tab if we have audit results
            if (updatedProject?.links.some(l => l.auditResult)) {
                // only switch if we haven't manually switched?
                // For now, let's just default to 'audit' if not set
            }
        });

        return () => unsubscribe();
    }, [user, id]);

    const handleAddLink = async (title: string, url: string) => {
        if (!project) return;

        await executeAddLink(async () => {
            await projectsService.addLinkToProject(project.id, {
                title,
                url,
                order: project.links.length,
                isDefault: false
            });
        });
    };

    const handleUpdateProjectName = async (newName: string) => {
        if (!project) return;
        await projectsService.updateProjectName(project.id, newName);
    };

    const handleSaveWebflowConfig = async (config: WebflowConfig) => {
        if (!project) return;
        try {
            await projectsService.updateWebflowConfig(project.id, config);
            toast.success('Webflow configuration saved');
        } catch (error) {
            toast.error('Failed to save Webflow configuration');
            throw error;
        }
    };

    const handleRemoveWebflowConfig = async () => {
        if (!project) return;
        try {
            await projectsService.removeWebflowConfig(project.id);
            toast.success('Webflow configuration removed');
        } catch (error) {
            toast.error('Failed to remove Webflow configuration');
            throw error;
        }
    };

    if (authLoading || isLoading) {
        return <div className="p-8"><Skeleton className="h-[200px] w-full" /></div>;
    }

    if (!user) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
                <p>Please sign in to view this project.</p>
                <Button onClick={signInWithGoogle}>Sign In</Button>
            </div>
        );
    }

    // Project Links is accessible to all authenticated users
    // Access check removed - everyone can see and edit all project links

    if (!project) {
        return <div className="p-8">Project not found</div>;
    }

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <AppNavigation
                title={project.name}
                showBackButton
                backHref="/modules/project-links"
            >
                <Button variant="outline" size="sm" onClick={() => setIsEmbedDialogOpen(true)}>
                    <Code className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">Embed</span>
                </Button>
            </AppNavigation>

            <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-4 sm:space-y-6 lg:space-y-8">
                {/* Project Info */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <InlineEdit
                            value={project.name}
                            onSave={handleUpdateProjectName}
                            className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight"
                        />
                        <div className="flex items-center gap-2 text-muted-foreground mt-1">
                            <Badge variant="secondary" className="font-mono text-xs">
                                {project.links.filter(l => l.source !== 'auto').length} links
                            </Badge>
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <Tabs defaultValue="audit" value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 sm:mb-6">
                        <TabsList className="w-full sm:w-auto">
                            <TabsTrigger value="audit" className="gap-2 flex-1 sm:flex-none">
                                <LayoutDashboard className="h-4 w-4" />
                                <span className="hidden sm:inline">Audit Dashboard</span>
                                <span className="sm:hidden">Audit</span>
                            </TabsTrigger>
                            <TabsTrigger value="webflow" className="gap-2 flex-1 sm:flex-none">
                                <Globe className="h-4 w-4" />
                                <span className="hidden sm:inline">Webflow Pages</span>
                                <span className="sm:hidden">Webflow</span>
                            </TabsTrigger>
                            <TabsTrigger value="checklist" className="gap-2 flex-1 sm:flex-none">
                                <ListChecks className="h-4 w-4" />
                                <span className="hidden sm:inline">Checklist</span>
                                <span className="sm:hidden">SOP</span>
                            </TabsTrigger>
                        </TabsList>

                        {/* Show Scan Sitemap when in audit tab */}
                        {activeTab === 'audit' && (
                            <div className="w-full sm:w-auto">
                                <ScanSitemapDialog
                                    projectId={project.id}
                                />
                            </div>
                        )}
                    </div>

                    <TabsContent value="audit" className="mt-4 sm:mt-6">
                        <WebsiteAuditDashboard
                            links={project.links.filter(l => l.source === 'auto')}
                            projectId={project.id}
                            folderPageTypes={project.folderPageTypes}
                            detectedLocales={project.detectedLocales}
                            pathToLocaleMap={project.pathToLocaleMap}
                        />
                    </TabsContent>

                    <TabsContent value="webflow" className="mt-4 sm:mt-6">
                        <WebflowPagesDashboard
                            projectId={project.id}
                            webflowConfig={project.webflowConfig}
                            onSaveConfig={handleSaveWebflowConfig}
                            onRemoveConfig={handleRemoveWebflowConfig}
                        />
                    </TabsContent>

                    <TabsContent value="checklist" className="mt-4 sm:mt-6">
                        <ChecklistOverview
                            projectId={project.id}
                            userEmail={user?.email ?? undefined}
                        />
                    </TabsContent>
                </Tabs>

                <EmbedDialog
                    isOpen={isEmbedDialogOpen}
                    onOpenChange={setIsEmbedDialogOpen}
                    projectId={project.id}
                    projectName={project.name}
                />
            </main>
        </div>
    );
}
