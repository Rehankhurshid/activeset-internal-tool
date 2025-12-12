'use client';

import { Button } from "@/components/ui/button";
import { Plus, FileText, Trash2, Pencil, Settings } from "lucide-react";
import { Proposal, ProposalTemplate } from "../types/Proposal";
import StatisticsCards from "./StatisticsCards";
import ProposalCard from "./ProposalCard";
import EmptyState from "./EmptyState";
import Link from 'next/link';
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from "@/components/ui/hover-card";

interface DashboardProps {
    proposals: Proposal[];
    templates: ProposalTemplate[];
    actionLoading: string | null;
    onCreateProposal: () => void;
    onCreateFromTemplate: (template: ProposalTemplate) => void;
    onEditTemplate: (template: ProposalTemplate) => void;
    onDeleteTemplate: (templateId: string) => void;
    onViewProposal: (proposal: Proposal) => void;
    onEditProposal: (proposal: Proposal) => void;
    onShareProposal: (proposalId: string) => void;
    onDeleteProposal: (proposalId: string) => void;
}

export default function Dashboard({
    proposals,
    templates,
    actionLoading,
    onCreateProposal,
    onCreateFromTemplate,
    onEditTemplate,
    onDeleteTemplate,
    onViewProposal,
    onEditProposal,
    onShareProposal,
    onDeleteProposal
}: DashboardProps) {
    return (
        <div className="min-h-screen bg-background p-4 md:p-6 pt-20">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-semibold text-foreground">Proposal Manager</h1>
                        <p className="text-muted-foreground mt-1">Create, manage, and share professional proposals</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link href="/modules/proposal/settings">
                            <Button variant="outline" size="icon">
                                <Settings className="w-4 h-4" />
                            </Button>
                        </Link>
                        <HoverCard openDelay={100} closeDelay={200}>
                            <HoverCardTrigger asChild>
                                <Button className="flex items-center gap-2">
                                    <Plus className="w-4 h-4" />
                                    New Proposal
                                </Button>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-64 p-2" align="end">
                                <div className="space-y-1">
                                    <button
                                        onClick={onCreateProposal}
                                        className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-left"
                                    >
                                        <Plus className="w-4 h-4 text-muted-foreground" />
                                        <div>
                                            <div className="font-medium">Blank Proposal</div>
                                            <div className="text-xs text-muted-foreground">Start from scratch</div>
                                        </div>
                                    </button>

                                    {templates.length > 0 && (
                                        <>
                                            <div className="border-t my-2" />
                                            <div className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                                Templates
                                            </div>
                                            {templates.map(template => (
                                                <div key={template.id} className="flex items-center group min-w-0">
                                                    <button
                                                        onClick={() => onCreateFromTemplate(template)}
                                                        className="flex-1 flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-left min-w-0 overflow-hidden"
                                                    >
                                                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                                                        <span className="truncate">{template.name}</span>
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onEditTemplate(template);
                                                        }}
                                                        className="p-1.5 rounded hover:bg-accent opacity-0 group-hover:opacity-100 transition-all"
                                                        title="Edit template"
                                                    >
                                                        <Pencil className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onDeleteTemplate(template.id);
                                                        }}
                                                        className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all mr-1"
                                                        title="Delete template"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                </div>
                            </HoverCardContent>
                        </HoverCard>
                    </div>
                </div>

                {/* Stats */}
                <StatisticsCards proposals={proposals} />

                {/* Proposals List */}
                <div className="grid gap-4">
                    {proposals.map((proposal) => (
                        <ProposalCard
                            key={proposal.id}
                            proposal={proposal}
                            actionLoading={actionLoading}
                            onView={onViewProposal}
                            onEdit={onEditProposal}
                            onShare={onShareProposal}
                            onDelete={onDeleteProposal}
                        />
                    ))}
                </div>

                {proposals.length === 0 && (
                    <EmptyState onCreateProposal={onCreateProposal} />
                )}
            </div>
        </div>
    );
}
