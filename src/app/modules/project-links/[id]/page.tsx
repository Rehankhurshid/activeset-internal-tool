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
import { AuditDashboard } from '@/components/projects/AuditDashboard';
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

        const unsubscribe = projectsService.subscribeToProject(
            id,
            (updatedProject) => {
                setProject(updatedProject);
                setIsLoading(false);
            }
        );

        return () => unsubscribe();
    }, [user, id]);

    const handleSaveName = async (name: string) => {
        if (!project) return;
        await projectsService.updateProjectName(project.id, name);
    };

    const handleAddLink = async (title: string, url: string) => {
        if (!project) return;
        await projectsService.addLinkToProject(project.id, {
            title,
            url,
            order: project.links.length,
            isDefault: false,
        });
    };

    if (authLoading || accessLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center p-8">
                <div className="w-full max-w-4xl space-y-8">
                    <div className="space-y-3">
                        <Skeleton className="h-12 w-48" />
                        <Skeleton className="h-4 w-64" />
                    </div>
                    <Skeleton className="h-64 w-full" />
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

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center space-y-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    <p className="text-muted-foreground">Loading project...</p>
                </div>
            </div>
        );
    }

    if (!project) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center max-w-md p-8">
                    <h1 className="text-2xl font-bold mb-4">Project Not Found</h1>
                    <p className="text-muted-foreground mb-6">
                        The project you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
                    </p>
                    <Link href="/modules/project-links">
                        <Button>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Projects
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Header */}
            <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="flex h-16 items-center px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-4 flex-1">
                        <Link href="/modules/project-links">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                        </Link>
                        <div className="h-6 w-px bg-border" />
                        <InlineEdit
                            value={project.name}
                            onSave={handleSaveName}
                            placeholder="Project name"
                            className="text-xl font-semibold"
                        />
                        <Badge variant="secondary" className="hidden sm:inline-flex">
                            <LinkIcon className="h-3 w-3 mr-1" />
                            {project.links.length} {project.links.length === 1 ? 'link' : 'links'}
                        </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsEmbedDialogOpen(true)}
                        >
                            <Code className="h-4 w-4 mr-2" />
                            Embed
                        </Button>
                        <ModeToggle />
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto p-6 lg:p-8 max-w-5xl">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <div className="flex items-center justify-between">
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
                    </div>

                    <TabsContent value="links" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <h2 className="text-lg font-semibold">Manage Project Links</h2>
                            </CardHeader>
                            <CardContent>
                                {project.links.length > 0 ? (
                                    <LinkList projectId={project.id} links={project.links} />
                                ) : (
                                    <div className="text-center py-12 text-muted-foreground">
                                        <LinkIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                        <p className="mb-4">No links added yet</p>
                                        <AddLinkDialog
                                            onAddLink={async (title, url) => {
                                                await executeAddLink(() => handleAddLink(title, url));
                                            }}
                                            trigger={
                                                <Button variant="outline">
                                                    <Plus className="h-4 w-4 mr-2" />
                                                    Add Your First Link
                                                </Button>
                                            }
                                        />
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="audit" className="space-y-4">
                        <AuditDashboard links={project.links} />
                    </TabsContent>
                </Tabs>
            </main>

            {/* Embed Dialog */}
            <EmbedDialog
                isOpen={isEmbedDialogOpen}
                onOpenChange={setIsEmbedDialogOpen}
                projectId={project.id}
                projectName={project.name}
            />
        </div>
    );
}
