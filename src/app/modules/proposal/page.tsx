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
import { copyToClipboard } from './utils/proposalUtils';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function ProposalPage() {
    const [currentView, setCurrentView] = useState<ViewType>('dashboard');
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
    const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
    const [editingTemplate, setEditingTemplate] = useState<ProposalTemplate | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        loadProposals();
        loadTemplates();
        checkForSharedProposal();
    }, []);

    const loadTemplates = () => {
        const data = templateService.getTemplates();
        setTemplates(data);
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

    const handleDeleteTemplate = (templateId: string) => {
        if (!confirm('Are you sure you want to delete this template?')) return;
        templateService.deleteTemplate(templateId);
        loadTemplates();
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

    const handleSaveAsTemplate = (name: string, data: Proposal['data']) => {
        if (editingTemplate) {
            // Updating existing template
            templateService.updateTemplate(editingTemplate.id, name, data);
            setEditingTemplate(null);
            toast.success('Template updated successfully');
        } else {
            // Creating new template
            templateService.saveTemplate(name, data);
            toast.success('Template saved successfully');
        }
        loadTemplates();
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
            } else {
                const newProposal = await proposalService.createProposal(proposalData);
                setProposals(prev => [...prev, newProposal]);
                toast.success('Proposal created successfully');
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
        try {
            setActionLoading(`share-${proposalId}`);
            const shareUrl = await proposalService.createShareLink(proposalId);
            await copyToClipboard(shareUrl);
            toast.success('Share link copied to clipboard!');
        } catch (error) {
            toast.error('Failed to create share link');
            console.error('Error creating share link:', error);
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
