'use client';

import { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Plus, FileText, Trash2, Pencil, Settings, ChevronDown, ArrowUpDown, Calendar, Check } from "lucide-react";
import { cn } from "@/lib/utils";
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
    const [sortBy, setSortBy] = useState<'date' | 'title' | 'client' | 'amount'>('date');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [groupByMonth, setGroupByMonth] = useState(false);

    // Sorting Logic
    const sortedProposals = useMemo(() => {
        return [...proposals].sort((a, b) => {
            let res = 0;
            switch (sortBy) {
                case 'date':
                    res = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                    break;
                case 'title':
                    res = a.title.localeCompare(b.title);
                    break;
                case 'client':
                    res = a.clientName.localeCompare(b.clientName);
                    break;
                case 'amount':
                    // Remove currency symbols and commas for comparison
                    const amountA = parseFloat(a.data.pricing.total.replace(/[^0-9.-]+/g, '')) || 0;
                    const amountB = parseFloat(b.data.pricing.total.replace(/[^0-9.-]+/g, '')) || 0;
                    res = amountA - amountB;
                    break;
            }
            return sortOrder === 'asc' ? res : -res;
        });
    }, [proposals, sortBy, sortOrder]);

    // Grouping Logic
    const groupedProposals = useMemo(() => {
        if (!groupByMonth) return { 'All Proposals': sortedProposals };

        const groups: Record<string, Proposal[]> = {};
        sortedProposals.forEach(proposal => {
            const date = new Date(proposal.createdAt);
            const key = date.toLocaleString('default', { month: 'long', year: 'numeric' });
            if (!groups[key]) groups[key] = [];
            groups[key].push(proposal);
        });
        return groups;
    }, [sortedProposals, groupByMonth]);

    return (
        <div className="min-h-screen bg-gradient-to-b from-background to-background/95">
            {/* Main Content */}
            <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
                {/* Stats & Action Row */}
                <div className="flex flex-col gap-6 mb-8">
                    <StatisticsCards proposals={proposals} />

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        {/* Sorting & Grouping Controls */}
                        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-9 gap-2">
                                        <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                                        <span className="hidden sm:inline">Sort:</span>
                                        <span className="font-medium">
                                            {sortBy === 'date' ? 'Date' :
                                                sortBy === 'title' ? 'Title' :
                                                    sortBy === 'client' ? 'Client' : 'Amount'}
                                        </span>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-48">
                                    <DropdownMenuLabel>Sort By</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => setSortBy('date')}>
                                        Date Created
                                        {sortBy === 'date' && <Check className="w-4 h-4 ml-auto" />}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setSortBy('title')}>
                                        Title
                                        {sortBy === 'title' && <Check className="w-4 h-4 ml-auto" />}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setSortBy('client')}>
                                        Client Name
                                        {sortBy === 'client' && <Check className="w-4 h-4 ml-auto" />}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setSortBy('amount')}>
                                        Total Amount
                                        {sortBy === 'amount' && <Check className="w-4 h-4 ml-auto" />}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>Order</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => setSortOrder('asc')}>
                                        Ascending
                                        {sortOrder === 'asc' && <Check className="w-4 h-4 ml-auto" />}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setSortOrder('desc')}>
                                        Descending
                                        {sortOrder === 'desc' && <Check className="w-4 h-4 ml-auto" />}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <div className="h-6 w-px bg-border mx-1" />

                            <Button
                                variant={groupByMonth ? "secondary" : "outline"}
                                size="sm"
                                onClick={() => setGroupByMonth(!groupByMonth)}
                                className={cn("h-9 gap-2", groupByMonth && "bg-secondary text-secondary-foreground")}
                            >
                                <Calendar className="w-4 h-4" />
                                <span className="hidden sm:inline">Group by Month</span>
                            </Button>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0 ml-auto">
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
                </div>

                {/* Proposals Grid */}
                {Object.keys(groupedProposals).length > 0 ? (
                    <div className="space-y-8">
                        {Object.entries(groupedProposals).map(([groupName, groupProposals]) => (
                            groupProposals.length > 0 && (
                                <div key={groupName} className="space-y-4">
                                    {groupByMonth && (
                                        <h3 className="text-lg font-semibold text-muted-foreground flex items-center gap-2">
                                            <Calendar className="w-4 h-4" />
                                            {groupName}
                                            <span className="text-xs font-normal bg-muted px-2 py-0.5 rounded-full">
                                                {groupProposals.length}
                                            </span>
                                        </h3>
                                    )}
                                    <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
                                        {groupProposals.map((proposal) => (
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
                                </div>
                            )
                        ))}
                    </div>
                ) : (
                    <EmptyState onCreateProposal={onCreateProposal} />
                )}
            </main>
        </div>
    );
}
