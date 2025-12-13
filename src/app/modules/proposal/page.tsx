'use client';

import { useState, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import Dashboard from './components/Dashboard';
import ProposalEditor from './components/ProposalEditor';
import ProposalViewer from './components/ProposalViewer';
import LoadingScreen from './components/LoadingScreen';
import { proposalService } from './services/ProposalService';
import { templateService } from './services/TemplateService';
import { Proposal, ProposalTemplate, ViewType } from './types/Proposal';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ShieldX } from 'lucide-react';

export default function ProposalPage() {
    const { hasAccess, loading: accessLoading } = useModuleAccess('proposal');
    const { user, isAuthenticated, signInWithGoogle, loading: authLoading } = useAuth();

    const [currentView, setCurrentView] = useState<ViewType>('dashboard');
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
    const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
    const [editingTemplate, setEditingTemplate] = useState<ProposalTemplate | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // All useEffect hooks must be called before any early returns
    useEffect(() => {
        if (isAuthenticated && hasAccess) {
            loadProposals();
            loadTemplates();
            checkForSharedProposal();
        }
    }, [isAuthenticated, hasAccess]);

    const loadTemplates = async () => {
        try {
            const data = await templateService.getTemplates();
            setTemplates(data);
        } catch (error) {
            console.error('Error loading templates:', error);
        }
    };

    const checkForSharedProposal = async () => {
        if (typeof window === 'undefined') return;
        const urlParams = new URLSearchParams(window.location.search);
        const shareToken = urlParams.get('share');

        if (shareToken) {
            try {
                const sharedProposal = await proposalService.getSharedProposal(shareToken);
                setSelectedProposal(sharedProposal);
                setCurrentView('viewer');
                toast.success('Viewing shared proposal');
            } catch (error) {
                toast.error('Failed to load shared proposal');
                console.error('Error loading shared proposal:', error);
            }
        }
    };

    const loadProposals = async () => {
        try {
            setLoading(true);
            const data = await proposalService.getProposals();
            setProposals(data);
        } catch (error) {
            toast.error('Failed to load proposals');
            console.error('Error loading proposals:', error);
        } finally {
            setLoading(false);
        }
    };

    // Show access denied if not authenticated or no module access
    if (authLoading || accessLoading) {
        return <LoadingScreen message="Checking access..." />;
    }

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
                <div className="text-center max-w-md p-8 bg-gray-800/50 rounded-2xl border border-gray-700">
                    <h1 className="text-2xl font-bold text-white mb-4">Proposal Module</h1>
                    <p className="text-gray-400 mb-6">Sign in with your @activeset.co email to access proposals.</p>
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
                        You don&apos;t have permission to access the Proposals module.
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

    const handleCreateProposal = () => {
        setSelectedProposal(null);
        setCurrentView('editor');
    };

    const handleCreateFromTemplate = (template: ProposalTemplate) => {
        // Create a new proposal pre-filled with template data
        const newProposal: Proposal = {
            id: '',
            title: '',
            clientName: '',
            agencyName: 'ActiveSet',
            status: 'draft',
            createdAt: new Date().toISOString().split('T')[0],
            updatedAt: new Date().toISOString().split('T')[0],
            data: { ...template.data }
        };
        setSelectedProposal(newProposal);
        setCurrentView('editor');
    };

    const handleDeleteTemplate = async (templateId: string) => {
        if (!confirm('Are you sure you want to delete this template?')) return;
        try {
            await templateService.deleteTemplate(templateId);
            await loadTemplates();
            toast.success('Template deleted successfully');
        } catch (error) {
            toast.error('Failed to delete template');
            console.error('Error deleting template:', error);
        }
    };

    const handleEditTemplate = (template: ProposalTemplate) => {
        setEditingTemplate(template);
        // Create a proposal object from the template for editing
        const templateAsProposal: Proposal = {
            id: '',
            title: template.name,
            clientName: '',
            agencyName: 'ActiveSet',
            status: 'draft',
            createdAt: new Date().toISOString().split('T')[0],
            updatedAt: new Date().toISOString().split('T')[0],
            data: { ...template.data }
        };
        setSelectedProposal(templateAsProposal);
        setCurrentView('editor');
    };

    const handleSaveAsTemplate = async (name: string, data: Proposal['data']) => {
        try {
            if (editingTemplate) {
                // Updating existing template
                await templateService.updateTemplate(editingTemplate.id, name, data);
                setEditingTemplate(null);
                toast.success('Template updated successfully');
            } else {
                // Creating new template
                await templateService.saveTemplate(name, data);
                toast.success('Template saved successfully');
            }
            await loadTemplates();
        } catch (error) {
            toast.error('Failed to save template');
            console.error('Error saving template:', error);
        }
    };

    const handleEditProposal = (proposal: Proposal) => {
        setSelectedProposal(proposal);
        setCurrentView('editor');
    };

    const handleViewProposal = (proposal: Proposal) => {
        setSelectedProposal(proposal);
        setCurrentView('viewer');
    };

    const handleSaveProposal = async (proposalData: Proposal) => {
        try {
            setActionLoading('saving');

            // Check if we're updating an existing proposal (has an id) or creating a new one
            if (selectedProposal && selectedProposal.id) {
                const updatedProposal = await proposalService.updateProposal(selectedProposal.id, proposalData);
                setProposals(prev => prev.map(p => p.id === updatedProposal.id ? updatedProposal : p));
                toast.success('Proposal updated successfully');
            } else if (user) {
                const newProposal = await proposalService.createProposal(proposalData, user);
                setProposals(prev => [...prev, newProposal]);
                toast.success('Proposal created successfully');
            } else {
                toast.error('You must be logged in to create a proposal');
                return;
            }

            setCurrentView('dashboard');
        } catch (error) {
            toast.error('Failed to save proposal');
            console.error('Error saving proposal:', error);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDeleteProposal = async (proposalId: string) => {
        if (!confirm('Are you sure you want to delete this proposal?')) return;

        try {
            setActionLoading(proposalId);
            await proposalService.deleteProposal(proposalId);
            setProposals(prev => prev.filter(p => p.id !== proposalId));
            toast.success('Proposal deleted successfully');
        } catch (error) {
            toast.error('Failed to delete proposal');
            console.error('Error deleting proposal:', error);
        } finally {
            setActionLoading(null);
        }
    };

    const shareProposal = async (proposalId: string) => {
        setActionLoading(`share-${proposalId}`);

        // Generate the URL synchronously first (before any async operations)
        // This maintains the user gesture context for clipboard access
        const shareUrl = `${window.location.origin}/view/${proposalId}`;

        // Try to copy immediately while still in user gesture context
        let copied = false;
        try {
            await navigator.clipboard.writeText(shareUrl);
            copied = true;
        } catch {
            // Fallback: try textarea method
            try {
                const textArea = document.createElement('textarea');
                textArea.value = shareUrl;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                copied = document.execCommand('copy');
                document.body.removeChild(textArea);
            } catch {
                copied = false;
            }
        }

        // Now sync to Firestore in background
        try {
            await proposalService.createShareLink(proposalId);
            if (copied) {
                toast.success('Share link copied to clipboard!');
            } else {
                toast.info(`Share link: ${shareUrl}`, { duration: 10000 });
            }
        } catch (error) {
            // Even if Firestore sync fails, the proposal should already be in shared_proposals
            // from the original save, so the link will still work
            console.error('Error syncing share link:', error);
            if (copied) {
                toast.success('Share link copied to clipboard!');
            } else {
                toast.info(`Share link: ${shareUrl}`, { duration: 10000 });
            }
        } finally {
            setActionLoading(null);
        }
    };

    if (currentView === 'editor') {
        const handleEditorCancel = () => {
            setEditingTemplate(null);
            setCurrentView('dashboard');
        };

        const handleDeleteEditingTemplate = () => {
            if (editingTemplate) {
                templateService.deleteTemplate(editingTemplate.id);
                loadTemplates();
                toast.success('Template deleted successfully');
            }
        };

        return (
            <>
                <ProposalEditor
                    proposal={selectedProposal}
                    editingTemplate={editingTemplate}
                    onSave={handleSaveProposal}
                    onSaveAsTemplate={handleSaveAsTemplate}
                    onDeleteTemplate={handleDeleteEditingTemplate}
                    onCancel={handleEditorCancel}
                    loading={actionLoading === 'saving'}
                />
                <Toaster />
            </>
        );
    }

    if (currentView === 'viewer' && selectedProposal) {
        return (
            <>
                <ProposalViewer
                    proposal={selectedProposal}
                    onBack={() => setCurrentView('dashboard')}
                />
                <Toaster />
            </>
        );
    }

    if (loading) {
        return <LoadingScreen message="Loading proposals..." />;
    }

    return (
        <>
            <div className="fixed top-4 left-4 z-50">
                <Link href="/">
                    <Button variant="outline" className="flex items-center gap-2">
                        <ArrowLeft className="w-4 h-4" />
                        Back to Dashboard
                    </Button>
                </Link>
            </div>
            <Dashboard
                proposals={proposals}
                templates={templates}
                actionLoading={actionLoading}
                onCreateProposal={handleCreateProposal}
                onCreateFromTemplate={handleCreateFromTemplate}
                onEditTemplate={handleEditTemplate}
                onDeleteTemplate={handleDeleteTemplate}
                onViewProposal={handleViewProposal}
                onEditProposal={handleEditProposal}
                onShareProposal={shareProposal}
                onDeleteProposal={handleDeleteProposal}
            />
            <Toaster />
        </>
    );
}
