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
import { ArrowLeft, Link as LinkIcon, Plus, Code, ShieldX, LayoutDashboard, List } from 'lucide-react';
import Link from 'next/link';
import { LinkList } from '@/components/projects/LinkList';
import { AddLinkDialog } from '@/components/projects/AddLinkDialog';
import { EmbedDialog } from '@/components/projects/EmbedDialog';
import { WebsiteAuditDashboard } from '@/components/website-audit-dashboard';
import { ScanSitemapDialog } from '@/components/scan-sitemap-dialog';
import { InlineEdit } from '@/components/ui/inline-edit';
import { useAsyncOperation } from '@/hooks/useAsyncOperation';
import { ModeToggle } from '@/components/mode-toggle';

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

    // Default to 'audit' tab if there's data, else 'links'
    const [activeTab, setActiveTab] = useState('links');

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
        <div className="container mx-auto py-8 space-y-8">
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
                            className="text-3xl font-bold tracking-tight"
                        />
                        <div className="flex items-center gap-2 text-muted-foreground mt-1">
                            <Badge variant="secondary" className="font-mono text-xs">
                                {project.links.length} links
                            </Badge>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <ModeToggle />
                    <Button variant="outline" onClick={() => setIsEmbedDialogOpen(true)}>
                        <Code className="mr-2 h-4 w-4" />
                        Embed
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <Tabs defaultValue="links" value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex items-center justify-between mb-6">
                    <TabsList>
                        <TabsTrigger value="links" className="gap-2">
                            <List className="h-4 w-4" />
                            Links & Management
                        </TabsTrigger>
                        <TabsTrigger value="audit" className="gap-2">
                            <LayoutDashboard className="h-4 w-4" />
                            Audit Dashboard
                        </TabsTrigger>
                    </TabsList>

                    {/* Only show Add Link button when in links tab */}
                    {activeTab === 'links' && (
                        <AddLinkDialog
                            onAddLink={async (title, url) => {
                                await executeAddLink(() => handleAddLink(title, url));
                            }}
                            trigger={
                                <Button size="sm">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Link
                                </Button>
                            }
                        />
                    )}

                    {/* Show Scan Sitemap when in audit tab */}
                    {activeTab === 'audit' && (
                        <ScanSitemapDialog projectId={project.id} />
                    )}
                </div>

                <TabsContent value="links" className="mt-6">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <h3 className="text-lg font-semibold">Project Links</h3>
                                <p className="text-sm text-muted-foreground">Manage the links tracked in this project.</p>
                            </div>
                            {project.links.length === 0 && (
                                <AddLinkDialog
                                    onAddLink={async (title, url) => {
                                        await executeAddLink(() => handleAddLink(title, url));
                                    }}
                                    trigger={
                                        <Button size="sm">
                                            <Plus className="mr-2 h-4 w-4" />
                                            Add Link
                                        </Button>
                                    }
                                />
                            )}
                        </CardHeader>
                        <CardContent>
                            {project.links.filter(l => l.source !== 'auto').length > 0 ? (
                                <LinkList
                                    projectId={project.id}
                                    links={project.links.filter(l => l.source !== 'auto')}
                                />
                            ) : (
                                <div className="text-center py-12 text-muted-foreground">
                                    <LinkIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                    <p>No links added yet.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="audit" className="mt-6">
                    <WebsiteAuditDashboard links={project.links} projectId={project.id} />
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
