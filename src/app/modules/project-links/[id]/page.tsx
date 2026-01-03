'use client';

import { useState, useEffect, use } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { Project } from '@/types';
import { projectsService } from '@/services/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Link as LinkIcon, Plus, Code, ShieldX, LayoutDashboard, List, Globe } from 'lucide-react';
import Link from 'next/link';
import { LinkList } from '@/components/projects/LinkList';
import { AddLinkDialog } from '@/components/projects/AddLinkDialog';
import { EmbedDialog } from '@/components/projects/EmbedDialog';
import { WebsiteAuditDashboard } from '@/components/website-audit-dashboard';
import { ScanSitemapDialog } from '@/components/scan-sitemap-dialog';
import { InlineEdit } from '@/components/ui/inline-edit';
import { useAsyncOperation } from '@/hooks/useAsyncOperation';
import { ModeToggle } from '@/components/mode-toggle';
import { WebflowPagesDashboard } from '@/components/webflow/WebflowPagesDashboard';
import { WebflowConfig } from '@/types/webflow';
import { toast } from 'sonner';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function ProjectDetailPage({ params }: PageProps) {
    const { id } = use(params);
    const { user, loading: authLoading, signInWithGoogle } = useAuth();
    const { hasAccess, loading: accessLoading } = useModuleAccess('project-links');
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

    if (authLoading || accessLoading || isLoading) {
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

    if (!hasAccess) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-destructive">
                <ShieldX size={48} />
                <h2 className="text-xl font-bold">Access Denied</h2>
                <p>You do not have permission to view this project.</p>
                <Button variant="outline" asChild><Link href="/">Go Home</Link></Button>
            </div>
        );
    }

    if (!project) {
        return <div className="p-8">Project not found</div>;
    }

    return (
        <div className="container mx-auto py-4 md:py-8 px-4 space-y-6 md:space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/modules/project-links"><ArrowLeft size={20} /></Link>
                    </Button>
                    <div>
                        <InlineEdit
                            value={project.name}
                            onSave={handleUpdateProjectName}
                            className="text-2xl md:text-3xl font-bold tracking-tight"
                        />
                        <div className="flex items-center gap-2 text-muted-foreground mt-1">
                            <Badge variant="secondary" className="font-mono text-xs">
                                {project.links.filter(l => l.source !== 'auto').length} links
                            </Badge>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <ModeToggle />
                    <Button variant="outline" size="sm" onClick={() => setIsEmbedDialogOpen(true)}>
                        <Code className="mr-2 h-4 w-4" />
                        <span className="hidden sm:inline">Embed</span>
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <Tabs defaultValue="audit" value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex items-center justify-between mb-6">
                    <TabsList>
                        <TabsTrigger value="audit" className="gap-2">
                            <LayoutDashboard className="h-4 w-4" />
                            <span className="hidden sm:inline">Audit Dashboard</span>
                            <span className="sm:hidden">Audit</span>
                        </TabsTrigger>
                        <TabsTrigger value="webflow" className="gap-2">
                            <Globe className="h-4 w-4" />
                            <span className="hidden sm:inline">Webflow Pages</span>
                            <span className="sm:hidden">Webflow</span>
                        </TabsTrigger>
                    </TabsList>

                    {/* Show Scan Sitemap when in audit tab */}
                    {activeTab === 'audit' && (
                        <ScanSitemapDialog projectId={project.id} />
                    )}
                </div>

                <TabsContent value="audit" className="mt-6">
                    <WebsiteAuditDashboard links={project.links.filter(l => l.source === 'auto')} projectId={project.id} />
                </TabsContent>

                <TabsContent value="webflow" className="mt-6">
                    <WebflowPagesDashboard
                        projectId={project.id}
                        webflowConfig={project.webflowConfig}
                        onSaveConfig={handleSaveWebflowConfig}
                        onRemoveConfig={handleRemoveWebflowConfig}
                    />
                </TabsContent>
            </Tabs>

            <EmbedDialog
                isOpen={isEmbedDialogOpen}
                onOpenChange={setIsEmbedDialogOpen}
                projectId={project.id}
                projectName={project.name}
            />
        </div>
    );
}
