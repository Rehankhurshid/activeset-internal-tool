'use client';

import { useState, useEffect, use } from 'react';
import { useAuth } from '@/modules/auth-access';
import { EmbedDialog } from '@/modules/project-links';
import { projectLinksRepository } from '@/modules/project-links/infrastructure/project-links.repository';
import type { Project } from '@/modules/project-links';
import { ChecklistOverview } from '@/modules/checklists';
import { ProjectTimelineOverview } from '@/modules/timeline';
import { ProjectTextCheckCard, WebsiteAuditDashboardScreen } from '@/modules/site-monitoring';
import { WebflowPagesDashboard, webflowConfigRepository } from '@/modules/webflow';
import { InvoicesTab } from '@/modules/invoices';
import type { WebflowConfigInput } from '@/types/webflow';
import type { ProjectChecklist } from '@/types';
import { checklistService } from '@/services/ChecklistService';
import { useProjectTasks } from '@/hooks/useProjectTasks';
import { useProjectTimeline } from '@/hooks/useProjectTimeline';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Code, ImageIcon, LayoutDashboard, Globe, ListChecks, RefreshCw, Loader2, Share2, GanttChartSquare, Receipt, ListTodo, ChevronDown } from 'lucide-react';
import { ScanSitemapDialog } from '@/modules/project-links';
import { ImageLibrary } from '../components/ImageLibrary';
import { InlineEdit } from '@/components/ui/inline-edit';
import { AppNavigation } from '@/shared/ui';
import { TasksTab } from '@/components/tasks/TasksTab';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function ProjectDetailPage({ params }: PageProps) {
    const { id } = use(params);
    const { user, loading: authLoading, isAdmin, signInWithGoogle } = useAuth();
    const [project, setProject] = useState<Project | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEmbedDialogOpen, setIsEmbedDialogOpen] = useState(false);
    const [isSyncingSitemap, setIsSyncingSitemap] = useState(false);
    const [isCreatingShareLink, setIsCreatingShareLink] = useState(false);

    // Default to 'audit' tab
    const [activeTab, setActiveTab] = useState('audit');

    // Live data for tab stats — subscribed at the parent so badges update without
    // requiring the user to open each tab first.
    const { tasks } = useProjectTasks(project?.id);
    const { timeline } = useProjectTimeline(project?.id);
    const [checklists, setChecklists] = useState<ProjectChecklist[]>([]);

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

    useEffect(() => {
        if (!project?.id) return;
        const unsub = checklistService.subscribeToProjectChecklists(project.id, setChecklists);
        return () => unsub();
    }, [project?.id]);

    const hasWebflowSync = Boolean(project?.webflowConfig?.siteId && project?.webflowConfig?.hasApiToken);
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

    const handleUpdateProjectClient = async (newClient: string) => {
        if (!project) return;
        try {
            await projectLinksRepository.updateProjectClient(project.id, newClient);
            toast.success(newClient.trim() ? 'Client updated' : 'Client cleared');
        } catch (error) {
            console.error('Failed to update client:', error);
            toast.error('Failed to update client');
        }
    };

    const handleSaveWebflowConfig = async (config: WebflowConfigInput) => {
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

    const autoLinksCount = project.links.filter(l => l.source === 'auto').length;
    const openTaskCount = tasks.filter(t => t.status !== 'done').length;
    const checklistItems = checklists.flatMap(c => c.sections.flatMap(s => s.items));
    const checklistDone = checklistItems.filter(i => i.status === 'completed' || i.status === 'skipped').length;
    const checklistTotal = checklistItems.length;
    const timelineMilestones = timeline?.milestones?.length ?? 0;
    const timelinePhases = timeline?.phases?.length ?? 0;

    const auditStat: TabStat = { label: String(autoLinksCount), tone: autoLinksCount > 0 ? 'set' : 'unset' };
    const tasksStat: TabStat = { label: String(openTaskCount), tone: openTaskCount > 0 ? 'set' : 'unset' };
    const webflowStat: TabStat = hasWebflowSync
        ? { label: 'Set', tone: 'set' }
        : { label: 'Not Set', tone: 'unset' };
    const checklistStat: TabStat = checklistTotal > 0
        ? { label: `${checklistDone}/${checklistTotal}`, tone: 'set' }
        : { label: 'Not Set', tone: 'unset' };
    const timelineStat: TabStat = timelinePhases + timelineMilestones > 0
        ? { label: String(timelineMilestones || timelinePhases), tone: 'set' }
        : { label: 'Not Set', tone: 'unset' };

    const tabOptions: TabOption[] = [
        { value: 'audit', label: 'Audit Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, stat: auditStat },
        { value: 'tasks', label: 'Tasks', icon: <ListTodo className="h-4 w-4" />, stat: tasksStat },
        { value: 'webflow', label: 'Webflow Pages', icon: <Globe className="h-4 w-4" />, stat: webflowStat },
        { value: 'images', label: 'Image Library', icon: <ImageIcon className="h-4 w-4" /> },
        { value: 'checklist', label: 'Checklist', icon: <ListChecks className="h-4 w-4" />, stat: checklistStat },
        { value: 'timeline', label: 'Timeline', icon: <GanttChartSquare className="h-4 w-4" />, stat: timelineStat },
        ...(isAdmin ? [{ value: 'invoices', label: 'Invoices', icon: <Receipt className="h-4 w-4" /> }] : []),
    ];
    const activeTabOption = tabOptions.find(t => t.value === activeTab) ?? tabOptions[0];

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
                        <div className="flex flex-wrap items-center gap-2 text-muted-foreground mt-1">
                            <Badge variant="secondary" className="font-mono text-xs">
                                {project.links.filter(l => l.source !== 'auto').length} links
                            </Badge>
                            <div className="flex items-center gap-1 text-xs">
                                <Building2 className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                                <InlineEdit
                                    value={project.client ?? ''}
                                    onSave={handleUpdateProjectClient}
                                    placeholder="Add client…"
                                    className="text-xs"
                                    displayClassName="text-xs"
                                    inputClassName="h-7 text-xs w-48"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <Tabs defaultValue="audit" value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
                        {/* Mobile: Sheet selector — single button shows current tab and opens full list */}
                        <div className="sm:hidden">
                            <MobileTabSelector
                                options={tabOptions}
                                value={activeTab}
                                activeOption={activeTabOption}
                                onChange={setActiveTab}
                            />
                        </div>

                        {/* Desktop: scrollable horizontal tabs */}
                        <div className="hidden sm:block max-w-full overflow-x-auto -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            <TabsList className="w-auto inline-flex">
                                {tabOptions.map(opt => (
                                    <TabsTrigger key={opt.value} value={opt.value} className="gap-2">
                                        {opt.icon}
                                        <span>{opt.label}</span>
                                        {opt.stat && <TabStatBadge stat={opt.stat} />}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </div>

                        {/* Show Scan Sitemap when in audit tab */}
                        {activeTab === 'audit' && (
                            <div className="w-full sm:w-auto flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    className="gap-2 flex-1 sm:flex-none"
                                    onClick={handleManualSitemapSync}
                                    disabled={isSyncingSitemap || !canSyncProject}
                                    title={syncButtonTitle}
                                >
                                    <RefreshCw className={`h-4 w-4 ${isSyncingSitemap ? 'animate-spin' : ''}`} />
                                    <span className="truncate">{syncButtonLabel}</span>
                                </Button>
                                <ScanSitemapDialog
                                    projectId={project.id}
                                />
                            </div>
                        )}
                    </div>

                    <TabsContent value="audit" className="mt-4 sm:mt-6 space-y-4 sm:space-y-6">
                        <ProjectTextCheckCard links={project.links.filter(l => l.source === 'auto')} />
                        <WebsiteAuditDashboardScreen
                            links={project.links.filter(l => l.source === 'auto')}
                            projectId={project.id}
                            folderPageTypes={project.folderPageTypes}
                            detectedLocales={project.detectedLocales}
                            pathToLocaleMap={project.pathToLocaleMap}
                            imageScanJob={project.imageScanJob}
                        />
                    </TabsContent>

                    <TabsContent value="tasks" className="mt-4 sm:mt-6">
                        <TasksTab
                            projectId={project.id}
                            userEmail={user?.email ?? ''}
                            clickupListId={project.clickupListId}
                            clickupListName={project.clickupListName}
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

                    <TabsContent value="images" className="mt-4 sm:mt-6">
                        <ImageLibrary
                            links={project.links.filter(l => l.source === 'auto')}
                            projectName={project.name}
                            projectId={project.id}
                            sitemapUrl={project.sitemapUrl}
                        />
                    </TabsContent>

                    <TabsContent value="checklist" className="mt-4 sm:mt-6">
                        <ChecklistOverview
                            projectId={project.id}
                            userEmail={user?.email ?? undefined}
                        />
                    </TabsContent>

                    <TabsContent value="timeline" className="mt-4 sm:mt-6">
                        <ProjectTimelineOverview
                            projectId={project.id}
                            userEmail={user?.email ?? undefined}
                        />
                    </TabsContent>

                    {isAdmin && (
                        <TabsContent value="invoices" className="mt-4 sm:mt-6">
                            <InvoicesTab
                                projectId={project.id}
                                proposalId={project.proposalId}
                                projectTags={project.tags}
                            />
                        </TabsContent>
                    )}
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

type TabStat = { label: string; tone: 'set' | 'unset' };

function TabStatBadge({ stat, className }: { stat: TabStat; className?: string }) {
    return (
        <Badge
            variant={stat.tone === 'set' ? 'secondary' : 'outline'}
            className={cn(
                'h-5 px-1.5 text-[10px] font-mono leading-none tabular-nums',
                stat.tone === 'unset' && 'text-muted-foreground/70 border-dashed',
                className,
            )}
        >
            {stat.label}
        </Badge>
    );
}

type TabOption = { value: string; label: string; icon: React.ReactNode; stat?: TabStat };

interface MobileTabSelectorProps {
    options: TabOption[];
    value: string;
    activeOption: TabOption;
    onChange: (value: string) => void;
}

function MobileTabSelector({ options, value, activeOption, onChange }: MobileTabSelectorProps) {
    const [open, setOpen] = useState(false);
    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button
                    variant="outline"
                    className="w-full justify-between h-11 px-3 text-base"
                    aria-haspopup="menu"
                >
                    <span className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 text-muted-foreground">{activeOption.icon}</span>
                        <span className="font-medium truncate">{activeOption.label}</span>
                        {activeOption.stat && <TabStatBadge stat={activeOption.stat} />}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-xl p-0 max-h-[80vh]">
                <SheetHeader className="border-b">
                    <SheetTitle className="text-base">Select section</SheetTitle>
                </SheetHeader>
                <div className="p-2">
                    {options.map(opt => {
                        const isActive = opt.value === value;
                        return (
                            <button
                                key={opt.value}
                                onClick={() => {
                                    onChange(opt.value);
                                    setOpen(false);
                                }}
                                className={cn(
                                    "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors",
                                    isActive
                                        ? "bg-accent text-accent-foreground"
                                        : "hover:bg-accent/60 active:bg-accent"
                                )}
                            >
                                <span className={cn("shrink-0", isActive ? "text-foreground" : "text-muted-foreground")}>{opt.icon}</span>
                                <span className="text-sm font-medium flex-1">{opt.label}</span>
                                {opt.stat && <TabStatBadge stat={opt.stat} />}
                                {isActive && <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />}
                            </button>
                        );
                    })}
                </div>
            </SheetContent>
        </Sheet>
    );
}
