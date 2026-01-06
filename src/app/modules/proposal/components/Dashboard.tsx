'use client';

import { Button } from "@/components/ui/button";
import { Plus, FileText, Trash2, Pencil, Settings, ChevronDown } from "lucide-react";
import { Proposal, ProposalTemplate } from "../types/Proposal";
import StatisticsCards from "./StatisticsCards";
import ProposalCard from "./ProposalCard";
import EmptyState from "./EmptyState";
import Link from 'next/link';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
        <div className="min-h-screen bg-gradient-to-b from-background to-background/95">
            {/* Main Content */}
            <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
                {/* Stats & Action Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 sm:mb-6">
                    <StatisticsCards proposals={proposals} />

                    <div className="flex items-center gap-2 shrink-0">
                        <Link href="/modules/proposal/settings">
                            <Button variant="ghost" size="icon" className="h-9 w-9">
                                <Settings className="w-4 h-4" />
                                <span className="sr-only">Settings</span>
                            </Button>
                        </Link>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button className="gap-2 shrink-0">
                                    <Plus className="w-4 h-4" />
                                    <span className="hidden sm:inline">New</span>
                                    <ChevronDown className="w-3 h-3 opacity-50 hidden sm:inline" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem onClick={onCreateProposal}>
                                    <Plus className="w-4 h-4 mr-2" />
                                    Blank Proposal
                                </DropdownMenuItem>

                                {templates.length > 0 && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
                                            From Template
                                        </DropdownMenuLabel>
                                        {templates.map(template => (
                                            <div key={template.id} className="flex items-center group">
                                                <DropdownMenuItem
                                                    className="flex-1"
                                                    onClick={() => onCreateFromTemplate(template)}
                                                >
                                                    <FileText className="w-4 h-4 mr-2" />
                                                    <span className="truncate">{template.name}</span>
                                                </DropdownMenuItem>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onEditTemplate(template);
                                                    }}
                                                    className="p-1.5 rounded hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity"
                                                    aria-label={`Edit template ${template.name}`}
                                                >
                                                    <Pencil className="w-3 h-3" />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDeleteTemplate(template.id);
                                                    }}
                                                    className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 mr-1 transition-opacity"
                                                    aria-label={`Delete template ${template.name}`}
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* Proposals Grid */}
                {proposals.length > 0 ? (
                    <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
                ) : (
                    <EmptyState onCreateProposal={onCreateProposal} />
                )}
            </main>
        </div>
    );
}
