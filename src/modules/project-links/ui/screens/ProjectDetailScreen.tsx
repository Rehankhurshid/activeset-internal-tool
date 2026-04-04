'use client';

import { useState, useEffect, use } from 'react';
import { useAuth } from '@/modules/auth-access';
import { EmbedDialog } from '@/modules/project-links';
import { projectLinksRepository } from '@/modules/project-links/infrastructure/project-links.repository';
import type { Project } from '@/modules/project-links';
import { ChecklistOverview } from '@/modules/checklists';
import { ProjectTextCheckCard, WebsiteAuditDashboardScreen } from '@/modules/site-monitoring';
import { WebflowPagesDashboard, webflowConfigRepository, type WebflowConfig } from '@/modules/webflow';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Code, LayoutDashboard, Globe, ListChecks, RefreshCw, Loader2, Share2 } from 'lucide-react';
import { ScanSitemapDialog } from '@/modules/project-links';
import { InlineEdit } from '@/components/ui/inline-edit';
import { AppNavigation } from '@/shared/ui';
import { toast } from 'sonner';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function ProjectDetailPage({ params }: PageProps) {
    const { id } = use(params);
    const { user, loading: authLoading, signInWithGoogle } = useAuth();
    const [project, setProject] = useState<Project | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEmbedDialogOpen, setIsEmbedDialogOpen] = useState(false);
    const [isSyncingSitemap, setIsSyncingSitemap] = useState(false);
    const [isCreatingShareLink, setIsCreatingShareLink] = useState(false);

    // Default to 'audit' tab
    const [activeTab, setActiveTab] = useState('audit');

    useEffect(() => {
        if (!user || !id) return;

        const unsubscribe = projectLinksRepository.subscribeToProject(id, (updatedProject) => {
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

    const hasWebflowSync = Boolean(project?.webflowConfig?.siteId && project?.webflowConfig?.apiToken);
    const canSyncProject = Boolean(project?.sitemapUrl || hasWebflowSync);
    const syncButtonLabel = project?.sitemapUrl ? 'Sync Sitemap' : hasWebflowSync ? 'Sync Webflow' : 'Sync';
    const syncButtonTitle = project?.sitemapUrl
        ? `Sync using ${project.sitemapUrl}`
        : hasWebflowSync
            ? 'Sync published pages from the configured Webflow site'
            : 'Run Scan Sitemap first or configure Webflow';

    const handleUpdateProjectName = async (newName: string) => {
        if (!project) return;
        await projectLinksRepository.updateProjectName(project.id, newName);
    };

    const handleSaveWebflowConfig = async (config: WebflowConfig) => {
        if (!project) return;
        try {
            await webflowConfigRepository.updateWebflowConfig(project.id, config);
            toast.success('Webflow configuration saved');
        } catch (error) {
            toast.error('Failed to save Webflow configuration');
            throw error;
        }
    };

    const handleRemoveWebflowConfig = async () => {
        if (!project) return;
        try {
            await webflowConfigRepository.removeWebflowConfig(project.id);
            toast.success('Webflow configuration removed');
        } catch (error) {
            toast.error('Failed to remove Webflow configuration');
            throw error;
        }
    };

    const handleManualSitemapSync = async () => {
        if (!project) return;

        if (!project.sitemapUrl && !hasWebflowSync) {
            toast.error('No sitemap URL saved yet, and Webflow is not configured.');
            return;
        }

        setIsSyncingSitemap(true);
        try {
            const response = await fetch('/api/scan-sitemap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: project.id,
                    sitemapUrl: project.sitemapUrl,
                    useWebflowFallback: hasWebflowSync,
                }),
            });

            const data = await response.json() as {
                error?: string;
                totalFound?: number;
                count?: number;
                removed?: number;
                source?: 'sitemap' | 'webflow';
                usedWebflowFallback?: boolean;
            };

            if (!response.ok) {
                throw new Error(data?.error || 'Failed to sync sitemap');
            }

            const sourceLabel = data.source === 'webflow'
                ? data.usedWebflowFallback
                    ? 'Webflow fallback'
                    : 'Webflow'
                : 'Sitemap';

            toast.success(
                `${sourceLabel} sync completed: ${data?.totalFound ?? 0} pages checked, ${data?.count ?? 0} new, ${data?.removed ?? 0} removed`
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to sync sitemap';
            toast.error(message);
        } finally {
            setIsSyncingSitemap(false);
        }
    };

    const copyToClipboard = async (text: string): Promise<boolean> => {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            try {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.left = '-999999px';
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                const copied = document.execCommand('copy');
                document.body.removeChild(textarea);
                return copied;
            } catch {
                return false;
            }
        }
    };

    const handleShareAuditDashboard = async () => {
        if (!project || isCreatingShareLink) return;

        setIsCreatingShareLink(true);
        try {
            const shareUrl = await projectLinksRepository.createAuditShareLink(project.id);
            const copied = await copyToClipboard(shareUrl);

            if (copied) {
                toast.success('Public audit link copied to clipboard');
            } else {
                toast.info(`Share link: ${shareUrl}`, { duration: 12000 });
            }
        } catch (error) {
            console.error('Error creating public audit share link:', error);
            toast.error('Failed to create share link');
        } finally {
            setIsCreatingShareLink(false);
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
                <Button variant="outline" size="sm" onClick={handleShareAuditDashboard} disabled={isCreatingShareLink}>
                    {isCreatingShareLink ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Share2 className="mr-2 h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">Share</span>
                </Button>
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

                <ProjectTextCheckCard links={project.links} />

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
                            <div className="w-full sm:w-auto flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    className="gap-2"
                                    onClick={handleManualSitemapSync}
                                    disabled={isSyncingSitemap || !canSyncProject}
                                    title={syncButtonTitle}
                                >
                                    <RefreshCw className={`h-4 w-4 ${isSyncingSitemap ? 'animate-spin' : ''}`} />
                                    {syncButtonLabel}
                                </Button>
                                <ScanSitemapDialog
                                    projectId={project.id}
                                />
                            </div>
                        )}
                    </div>

                    <TabsContent value="audit" className="mt-4 sm:mt-6">
                            <WebsiteAuditDashboardScreen
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
